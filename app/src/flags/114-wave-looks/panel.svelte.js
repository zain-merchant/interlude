// #114 (UI audit flag): wave-looks' switcher, dev builds only (main.js).
//
// A DialKit panel (vendored in dialkit/) with the look and the sliders that
// look has. It shows only when asked for: ⌥W, or turning the flag on in the
// flags panel. Its × closes it and keeps the look. The registry holds the
// values; the panel reads and writes them there. ⌥W with the panel open goes
// to the next look and ⌥⇧W back; ⌥1 to ⌥6 pick one, panel or not. No app
// shortcut uses ⌥.
import { flags, flag, setting } from '../registry.svelte.js';
import { showToast } from '../../lib/undo.svelte.js';
import { LOOKS, LINES, CHIPS, PLAYED, PARAMS, lookOf } from './looks.js';
import { lookNow } from './look.js';

const ID = 'wave-looks';
let kit = null;
let busy = false;
let shown = '';
/** Whether the panel shows. */
let up = false;
const show = (v) => document.documentElement.toggleAttribute('data-wave-panel', (up = v));

const look = lookNow;
const value = (l, k) => Number(setting(ID, `${l.id}-${k}`) ?? l.values[k]);
const toggles = new Set(['lock']);
const name = (k) => PARAMS[k][0] + (PARAMS[k][4] ? ` (${PARAMS[k][4]})` : '');

/** The choices every look but Today shares: the control's name, its setting, its options. */
/** @type {[string, string, any[]][]} */
const SHARED = [['Beat marks', 'marks', LINES], ['Bar number', 'chip', CHIPS], ['Played half', 'played', PLAYED]];

/** The panel's controls for a look; `at` gives each value's start (its default, for DialKit's reset). */
function config(l) {
  const c = { Look: { type: 'select', options: LOOKS.map((x, i) => ({ value: x.id, label: `${i + 1}  ${x.name}` })), default: 'exact' }, ...(l.draw ? Object.fromEntries(SHARED.map(([n, , o]) => [n, { type: 'select', options: o.map(([value, label]) => ({ value, label })), default: o[0][0] }])) : {}), 'Copy values': { type: 'action' } };
  for (const [k, v] of Object.entries(l.values)) {
    const [, min, max, step, , folder] = PARAMS[k];
    // The folder that matters most for the look starts open.
    (c[folder] ??= folder === (l.values.w ? 'Marks' : 'Smoothing') ? {} : { _collapsed: true })[name(k)] = toggles.has(k) ? !!v : [v, min, max, step];
  }
  if (l.draw) c['Put this look back'] = { type: 'action' };
  return c;
}
const values = (l) => {
  const v = { Look: l.id, ...(l.draw ? Object.fromEntries(SHARED.map(([n, k]) => [n, setting(ID, k)])) : {}) };
  for (const k in l.values) (v[PARAMS[k][5]] ??= {})[name(k)] = toggles.has(k) ? !!value(l, k) : value(l, k);
  return v;
};

/** Every value of the look, as text: what's changed from its defaults is marked. */
function text() {
  const l = look();
  const lines = [`Waveform: ${l.name}`];
  if (l.draw) for (const [n, k, o] of SHARED) lines.push(`${n}: ${o.find(([v]) => v === setting(ID, k))?.[1]}`);
  for (const k in l.values) {
    const v = value(l, k);
    lines.push(`${PARAMS[k][0]}: ${toggles.has(k) ? (v ? 'on' : 'off') : `${v}${PARAMS[k][4] && ` ${PARAMS[k][4]}`}`}${v === l.values[k] ? '' : ` (was ${l.values[k]})`}`);
  }
  return lines.join('\n');
}
async function copy() {
  const t = text();
  try {
    await navigator.clipboard.writeText(t);
    showToast('Copied the waveform values');
  } catch {
    // The clipboard can be refused (no focus): the old way still works from a click.
    const a = document.createElement('textarea');
    a.value = t;
    document.body.append(a);
    a.select();
    const ok = document.execCommand('copy');
    a.remove();
    showToast(ok ? 'Copied the waveform values' : "Couldn't copy the waveform values");
  }
}
function reset() {
  const l = look();
  for (const k in l.values) flags.settings[ID][`${l.id}-${k}`] = l.values[k];
  fill();
}

