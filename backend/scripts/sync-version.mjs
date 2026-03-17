#!/usr/bin/env node
// Updates the @getcloudcode/cli version pin inside packages/cloudcode/package.json
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
pkg.dependencies['@getcloudcode/cli'] = version;
writeFileSync(shimPkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated @getcloudcode/cli → ${version} in cloudcode shim`);
