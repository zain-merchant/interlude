// UI audit flags.
//
// Each change lives in its own folder here, NN-name/:
//   index.js   what it is: export default { id, n, title, group, issue,
//              notes, settings }
//   style.css  its styles, every rule scoped under :root[data-flag-<id>]
//   (and, when it can't be done in CSS, small hooks in components that
//   read flag('<id>') or setting('<id>', '<key>') from this file)
//
// Every flag is on by default but the worst-case test data. A flag that is
// off is exactly the app as it was, so All off in the panel is the app
// before the audit. The audit's panel (panel/FlagPanel.svelte, dev builds
// only) turns them on and off and tunes their settings; this file is the one
// place the picks live. A production build has no panel, and reads and keeps
// no picks: every flag and setting has its default. To drop a gate, keep
// its folder's changes and remove its flag() checks and its attribute.
// The list of what's on, and what was removed and why, is in README.md.
//
// Settings: { key: { type: 'range', min, max, step, default, unit? } }
// becomes the CSS variable --flag-<id>-<key>; { type: 'choice', options:
// [[value, label], ...], default } becomes :root[data-flag-<id>-<key>=value].
// Only each flag's default export: a flag's `show` (its Show me steps and
// the panel's words for it) is for the dev-only panel, which reads it itself
// (show/show.svelte.js), so it stays out of production builds.
const modules = import.meta.glob('./*/index.js', { eager: true, import: 'default' });
import.meta.glob('./*/style.css', { eager: true });

/** @typedef {{ id: string, n: number, title: string, group?: string, issue?: string, notes?: string, superseded?: string, byDefault?: boolean, settings?: Record<string, any> }} Flag */
/** @type {Flag[]} */
export const FLAGS = Object.values(modules)
  .map((m) => /** @type {any} */ (m))
  .filter(Boolean)
  .sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));

// Picks saved before the final look was the default are under 'interlude.flags'
// (left alone); they'd keep it off for anyone who had opened the panel.
const KEY = 'interlude.flags.final';
function read() {
  if (!import.meta.env.DEV) return {}; // a production build has only the defaults
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
const saved = read();

/**
 * Whether a flag is on when nothing's been picked for it: everything is,
 * but one that sets `byDefault: false` (the worst-case test data).
 */
export const onByDefault = (/** @type {Flag} */ f) => f.byDefault ?? true;
const pickedOn = (/** @type {Flag} */ f) => saved.on?.[f.id] ?? onByDefault(f);

export const flags = $state({
  /** @type {Record<string, boolean>} */
  on: Object.fromEntries(FLAGS.map((f) => [f.id, pickedOn(f)])),
  /** @type {Record<string, Record<string, any>>} */
  settings: Object.fromEntries(
    FLAGS.map((f) => [
      f.id,
      Object.fromEntries(Object.entries(f.settings ?? {}).map(([k, s]) => [k, saved.settings?.[f.id]?.[k] ?? s.default])),
    ]),
  ),
  /** Choice settings marked as decided: { [flag id]: { [setting key]: value } }. */
  /** @type {Record<string, Record<string, any>>} */
  locked: saved.locked && typeof saved.locked === 'object' ? saved.locked : {},
});

/**
 * The direction (#110): a whole-app look that sits on top of the fixes. A
 * Show me for a fix pauses it (show/show.svelte.js).
 */
export const isDirection = (/** @type {Flag | undefined} */ f) => f?.id === 'dir-room-tint';
export const DIRECTIONS = FLAGS.filter(isDirection).map((f) => f.id);

/** Whether a flag is on. */
export const flag = (/** @type {string} */ id) => flags.on[id] ?? false;
/** A flag's setting (its default while the flag is off is still returned). */
export const setting = (/** @type {string} */ id, /** @type {string} */ key) => flags.settings[id]?.[key];

/** The recommended value of a choice setting: its `recommended`, or else its default. */
export const recommended = (/** @type {any} */ s) => s?.recommended ?? s?.default;
/** Whether a choice setting is locked in (decided), and to what. */
export const lockedAt = (/** @type {string} */ id, /** @type {string} */ key) => flags.locked[id]?.[key];
/** Locks a choice setting at its current value, or unlocks it. */
export function setLocked(/** @type {string} */ id, /** @type {string} */ key, /** @type {boolean} */ on) {
  if (on) flags.locked[id] = { ...(flags.locked[id] ?? {}), [key]: flags.settings[id][key] };
  else if (flags.locked[id]) {
    const { [key]: _, ...rest } = flags.locked[id];
    if (Object.keys(rest).length) flags.locked[id] = rest;
    else delete flags.locked[id];
  }
}
/** Everything picked, for the panel's export: what's on, every setting, and what's locked in. */
export const picks = () => JSON.parse(JSON.stringify({ on: flags.on, settings: flags.settings, locked: flags.locked }));

/** Bumped each time the flags are applied to <html>: canvases that read CSS colours compare it to know when to read them again. */
let rev = 0;
export const flagsRev = () => rev;
/** Reads every flag and setting, so an effect that calls it runs again when any of them changes. */
export function watchFlags() {
  for (const f of FLAGS) {
    void flags.on[f.id];
    for (const k in flags.settings[f.id]) void flags.settings[f.id][k];
  }
}

function apply() {
  rev++;
  const root = document.documentElement;
  for (const f of FLAGS) {
    const on = !!flags.on[f.id];
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
    if (!import.meta.env.DEV) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ defaults: 1, on: flags.on, settings: flags.settings, locked: flags.locked }));
    } catch {}
  });
});
apply();
