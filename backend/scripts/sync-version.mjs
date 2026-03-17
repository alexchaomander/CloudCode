#!/usr/bin/env node
// Updates the @humans-of-ai/cloudcode version pin inside packages/cloudcode/package.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node sync-version.mjs <version>');
  process.exit(1);
}

const shimPkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'packages', 'cloudcode', 'package.json'
);

const pkg = JSON.parse(readFileSync(shimPkgPath, 'utf8'));
pkg.dependencies['@humans-of-ai/cloudcode'] = version;
writeFileSync(shimPkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated @humans-of-ai/cloudcode → ${version} in cloudcode shim`);
