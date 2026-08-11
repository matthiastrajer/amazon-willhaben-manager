#!/usr/bin/env node
/**
 * Packs dist/ into a zip for upload to the Chrome Web Store.
 * Uses the system `zip` binary; run `npm run build` first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, `amazon-willhaben-manager-${version}.zip`);

try {
  execFileSync('zip', ['-r', '-q', output, '.'], { cwd: dist, stdio: 'inherit' });
  console.log(`✔ ${path.relative(root, output)}`);
} catch {
  console.error('Packing failed — is the `zip` command available on this system?');
  process.exit(1);
}
