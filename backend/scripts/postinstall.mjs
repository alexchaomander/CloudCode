#!/usr/bin/env node
import { copyFileSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, '..', 'bin');

const platform = process.platform;
const arch = process.arch;

const platformKey =
  platform === 'darwin' && arch === 'arm64' ? 'darwin-arm64' :
  platform === 'darwin' && arch === 'x64'   ? 'darwin-x64'   :
  platform === 'linux'  && arch === 'x64'   ? 'linux-x64'    :
  platform === 'linux'  && arch === 'arm64' ? 'linux-arm64'  :
  null;

const dest = join(binDir, 'cloudcode-pty-sidecar');

// In dev (built from source), the binary is already in place — skip.
if (existsSync(dest)) process.exit(0);

if (!platformKey) {
  console.warn(`[cloudcode] Unsupported platform: ${platform}/${arch}. PTY sidecar not installed.`);
  console.warn('[cloudcode] You can build it manually: cd node_modules/@humans-of-ai/cloudcode/sidecar && go build -o ../bin/cloudcode-pty-sidecar ./cmd/cloudcode-pty-sidecar');
  process.exit(0);
}

const src = join(binDir, `cloudcode-pty-sidecar-${platformKey}`);

if (!existsSync(src)) {
  console.warn(`[cloudcode] Pre-built sidecar not found for ${platformKey}. Run: npm run build:sidecar`);
  process.exit(0);
}

copyFileSync(src, dest);
chmodSync(dest, 0o755);
console.log(`[cloudcode] PTY sidecar installed for ${platformKey}`);
