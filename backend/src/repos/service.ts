import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { db } from '../db/index.js';
import type { RepoRoot } from '../db/schema.js';

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export interface DiscoveredProject {
  name: string;
  absolutePath: string;
  rootId: string;
  rootLabel: string;
  isRoot?: boolean;
  gitInfo?: {
    branch: string;
    isDirty: boolean;
  };
}

function getGitInfo(path: string): DiscoveredProject['gitInfo'] | undefined {
  if (!existsSync(join(path, '.git'))) return undefined;

  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: path,
      encoding: 'utf8',
      timeout: 1000,
    }).trim();

    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: path,
      encoding: 'utf8',
      timeout: 1000,
    }).trim();

    return {
      branch,
      isDirty: status.length > 0,
    };
  } catch {
    return undefined;
  }
}

/**
 * Scans all configured Repository Roots and returns a list of immediate subdirectories,
 * plus the roots themselves.
 */
export function discoverProjects(): DiscoveredProject[] {
  const roots = db.prepare('SELECT * FROM repo_roots').all() as RepoRoot[];
  const projects: DiscoveredProject[] = [];

  for (const root of roots) {
    const expandedPath = expandPath(root.absolute_path);
    if (!existsSync(expandedPath)) continue;

    // Add the root itself as a project option
    projects.push({
      name: root.label,
      absolutePath: expandedPath,
      rootId: root.id,
      rootLabel: root.label,
      isRoot: true,
      gitInfo: getGitInfo(expandedPath),
    });

    try {
      const items = readdirSync(expandedPath);
      for (const item of items) {
        if (item.startsWith('.')) continue;

        const fullPath = join(expandedPath, item);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            projects.push({
              name: item,
              absolutePath: fullPath,
              rootId: root.id,
              rootLabel: root.label,
              gitInfo: getGitInfo(fullPath),
            });
          }
        } catch {
          // Skip inaccessible
        }
      }
    } catch (err) {
      console.error(`[repos] Failed to scan root ${expandedPath}:`, err);
    }
  }

  return projects;
}
