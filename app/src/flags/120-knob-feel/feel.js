// #120 (UI audit flag): knob-feel: how a drag and a scroll turn a knob, and a scroll moves a fader.

/** How far a drag goes, in px, before it's clear which way it's going. */
const SLOP = 4;

/**
 * Which way a drag is going, or null while it's too short to tell. Nearly
 * diagonal counts as sideways.
 */
export function axisOf(/** @type {number} */ dx, /** @type {number} */ dy) {
  if (Math.hypot(dx, dy) < SLOP) return null;
  return Math.abs(dx) >= Math.abs(dy) * 0.75 ? 'x' : 'y';
}

/** The whole travel, in px of scroll. */
const TRAVEL = 400;
/** A pause this long, in ms, ends a scroll. */
const GAP = 150;
/** This many shrinking events in a row is momentum: the fingers are off. */
const COASTING = 4;
/** How much more scroll it takes, in px, to leave the detent: only scroll that isn't dying away counts. */
const HOLD = 24;

/**
 * What a wheel event moved, in px, up or right positive. Events in lines or
 * pages (some mice, Firefox) and a Windows mouse's notches come out as 8px a
 * notch: 2% of the travel, as a notch always was.
 * @param {WheelEvent} e @param {boolean} sideways whether a sideways scroll counts
 */
export function px(e, sideways) {
  // ⇧ with a mouse's wheel arrives as a sideways scroll on a Mac.
  const x = sideways || e.shiftKey ? e.deltaX : 0;
  const d = Math.abs(x) > Math.abs(e.deltaY) ? x : -e.deltaY;
  if (e.deltaMode === 1) return (d / 3) * 8;
  if (e.deltaMode === 2) return Math.sign(d) * 40;
  const w = Math.abs(/** @type {any} */ (e).wheelDelta ?? 0);
  if (w && w % 120 === 0 && Math.abs(Math.abs(d) * 3 - w) > 1) return Math.sign(d) * (w / 120) * 8;
  return d;
}

// One scroll, from its first event until a pause: it belongs to the control
// it started on, and to nothing if it started anywhere else (the track list,
// the waveforms), so what's left of one never turns the next thing the
// pointer passes over.
/** @type {{ owner: Element | null, at: number, size: number, shrinking: number, done: boolean, raw: number | undefined, out: number | undefined, hold: number }} */
let scroll = { owner: null, at: -1e9, size: 0, shrinking: 0, done: true, raw: undefined, out: undefined, hold: 0 };
const CONTROL = '.knob, .fader';

if (typeof window !== 'undefined')
  window.addEventListener(
    'wheel',
    (e) => {
      const size = Math.abs(px(e, true));
      const fresh = e.timeStamp - scroll.at > GAP || (scroll.shrinking >= COASTING && size > scroll.size * 1.5 + 4);
      if (fresh) scroll = { owner: e.target instanceof Element ? e.target.closest(CONTROL) : null, at: 0, size: 0, shrinking: 0, done: false, raw: undefined, out: undefined, hold: 0 };
      else scroll.shrinking = size < scroll.size ? scroll.shrinking + 1 : size === scroll.size ? scroll.shrinking : 0;
      scroll.at = e.timeStamp;
      scroll.size = size;
    },
    { capture: true, passive: true },
  );

/**
 * Where a scroll puts a control, or null if it isn't the control's to take.
 * @param {WheelEvent} e
 * @param {{ value: number, min: number, max: number, reset: number, sideways: boolean, flip?: boolean, detent: (raw: number, reset: number, perPx: number, fine: boolean) => number }} o
 */
export function scrolled(e, o) {
  const el = /** @type {Element} */ (e.currentTarget);
  if (scroll.done || scroll.owner !== el.closest(CONTROL)) return null;
  // The pointer has left it: what's left of the scroll is nobody's.
  const r = el.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
    scroll.done = true;
    return null;
  }
  const fine = e.shiftKey;
  const perPx = ((o.max - o.min) / TRAVEL) * (fine ? 0.1 : 1);
  // Something else moved it since (a key, a controller): start from there.
  const from = scroll.raw !== undefined && scroll.out === o.value ? scroll.raw : o.value;
  let raw = Math.min(o.max, Math.max(o.min, from + px(e, o.sideways) * (o.flip ? -1 : 1) * perPx));
  // It stops at the detent, however fast: what's dying away (coasting) never
  // gets past, and a scroll that's still being pushed takes a little more.
  if (!fine && from !== o.reset && (from - o.reset) * (raw - o.reset) <= 0) {
    raw = o.reset;
    scroll.hold = HOLD;
  } else if (scroll.hold > 0) {
    if (!scroll.shrinking) scroll.hold -= scroll.size;
    raw = o.reset;
  }
  scroll.raw = raw;
  return (scroll.out = o.detent(raw, o.reset, perPx, fine));
}

/** The control says what it ended up at, which is where the next event starts. */
export function landed(/** @type {number} */ v) {
  scroll.out = v;
}
