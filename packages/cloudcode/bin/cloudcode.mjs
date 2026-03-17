#!/usr/bin/env node
// Shim — delegates to @humans-of-ai/cloudcode
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cliPath = require.resolve('@humans-of-ai/cloudcode/dist/cli.js');

import(cliPath);
