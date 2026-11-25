// "Show me" (dev builds only): turns a flag on, sets the app up so its
// change is on screen, and then flips the flag off and on every couple of
// seconds, with a big Before / After label, so the difference is the thing
// that moves. The flag's visual aid is drawn over the app until Done. Each
// flag describes this in an optional `show` export in its index.js (see
// ../README.md). This file is only reached from the dev-only panel
// (../panel/FlagPanel.svelte), so none of it (nor any flag's `show`) ships.
import { FLAGS, flags, isDirection, DIRECTIONS } from '../registry.svelte.js';
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
/** How long the ring around the targets lasts (overlay.js fades it). */
const HIGHLIGHT_S = 2.8;
/** How long each of Before and After stays up while flipping. */
const PERIOD = 1700;
/** Slow motion for shows about movement: animations run at this rate. */
const SLOW = 0.25;

export const current = $state({
  /** @type {string | null} */ id: null,
  error: '',
  busy: false,
  /** Whether the visual aid is drawn. */
  aid: true,
  hasAid: false,
  hasReplay: false,
  /** 'before' (flag off) or 'after' (flag on). */
  phase: /** @type {'before' | 'after'} */ ('after'),
  /** Whether it flips between the two on its own. */
  flipping: false,
  /** Whether this show can flip at all (a flag that needs a reload can't). */
  canFlip: false,
  /** Movement shows: whether animations are slowed down. */
  slow: false,
  hasSlow: false,
  /** @type {DOMRect[]} where the targets are, for the card to keep clear of */
  avoid: [],
  /** Other flags that were on and hide this change: Before turns them off too (the show's `masks`). @type {string[]} */
  masked: [],
  /** Other flags that were on and override this change: off for the whole show (the show's `overrides`). @type {string[]} */
  overridden: [],
  /** Directions that were on, paused while a fix is shown (back on Done). @type {string[]} */
  paused: [],
});

let overlay = /** @type {ReturnType<typeof createOverlay> | null} */ (null);
let timer = 0;
let run = 0;
/** Bumped on every phase change, so a flip loop knows it's been overtaken. */
let turn = 0;
/** @type {any} */
let ctx = {};
/** The show running, for its cleanup. */
let active = /** @type {any} */ (null);
let slowRaf = 0;

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

/** Slows every running animation and transition in the app (not the overlay's own). */
function slowLoop() {
  cancelAnimationFrame(slowRaf);
  if (!current.slow) {
    for (const a of document.getAnimations()) if (a.playbackRate !== 1 && !isOverlay(a)) a.playbackRate = 1;
    return;
  }
  const step = () => {
    for (const a of document.getAnimations()) if (a.playbackRate !== SLOW && !isOverlay(a)) a.playbackRate = SLOW;
    slowRaf = requestAnimationFrame(step);
  };
  step();
}
const isOverlay = (a) => {
  const t = /** @type {any} */ (a.effect)?.target;
  return t instanceof Element && !!t.closest('.flag-show, .fp');
};

/**
 * Before means "as if this fix weren't made". Some fixes are hidden by
 * another flag that's on. When that flag does the same thing (a later flag
 * that took the change over), a show lists it in `masks`: Before turns it
 * off too, After puts it back. When it does something else to the same
 * thing (it overrides the change, so After would show it instead), the
 * show lists it in `overrides`: it's off for the whole show.
 */
const onOf = (ids) => (ids ?? []).filter((m) => flags.on[m]);

/**
 * What a show turned off, to turn back on: kept in sessionStorage too, so a
 * reload in the middle of a show (Vite's, or the user's) doesn't leave the
 * flag, its masks or a paused direction off for good.
 */
const RESTORE = 'interlude.flags.show-restore';
function remember(ids) {
  try {
    if (ids.length) sessionStorage.setItem(RESTORE, JSON.stringify(ids));
    else sessionStorage.removeItem(RESTORE);
  } catch {}
}
/** Puts back what the show turned off (masks, overrides, a paused direction). */
function restore() {
  for (const m of [...current.masked, ...current.overridden, ...current.paused]) if (!flags.on[m]) setFlag(m, true);
  remember([]);
}
// A show that was running when the page reloaded: put its flags back.
try {
  const left = JSON.parse(sessionStorage.getItem(RESTORE) ?? '[]');
  sessionStorage.removeItem(RESTORE);
  for (const m of left) if (m in flags.on) flags.on[m] = true;
} catch {}

/** Ends the current show: the overlay goes, the flag is left on. */
export function stopShow() {
  const id = current.id;
  run++;
  turn++;
  clearInterval(timer);
  try {
    active?.cleanup?.(kit, ctx);
  } catch {}
  current.slow = false;
  slowLoop();
  restore();
  if (id && active && !active.reload) setFlag(id, true);
  active = null;
  overlay?.destroy();
  overlay = null;
  ctx = {};
  Object.assign(current, { id: null, error: '', busy: false, hasAid: false, hasReplay: false, hasSlow: false, flipping: false, canFlip: false, phase: 'after', avoid: [], masked: [], overridden: [], paused: [] });
}

