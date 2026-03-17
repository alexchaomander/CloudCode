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
    
    // Test relative path
    expect(validateWorkdir(root, './repo')).toBe(fs.realpathSync(child));
    
    // Test absolute path
    expect(validateWorkdir(root, child)).toBe(fs.realpathSync(child));
    
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects escaping repo root via dot-dot', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-out-'));
    
    expect(() => validateWorkdir(root, '..')).toThrow('escapes repository root');
    
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('rejects non-existent paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcode-root-'));
    
    expect(() => validateWorkdir(root, './non-existent')).toThrow('does not exist');
    
    fs.rmSync(root, { recursive: true, force: true });
  });
});
