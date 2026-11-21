// Builds the website's animated pictures into site/demo/:
//
//   hero.html  the real app UI on the simulated engine, played by a
//              Stageshow script (loaded by site/index.html in an iframe)
//   cards.js   small Stageshow scenes for the feature cards
//
// Run `npm run build:site` in app/ and commit what it writes to site/demo.
// `npm run dev:site` serves the same pages with hot reload.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [tailwindcss(), svelte({
      configFile: here('../svelte.config.js'),
    }), react()],
  resolve: {
    alias: { $lib: here('../src/lib') },
  },
  server: { port: 1430, strictPort: true },
  build: {
    target: 'es2022',
    outDir: here('../../site/demo'),
    emptyOutDir: true,
    rollupOptions: {
      input: { hero: here('hero.html'), cards: here('cards.html') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // The cards' stylesheet keeps a fixed name: site/index.html links it.
        assetFileNames: (a) => (a.names?.[0] === 'cards.css' ? 'cards.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
});
