#!/usr/bin/env node
/**
 * Builds the extension into dist/.
 *
 * Pass 1 (app):     popup + dashboard HTML pages and the MV3 service worker as
 *                   ES modules. This pass empties dist/ and copies public/.
 * Pass 2..n (content): one IIFE bundle per content script. Chrome cannot load
 *                   ES module content scripts from the manifest, and Vite's
 *                   library mode allows exactly one entry per IIFE build, so
 *                   each content script gets its own pass.
 *
 * Finally the built manifest is validated so a broken dist/ never ships.
 */
import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

const CONTENT_ENTRIES = ['content-amazon', 'content-willhaben', 'content-ebay'];
const watch = process.argv.includes('--watch');

async function run() {
  process.env.BUILD_TARGET = 'app';
  delete process.env.CONTENT_ENTRY;
  console.log('\n▶ building app bundles (popup, dashboard, service worker)…');
  await build({ configFile: path.join(root, 'vite.config.ts'), mode: 'production' });

  for (const entry of CONTENT_ENTRIES) {
    process.env.BUILD_TARGET = 'content';
    process.env.CONTENT_ENTRY = entry;
    console.log(`\n▶ building content script: ${entry}…`);
    await build({ configFile: path.join(root, 'vite.config.ts'), mode: 'production' });
  }

  process.env.BUILD_TARGET = 'app';
  delete process.env.CONTENT_ENTRY;

  await verify();
}

async function verify() {
  const problems = [];
  const manifestPath = path.join(dist, 'manifest.json');

  if (!existsSync(manifestPath)) {
    problems.push('dist/manifest.json is missing');
  } else {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');

    const required = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []),
      ...(manifest.web_accessible_resources ?? []).flatMap((r) => r.resources ?? []),
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {}),
    ].filter(Boolean);

    for (const rel of required) {
      const clean = rel.split('?')[0];
      // web_accessible_resources may use globs such as "icons/*"; for those the
      // containing directory is what has to exist.
      const target = clean.includes('*') ? path.dirname(clean) : clean;
      if (!existsSync(path.join(dist, target))) {
        problems.push(`manifest references missing file: ${rel}`);
      }
    }

    // A content script that still contains a bare `import` statement would fail
    // to load in Chrome — catch that here rather than in the browser.
    for (const entry of CONTENT_ENTRIES) {
      const file = path.join(dist, `${entry}.js`);
      if (!existsSync(file)) {
        problems.push(`content script bundle missing: ${entry}.js`);
        continue;
      }
      const code = await readFile(file, 'utf8');
      if (/^\s*import\s+[^(]/m.test(code) || /^\s*export\s/m.test(code)) {
        problems.push(`${entry}.js is not a self-contained IIFE (contains import/export)`);
      }
    }
  }

  if (problems.length) {
    console.error('\n✖ build verification failed:');
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }

  console.log('\n✔ build complete and verified → dist/');
  console.log('  Load it via chrome://extensions → Entwicklermodus → "Entpackte Erweiterung laden" → dist auswählen\n');
}

if (watch) {
  console.log('watch mode: rebuilding on change is not supported for multi-pass builds; re-run `npm run build:only`.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
