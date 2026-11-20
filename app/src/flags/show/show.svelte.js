// "Show me" (dev builds only): turns a flag on, sets the app up so its
// change is on screen, highlights where it is, and draws the flag's visual
// aid over the app until it's dismissed. Each flag describes this in an
// optional `show` export in its index.js (see ../README.md). This file is
// only reached from FlagDials.svelte, which only loads in dev builds, so none
// of it (nor any flag's `show`) ships.
import { FLAGS, flags } from '../registry.svelte.js';
import { kit, setFlag, setSetting, wait } from './app.js';
import { createOverlay, createDraw } from './overlay.js';

const modules = import.meta.glob('../*/index.js', { eager: true });
/** @type {Record<string, any>} flag id → its show */
export const SHOWS = Object.fromEntries(
  Object.values(modules)
    .map((m) => /** @type {any} */ (m))
    .filter((m) => m.default && m.show)
    .map((m) => [m.default.id, m.show]),
);

const PENDING = 'interlude.flags.show-pending';
const HIGHLIGHT_S = 4.5;

export const current = $state({
  /** @type {string | null} */ id: null,
  note: '',
  error: '',
  busy: false,
  /** Whether the visual aid is drawn. */
  aid: true,
  hasAid: false,
  hasReplay: false,
  /** @type {DOMRect[]} where the targets are, for the panel to keep clear of */
  avoid: [],
});

let overlay = /** @type {ReturnType<typeof createOverlay> | null} */ (null);
let timer = 0;
let run = 0;
/** @type {any} */
let ctx = {};
/** The show running, for its cleanup. */
let active = /** @type {any} */ (null);

/** The targets as rects (a show's target is a selector, elements or rects). */
function targetRects(show) {
  const els = targets(show);
  return els.map((e) => (e instanceof Element ? e.getBoundingClientRect() : e)).filter((r) => r && r.width > 0 && r.height > 0);
}
function targets(show) {
  try {
    const t = typeof show.target === 'function' ? show.target(kit, ctx) : show.target ? kit.$$(show.target) : [];
    return (Array.isArray(t) ? t : [t]).filter(Boolean);
  } catch {
    return [];
  }
}

/** Ends the current show: the overlay goes, the app stays as it is. */
export function stopShow() {
  run++;
  clearInterval(timer);
  try {
    active?.cleanup?.(kit, ctx);
  } catch {}
  active = null;
  overlay?.destroy();
  overlay = null;
  ctx = {};
  Object.assign(current, { id: null, note: '', error: '', busy: false, hasAid: false, hasReplay: false, avoid: [] });
}

/** Runs flag `id`'s show. */
export async function showMe(id, resumed = false) {
  const f = FLAGS.find((x) => x.id === id);
  const show = SHOWS[id];
  if (!f || !show) return;
  stopShow();
  active = show;
  const me = run;
  Object.assign(current, { id, note: show.note ?? '', busy: true, hasAid: !!show.aid, hasReplay: !!show.replay, aid: true });
  try {
    // Flags the show needs too (stress-data, with a reload).
    const needs = { ...(show.needs ?? {}) };
    let reload = false;
    for (const [nid, set] of Object.entries(needs)) {
      if (!flags.on[nid]) ((flags.on[nid] = true), (reload ||= nid === 'stress-data'));
      for (const [k, v] of Object.entries(typeof set === 'object' ? set : {}))
        if (flags.settings[nid][k] !== v) ((flags.settings[nid][k] = v), (reload ||= nid === 'stress-data'));
    }
    if (!flags.on[id]) {
      setFlag(id, true);
      if (show.reload) reload = true;
    }
    if (reload && !resumed) {
      sessionStorage.setItem(PENDING, id);
      await wait(50); // the registry saves the picks
      location.reload();
      return;
    }
    await kit.reset();
    if (me !== run) return;
    ctx = {};
    await show.setup?.(kit, ctx);
    if (me !== run) return;
    const first = targets(show).find((e) => e instanceof Element);
    first?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await wait(60);
  } catch (e) {
    if (me !== run) return;
    current.error = String(/** @type {any} */ (e)?.message ?? e);
  }
  if (me !== run) return;
  current.busy = false;
  current.avoid = targetRects(show);
  overlay = createOverlay();
  const t0 = performance.now();
  let aidFailed = false;
  const tick = () => {
    if (me !== run || !overlay) return;
    const t = (performance.now() - t0) / 1000;
    const d = createDraw();
    if (t < HIGHLIGHT_S + 0.2) for (const r of targetRects(show)) d.highlight(r, t);
    if (current.aid && show.aid && !aidFailed) {
      try {
        show.aid(d, kit, ctx);
      } catch (e) {
        aidFailed = true;
        current.error = `Aid: ${/** @type {any} */ (e)?.message ?? e}`;
      }
    }
    overlay.render(d.done());
  };
  tick();
  timer = setInterval(tick, 100);
}

/** Plays the change again (an entrance, a toast), for shows that have one. */
export async function replay() {
  const show = current.id && SHOWS[current.id];
  if (!show?.replay) return;
  try {
    await show.replay(kit, ctx);
  } catch (e) {
    current.error = String(/** @type {any} */ (e)?.message ?? e);
  }
}

/** After a reload a show asked for, carry on with it. */
export async function resumePending() {
  const id = sessionStorage.getItem(PENDING);
  if (!id) return null;
  sessionStorage.removeItem(PENDING);
  // Wait for the app and its library to be up.
  await kit.until(() => kit.deck(0) && kit.rows().length, 8000, 'the app').catch(() => {});
  await wait(300);
  showMe(id, true);
  return id;
}

export { setSetting };

// A handle for scripted checks (screenshots of every Show me).
/** @type {any} */ (globalThis).__flagShow = { showMe, stopShow, replay, current, SHOWS };
