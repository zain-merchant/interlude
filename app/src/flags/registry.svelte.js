// UI audit flags.
//
// Each change being tried lives in its own folder here, NN-name/:
//   index.js   what it is: export default { id, n, title, group, issue,
//              notes, settings }
//   style.css  its styles, every rule scoped under :root[data-flag-<id>]
//   (and, when it can't be done in CSS, small hooks in components that
//   read flag('<id>') or setting('<id>', '<key>') from this file)
//
// All flags are off by default, and off is exactly the app as it was. The
// DialKit panel (FlagDials.svelte, dev builds only) turns them on and tunes
// their settings; this file stays the one place the picks live. To ship
// one, keep its folder's changes and drop its gate.
//
// Settings: { key: { type: 'range', min, max, step, default, unit? } }
// becomes the CSS variable --flag-<id>-<key>; { type: 'choice', options:
// [[value, label], ...], default } becomes :root[data-flag-<id>-<key>=value].
// Only each flag's default export: a flag's `show` (its Show me steps) is
// for the dev-only FlagDials, which reads it itself (show/show.svelte.js), so
// it stays out of production builds.
const modules = import.meta.glob('./*/index.js', { eager: true, import: 'default' });
import.meta.glob('./*/style.css', { eager: true });

/** @typedef {{ id: string, n: number, title: string, group?: string, issue?: string, notes?: string, settings?: Record<string, any> }} Flag */
/** @type {Flag[]} */
export const FLAGS = Object.values(modules)
  .map((m) => /** @type {any} */ (m))
  .filter(Boolean)
  .sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));

const KEY = 'interlude.flags';
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
const saved = read();

export const flags = $state({
  /** @type {Record<string, boolean>} */
  on: Object.fromEntries(FLAGS.map((f) => [f.id, !!saved.on?.[f.id]])),
  /** @type {Record<string, Record<string, any>>} */
  settings: Object.fromEntries(
    FLAGS.map((f) => [
      f.id,
      Object.fromEntries(Object.entries(f.settings ?? {}).map(([k, s]) => [k, saved.settings?.[f.id]?.[k] ?? s.default])),
    ]),
  ),
});

/** Whether a flag is on. */
export const flag = (/** @type {string} */ id) => flags.on[id] ?? false;
/** A flag's setting (its default while the flag is off is still returned). */
export const setting = (/** @type {string} */ id, /** @type {string} */ key) => flags.settings[id]?.[key];

function apply() {
  const root = document.documentElement;
  for (const f of FLAGS) {
    const on = flags.on[f.id];
    root.toggleAttribute(`data-flag-${f.id}`, on);
    for (const [k, s] of Object.entries(f.settings ?? {})) {
      const v = flags.settings[f.id][k];
      if (s.type === 'choice') {
        if (on) root.setAttribute(`data-flag-${f.id}-${k}`, String(v));
        else root.removeAttribute(`data-flag-${f.id}-${k}`);
      } else {
        root.style.setProperty(`--flag-${f.id}-${k}`, `${v}${s.unit ?? ''}`);
      }
    }
  }
}

$effect.root(() => {
  $effect(() => {
    apply();
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: flags.on, settings: flags.settings }));
    } catch {}
  });
});
apply();
