#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node sync-version.mjs <version>');
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function updateJson(relPath, updateFn) {
  const filePath = join(repoRoot, relPath);
  if (!existsSync(filePath)) {
    return false;
  }

  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  updateFn(json);
  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
  return true;
}

const updated = [];

for (const relPath of ['package.json', 'backend/package.json', 'frontend/package.json']) {
  const changed = updateJson(relPath, (pkg) => {
    pkg.version = version;
  });

  if (changed) {
    updated.push(relPath);
  }
}

const lockfileChanged = updateJson('package-lock.json', (lockfile) => {
  lockfile.version = version;

  if (lockfile.packages?.['']) {
    lockfile.packages[''].version = version;
  }

  if (lockfile.packages?.backend) {
    lockfile.packages.backend.version = version;
  }

  if (lockfile.packages?.frontend) {
    lockfile.packages.frontend.version = version;
  }
});

if (lockfileChanged) {
  updated.push('package-lock.json');
}

if (updated.length === 0) {
  console.error('No release metadata files found to update.');
  process.exit(1);
}

console.log(`Updated release version to ${version} in: ${updated.join(', ')}`);