/** Puts the show in one phase (the flag off for 'before', on for 'after') and sets the app up for it again. */
async function enter(phase) {
  const me = ++turn;
  const show = active;
  const id = current.id;
  if (!show || !id) return;
  current.phase = phase;
  ctx.phase = phase;
  for (const m of current.masked) setFlag(m, phase === 'after');
  setFlag(id, phase === 'after');
  try {
    await show.each?.(kit, ctx, phase === 'after');
  } catch (e) {
    if (me === turn) current.error = String(/** @type {any} */ (e)?.message ?? e);
  }
  return me;
}

/** Flips Before → After → Before… until stopped or overtaken. */
async function flipLoop() {
  const show = active;
  const r = run;
  let me = await enter('before');
  while (current.flipping && run === r && me === turn) {
    await wait(show?.period ?? PERIOD);
    if (!current.flipping || run !== r || me !== turn) return;
    me = await enter(current.phase === 'before' ? 'after' : 'before');
  }
}

/** Pins one phase (stops flipping), from the card or a script. */
export async function setPhase(/** @type {'before' | 'after'} */ phase) {
  if (!current.id) return;
  current.flipping = false;
  await enter(phase);
}
/** Starts or stops flipping. */
export function setFlipping(on = true) {
  if (!current.id || !current.canFlip) return;
  current.flipping = on;
  if (on) flipLoop();
  else turn++;
}
export function setSlow(on = true) {
  current.slow = on;
  slowLoop();
}

/** Runs flag `id`'s show. */
export async function showMe(id, resumed = false) {
  const f = FLAGS.find((x) => x.id === id);
  const show = SHOWS[id];
  if (!f || !show) return;
  stopShow();
  active = show;
  const me = run;
  const canFlip = show.flip !== false && !show.reload;
  Object.assign(current, { id, busy: true, hasAid: !!show.aid, hasReplay: !!show.replay, aid: true, canFlip, flipping: false, phase: 'after', hasSlow: !!show.motion, slow: !!show.motion });
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
    // A direction restyles the whole app on top of the fixes; while a fix
    // is shown it's paused, so Before and After are today's app and the
    // fix (it comes back on Done).
    if (!isDirection(f)) {
      current.paused = onOf(DIRECTIONS);
      for (const d of current.paused) setFlag(d, false);
    }
    current.masked = onOf(show.masks);
    current.overridden = onOf(show.overrides);
    for (const m of current.overridden) setFlag(m, false);
    remember([...current.masked, ...current.overridden, ...current.paused, ...(show.reload ? [] : [id])]);
    await kit.reset();
    if (me !== run) return;
    ctx = { phase: 'after' };
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
  slowLoop();
  overlay = createOverlay();
  const t0 = performance.now();
  let aidFailed = false;
  let marked = '';
  const tick = () => {
    if (me !== run || !overlay) return;
    const t = (performance.now() - t0) / 1000;
    const rects = targetRects(show);
    const d = createDraw({ targets: rects });
    if (t < HIGHLIGHT_S) d.highlight(rects, t);
    if (current.aid && show.aid && !aidFailed) {
      try {
        show.aid(d, kit, ctx);
      } catch (e) {
        aidFailed = true;
        current.error = `Aid: ${/** @type {any} */ (e)?.message ?? e}`;
      }
    }
    // The phase, by what it's about, unless the show places it itself.
    if (current.canFlip && show.badge !== false && current.aid) {
      const at = typeof show.badge === 'function' ? show.badge(kit, ctx) : null;
      d.badge(current.phase, at ?? union(rects), { slow: current.slow });
    }
    const out = d.done();
    overlay.render(out);
    // The card keeps off the targets and what the aid draws.
    const avoid = [...rects, ...out.marks];
    const sig = avoid.map((r) => `${Math.round(r.x / 8)},${Math.round(r.y / 8)},${Math.round(r.width / 8)},${Math.round(r.height / 8)}`).join(' ');
    if (sig !== marked) {
      marked = sig;
      current.avoid = avoid;
    }
  };
  tick();
  timer = setInterval(tick, 100);
  if (canFlip) {
    current.flipping = true;
    flipLoop();
  }
}

/** The box around a few rects (the badge sits on its top left). */
function union(rects) {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return new DOMRect(x, y, Math.max(...rects.map((r) => r.right)) - x, Math.max(...rects.map((r) => r.bottom)) - y);
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
/** @type {any} */ (globalThis).__flagShow = {
  showMe, stopShow, replay, setPhase, setFlipping, setSlow, current, SHOWS, kit,
  /** The running show's context (its measurements), and its targets as rects now. */
  get ctx() {
    return ctx;
  },
  rects: () => (active ? targetRects(active) : []),
};