/** Puts the current look's controls and values in the panel. */
function fill() {
  if (!kit || !up) return;
  const l = look();
  busy = true;
  if (shown !== l.id) kit.updateConfig(config(l));
  shown = l.id;
  kit.setValues(values(l));
  busy = false;
}
function read(v) {
  if (busy) return;
  if (v.Look !== look().id) return pick(v.Look, false);
  const l = look();
  for (const [n, k] of SHARED) if (v[n] && v[n] !== setting(ID, k)) flags.settings[ID][k] = v[n];
  for (const k in l.values) {
    const x = v[PARAMS[k][5]]?.[name(k)];
    if (x !== undefined && Number(x) !== value(l, k)) flags.settings[ID][`${l.id}-${k}`] = Number(x);
  }
}
let picking = false;
function pick(id, say = true) {
  picking = !flag(ID);
  flags.on[ID] = true;
  flags.settings[ID].pick = id;
  // After DialKit's own update has settled.
  queueMicrotask(fill);
  if (say) showToast(lookOf(id).name);
}

const typing = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable;
function key(e) {
  if (!e.altKey || e.metaKey || e.ctrlKey || typing(e.target)) return;
  const at = LOOKS.findIndex((l) => l.id === look().id);
  let to = -1;
  if (e.code === 'KeyW' && !up) {
    // Asks for the panel; the look stays.
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) (flags.settings[ID].pick = look().id), (flags.on[ID] = true), open();
    return;
  }
  if (e.code === 'KeyW') to = (at + (e.shiftKey ? LOOKS.length - 1 : 1)) % LOOKS.length;
  else if (/^Digit\d$/.test(e.code) && !e.shiftKey) to = Number(e.code.slice(5)) - 1;
  if (!LOOKS[to]) return;
  e.preventDefault();
  e.stopPropagation();
  if (!e.repeat) pick(LOOKS[to].id);
}

async function open() {
  show(true);
  if (kit) return fill();
  const [{ default: DK }] = await Promise.all([import('./dialkit/dialkit.js'), import('./dialkit/styles.css')]);
  if (kit) return;
  DK.createDialRoot({ position: 'bottom-left', theme: 'dark', defaultOpen: true });
  shown = look().id;
  kit = DK.createDialKit('Waveform', config(look()), { id: 'interlude-wave', persist: false, onAction: (p) => (p === 'Copy values' ? copy() : reset()) });
  fill();
  kit.subscribe(read, false);
  const css = document.createElement('style');
  // Hidden until it's asked for; clear of the waveforms; and without
  // DialKit's own copy and versions (they'd be lost on reload: the registry keeps the values).
  css.textContent = `:root:not([data-wave-panel]) .dialkit-root, .dialkit-root .dialkit-panel-toolbar, .dialkit-root .dialkit-versions { display: none !important; }
    .dialkit-panel[data-position='bottom-left'] .dialkit-panel-inner { max-height: calc(100vh - 190px) !important; }`;
  document.head.append(css);
  // Keys in the panel are the panel's: they don't reach the app's shortcuts
  // (a slider's arrows would nudge a deck).
  // Its × (and its title, which folds it) closes it instead: nothing is left
  // over the app. A drag of the title is a drag.
  const box = document.querySelector('.dialkit-root');
  const title = (e) => /** @type {Element} */ (e.target).closest?.('.dialkit-folder-header-top')?.closest('.dialkit-folder')?.matches('.dialkit-folder-root');
  let down = /** @type {number[] | null} */ (null);
  box?.addEventListener('pointerdown', (/** @type {any} */ e) => (down = [e.clientX, e.clientY]), true);
  const close = (/** @type {any} */ e) => {
    if (!title(e) || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
    if (e.type === 'click' && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    e.preventDefault();
    e.stopPropagation();
    show(false);
  };
  box?.addEventListener('click', close, true);
  box?.addEventListener('keydown', close, true);
  for (const type of ['keydown', 'keyup']) document.querySelector('.dialkit-root')?.addEventListener(type, (e) => e.stopPropagation());
}

addEventListener('keydown', key, true);
let was = flag(ID);
$effect.root(() => {
  $effect(() => {
    const on = flag(ID);
    // Turned on by hand in the flags panel, not by ⌥1 to ⌥6 or a reload.
    if (on && !was && !picking) open();
    if (!on) show(false);
    was = on;
    picking = false;
    void setting(ID, 'pick');
    if (up) queueMicrotask(fill);
  });
});
