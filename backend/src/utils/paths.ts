import path from 'node:path';
import fs from 'node:fs';
import { homedir } from 'node:os';

function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Validates that a working directory is contained within a repository root.
 */
export function validateWorkdir(root: string, workdir: string): string {
  const expandedRoot = expandPath(root);
  const expandedWorkdir = expandPath(workdir);

  // Ensure the root itself exists and is a directory
  if (!fs.existsSync(expandedRoot)) {
    throw new Error(`Repository root does not exist: ${expandedRoot}`);
  }
  const rootStat = fs.statSync(expandedRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`Repository root is not a directory: ${expandedRoot}`);
  }

  const resolvedRoot = fs.realpathSync(expandedRoot);

  // Resolve the workdir relative to the root
  const absoluteWorkdir = path.isAbsolute(expandedWorkdir) ? expandedWorkdir : path.resolve(resolvedRoot, expandedWorkdir);

  // Check if it exists
  if (!fs.existsSync(absoluteWorkdir)) {
    throw new Error(`Working directory does not exist: ${absoluteWorkdir}`);
  }

  const resolvedWorkdir = fs.realpathSync(absoluteWorkdir);

  if (!resolvedWorkdir.startsWith(resolvedRoot)) {
    throw new Error(`Working directory escapes repository root: ${resolvedWorkdir}`);
  }

  return resolvedWorkdir;
}
