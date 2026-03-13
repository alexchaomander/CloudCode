import path from 'node:path';
import fs from 'node:fs';

/**
 * Validates that a working directory is contained within a repository root.
 * Resolves symlinks and dot-dot escapes to ensure the path is safe.
 */
export function validateWorkdir(root: string, workdir: string): string {
  // Ensure the root itself exists and is a directory
  if (!fs.existsSync(root)) {
    throw new Error(`Repository root does not exist: ${root}`);
  }
  const rootStat = fs.statSync(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Repository root is not a directory: ${root}`);
  }

  const resolvedRoot = fs.realpathSync(root);
  
  // Resolve the workdir relative to the root
  const absoluteWorkdir = path.isAbsolute(workdir) ? workdir : path.resolve(resolvedRoot, workdir);
  
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
