import path from 'node:path';
import fs from 'node:fs';

export function validateWorkdir(root: string, workdir: string) {
  const resolvedRoot = fs.realpathSync(root);
  const resolved = fs.realpathSync(path.resolve(root, workdir));
  if (!resolved.startsWith(resolvedRoot)) {
    throw new Error('Workdir escapes repository root');
  }
  return resolved;
}
