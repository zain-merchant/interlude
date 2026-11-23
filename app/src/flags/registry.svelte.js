// UI audit flags.
//
// Each change being tried lives in its own folder here, NN-name/:
//   index.js   what it is: export default { id, n, title, group, issue,
//              notes, settings }
//   style.css  its styles, every rule scoped under :root[data-flag-<id>]
//   (and, when it can't be done in CSS, small hooks in components that
//   read flag('<id>') or setting('<id>', '<key>') from this file)
//
// The recommended fixes are on by default (the owner: "the UI polish things
// you can leave on as default"); the rest stay off: the directions, the
// "against the doc" alternatives and the worst-case test data. The "against
// the doc" fixes (not the directions) are disabled (`disabled: '<why>'`):
// always off, with no switch in the panel, until the owner agrees to bring
// one back. A flag that is off is exactly the app as it was, so All off in
// the panel is upstream's app. The audit's panel (panel/FlagPanel.svelte, dev builds only) turns
// them on and off and tunes their settings; this file stays the one place
// the picks live. To ship one, keep its folder's changes and drop its gate.
// The list of what's on by default, and why the rest isn't, is in README.md.
//
// Settings: { key: { type: 'range', min, max, step, default, unit? } }
// becomes the CSS variable --flag-<id>-<key>; { type: 'choice', options:
// [[value, label], ...], default } becomes :root[data-flag-<id>-<key>=value].
// Only each flag's default export: a flag's `show` (its Show me steps and
// the panel's words for it) is for the dev-only panel, which reads it itself
// (show/show.svelte.js), so it stays out of production builds.
const modules = import.meta.glob('./*/index.js', { eager: true, import: 'default' });
import.meta.glob('./*/style.css', { eager: true });

/** @typedef {{ id: string, n: number, title: string, group?: string, issue?: string, notes?: string, against?: string, superseded?: string, disabled?: string, byDefault?: boolean, settings?: Record<string, any> }} Flag */
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

/**
 * Whether a flag is on when nothing's been picked for it: every fix is, but
 * not a direction (#92 and up), a flag that goes against the design doc
 * (`against`), one that sets `byDefault: false` (the worst-case test data),
 * or a disabled one.
 */
export const onByDefault = (/** @type {Flag} */ f) => !f.disabled && (f.byDefault ?? (f.group !== 'Direction' && !f.against));
/**
 * Picks saved before there were defaults (no `defaults` mark) stored every
 * flag, mostly false, so they can't tell "turned off" from "never touched":
 * they keep what was on and take the defaults for the rest. From then on a
 * saved pick, on or off, wins over the default.
 */
const pickedOn = (/** @type {Flag} */ f) =>
  !isDisabled(f) && (saved.defaults ? (saved.on?.[f.id] ?? onByDefault(f)) : !!saved.on?.[f.id] || onByDefault(f));

/**
 * Disabled flags (`disabled: '<why>'` in their index.js) are a third state
 * beside on and off: kept in the code but always off, whatever was saved or
 * whatever turns them on (the panel has no switch for them, and the effect
 * below puts them back off). Turning one back on means deleting its
 * `disabled` line, after talking it over with the owner (README.md).
 */
export const isDisabled = (/** @type {Flag | undefined} */ f) => !!f?.disabled;
const DISABLED = new Set(FLAGS.filter(isDisabled).map((f) => f.id));
/** The flags the panel can turn on and off: every one but the disabled. */
export const LIVE = FLAGS.filter((f) => !isDisabled(f));

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
 * The visual directions (#92 and up, the "Direction" group): whole-app looks
 * that sit on top of the fixes. They're opt-in, one at a time, and a Show me
 * for a fix pauses them (show/show.svelte.js).
 */
export const isDirection = (/** @type {Flag | undefined} */ f) => f?.group === 'Direction';
export const DIRECTIONS = FLAGS.filter(isDirection).map((f) => f.id);

/** Whether a flag is on. */
export const flag = (/** @type {string} */ id) => !DISABLED.has(id) && (flags.on[id] ?? false);
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
    const on = !DISABLED.has(f.id) && !!flags.on[f.id];
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
    // A disabled flag that something turned on (a show, an old pick) goes back off.
    for (const id of DISABLED) if (flags.on[id]) flags.on[id] = false;
    apply();
    try {
      localStorage.setItem(KEY, JSON.stringify({ defaults: 1, on: flags.on, settings: flags.settings, locked: flags.locked }));
    } catch {}
  });
});
apply();
