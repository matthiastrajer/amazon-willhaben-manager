import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const resolveAlias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

/**
 * The extension is built in several passes because Chrome MV3 treats the two
 * kinds of bundles very differently:
 *
 *  - "app"     -> popup + dashboard HTML pages and the service worker.
 *                 These may be ES modules and may be code-split.
 *  - "content" -> content scripts. Chrome does NOT support ES module content
 *                 scripts declared in the manifest, so each one has to be a
 *                 single self-contained IIFE with no chunk imports. Vite's lib
 *                 mode only accepts one entry per IIFE build, so the content
 *                 scripts are built one at a time via CONTENT_ENTRY.
 *
 * `scripts/build.mjs` orchestrates all passes.
 */
const target = process.env.BUILD_TARGET ?? 'app';
const contentEntry = process.env.CONTENT_ENTRY ?? '';

const appConfig: UserConfig = {
  plugins: [react()],
  resolve: { alias: resolveAlias },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('./src/popup/index.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./src/dashboard/index.html', import.meta.url)),
        'service-worker': fileURLToPath(
          new URL('./src/background/service-worker.ts', import.meta.url),
        ),
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        // Shared chunks are named after whichever module rollup picked first,
        // which reads as noise in dist/ — give them a neutral name instead.
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
};

function makeContentConfig(name: string, entry: string): UserConfig {
  return {
    resolve: { alias: resolveAlias },
    publicDir: false,
    define: {
      // Content scripts never run through Vite's dev pipeline.
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome110',
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry: fileURLToPath(new URL(entry, import.meta.url)),
        formats: ['iife'],
        name: `AWM_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  };
}

export const CONTENT_ENTRIES: Record<string, string> = {
  'content-amazon': './src/content/amazon/index.ts',
  'content-willhaben': './src/content/willhaben/index.ts',
  'content-ebay': './src/content/ebay/index.ts',
};

export default defineConfig(() => {
  if (target === 'content') {
    const entry = CONTENT_ENTRIES[contentEntry];
    if (!entry) {
      throw new Error(
        `Unknown CONTENT_ENTRY "${contentEntry}". Expected one of: ${Object.keys(CONTENT_ENTRIES).join(', ')}`,
      );
    }
    return makeContentConfig(contentEntry, entry);
  }
  return appConfig;
});
