import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateWorkdir } from './paths.js';

describe('validateWorkdir', () => {
  it('allows child directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-root-'));
    const child = path.join(root, 'repo');
    fs.mkdirSync(child);
    expect(validateWorkdir(root, './repo')).toBe(fs.realpathSync(child));
  });

  it('rejects escaping repo root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-out-'));
    expect(() => validateWorkdir(root, outside)).toThrow();
  });
});
