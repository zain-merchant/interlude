import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Leaves the flags' own words out of production builds: what describes a flag
 * (title, notes) and its settings (labels, options) is only for the panel,
 * which dev builds alone have. Only plain properties of a flag's
 * `export default { … }` are cut; anything else is left as it is.
 */
const WORDS = {
  flag: ['title', 'notes', 'group', 'issue', 'superseded'],
  setting: ['label', 'options', 'recommended', 'min', 'max', 'step'],
};
const flagWords = {
  name: 'flag-words',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/src\/flags\/\d+-[^/]+\/index\.js$/.test(id.split('?')[0])) return null;
    const decl = this.parse(code).body.find((n) => n.type === 'ExportDefaultDeclaration')?.declaration;
    if (decl?.type !== 'ObjectExpression') return null;
    const named = (o, name) => o.properties.find((p) => p.type === 'Property' && !p.computed && (p.key.name ?? p.key.value) === name);
    const cut = [];
    const drop = (o, names) => names.forEach((name) => named(o, name) && cut.push(named(o, name).value));
    drop(decl, WORDS.flag);
    const settings = named(decl, 'settings')?.value;
    if (settings?.type === 'ObjectExpression')
      for (const p of settings.properties) if (p.value?.type === 'ObjectExpression') drop(p.value, WORDS.setting);
    for (const n of cut.sort((a, b) => b.start - a.start)) code = `${code.slice(0, n.start)}undefined${code.slice(n.end)}`;
    return { code, map: null };
  },
};

// Tauri expects a fixed port and must see Rust errors in the terminal.
export default defineConfig({
  plugins: [tailwindcss(), svelte(), flagWords],
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022' },
});
