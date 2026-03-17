#!/usr/bin/env node
// Shim — delegates to @cloudcode/cli
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cliPath = require.resolve('@cloudcode/cli/dist/cli.js');

import(cliPath);
