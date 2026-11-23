// #119 (UI audit flag): getting round by keyboard.
//
// Tab reaches every control. WebKit leaves buttons and checkboxes out of Tab
// unless macOS's "Keyboard navigation" is on, but never one with a tabindex of
// its own. A tabindex would also make a click focus a button (WebKit doesn't,
// and a focused button takes Space and Enter), so it's only there while the
// keyboard is moving: Tab puts it on just before the browser looks for the
// next stop, and any press of a pointer takes it off just before the browser
// decides what that press focuses. Pointer users get the app as it was.
//
// Long sets are one stop, and the arrows move inside them: the sidebar, a
// deck's hot cues, the track list's headings. (A deck's tabs and Settings'
// pages already were.)
//
// The toast's Undo is last in the page but drawn in a toolbar; Tab meets it
// where it's drawn.
//
// Keys never leave focus on nothing: Esc goes to the track list, and when
// what had focus has gone (Undo, a name being typed) focus goes back to where
// it came from. In a dialog over the window, Tab goes round inside it.

const OURS = 'data-tabbed'; // the tabindex on this element is ours
const NATIVE = "button, summary, a[href], input:is([type='checkbox'], [type='radio'], [type='range'], [type='button'])";
const NOT = '.fp, .flag-show, [inert]';
const LIST = "[data-region='tracks']";

/** Sets that are one stop: where, their parts, and which arrows move in them. */
const SETS = [
  { in: 'section.library nav', of: 'button.item, button.add', keys: 'v' },
  { in: "[data-region^='deck'] .perf", of: 'button.tc', keys: 'grid' },
  { in: 'section.library .row.head', of: 'button.sort, button.cols', keys: 'h' },
];

const q = (/** @type {string} */ s, /** @type {ParentNode} */ root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(s)]);
const shown = (/** @type {HTMLElement} */ e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
const usable = (/** @type {HTMLElement} */ e) => e.isConnected && !(/** @type {any} */ (e).disabled) && !e.closest(NOT) && shown(e);

/** Whether the keys are what's moving focus (Tab or F6, and no pointer since). */
let moving = false;
/** The part of each set that was last reached. @type {WeakMap<Element, HTMLElement>} */
const last = new WeakMap();
/** Where focus came from, per element. @type {WeakMap<Element, HTMLElement>} */
const from = new WeakMap();

const setOf = (/** @type {Element | null} */ e) => {
  for (const s of SETS) {
    const box = e?.closest(s.in);
    if (box && e?.matches(s.of)) return { ...s, box };
  }
  return null;
};
/** A set's one stop: the part last reached, or the selected one, or the first. */
function stopOf(/** @type {Element} */ box, /** @type {HTMLElement[]} */ parts) {
  const l = last.get(box);
  if (l && parts.includes(l) && usable(l)) return l;
  return parts.find((p) => p.matches('.on, [aria-current="true"]') && usable(p)) ?? parts.find(usable);
}

function give(/** @type {HTMLElement} */ e, /** @type {number} */ n) {
  if (e.hasAttribute('tabindex') && !e.hasAttribute(OURS)) return;
  e.tabIndex = n;
  e.setAttribute(OURS, '');
}
function grant() {
  for (const e of q(NATIVE)) if (!e.closest(NOT)) give(e, 0);
  for (const s of SETS)
    for (const box of q(s.in)) {
      const parts = q(s.of, box);
      const stop = stopOf(box, parts);
      for (const p of parts) give(p, p === stop ? 0 : -1);
    }
  const t = toast();
  if (t) give(t.undo, t.docked ? -1 : 0);
}
function revoke() {
  for (const e of q(`[${OURS}]`)) {
    e.removeAttribute('tabindex');
    e.removeAttribute(OURS);
  }
}

// ── The toast's Undo ──
function toast() {
  const undo = /** @type {HTMLElement | null} */ (document.querySelector('.toastbox .toast .undo'));
  const box = undo?.closest('.toast');
  return undo && box ? { undo, box, docked: box.getAttribute('data-docked') } : null;
}
/** Every stop Tab makes, in order. */
const stops = () => q('button, input, select, textarea, a[href], summary, [tabindex]').filter((e) => e.tabIndex >= 0 && usable(e));
/** The stops either side of a docked toast, as they're drawn. */
function beside(/** @type {NonNullable<ReturnType<typeof toast>>} */ t) {
  const bar = document.querySelector(t.docked === 'settings' ? '.settings .main .bar' : 'section.library .main > .bar');
  if (!t.docked || !bar) return null;
  const left = t.box.getBoundingClientRect().left;
  const all = stops();
  const at = all.filter((e) => bar.contains(e) && e.getBoundingClientRect().right <= left + 1).at(-1);
  if (at) return { before: at, after: all[all.indexOf(at) + 1] };
  const after = all.find((e) => bar.contains(e));
  return after ? { before: all[all.indexOf(after) - 1], after } : null;
}

/** In a dialog over the window, Tab goes round inside it: where it wraps to, or nothing while it's inside. */
function round(/** @type {boolean} */ back) {
  const modal = q("[aria-modal='true']").filter(shown).at(-1);
  if (!modal) return null;
  const all = stops().filter((x) => modal.contains(x));
  const here = /** @type {HTMLElement} */ (document.activeElement);
  if (!all.length) return null;
  if (here !== modal && !modal.contains(here)) return all[back ? all.length - 1 : 0];
  if (back ? here === all[0] || here === modal : here === all.at(-1)) return all[back ? all.length - 1 : 0];
  return null;
}

function tab(/** @type {KeyboardEvent} */ e) {
  moving = true;
  grant();
  const here = document.activeElement;
  const t = toast();
  const b = t?.docked ? beside(t) : null;
  const to =
    t && b && here === t.undo ? (e.shiftKey ? b.before : b.after)
    : t && b && here === b.before && !e.shiftKey ? t.undo
    : t && b && here === b.after && e.shiftKey ? t.undo
    : round(e.shiftKey);
  if (!to) return;
  e.preventDefault();
  to.focus();
}

// ── Arrows in a set ──
function arrow(/** @type {KeyboardEvent} */ e) {
  const here = /** @type {HTMLElement | null} */ (document.activeElement);
  const s = moving ? setOf(here) : null;
  if (!s || !here) return;
  const parts = q(s.of, s.box).filter(usable);
  const i = parts.indexOf(here);
  const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  let to;
  if (e.key === 'Home') to = parts[0];
  else if (e.key === 'End') to = parts.at(-1);
  else if (s.keys === 'v' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) to = parts[i + next];
  else if ((s.keys === 'h' || s.keys === 'grid') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) to = parts[i + next];
  else if (s.keys === 'grid') {
    // The one nearest above or below, in the row next to this one.
    const r = here.getBoundingClientRect();
    to = parts
      .filter((p) => (p.getBoundingClientRect().top - r.top) * next > r.height / 2)
      .sort((a, c) => Math.abs(a.getBoundingClientRect().left - r.left) - Math.abs(c.getBoundingClientRect().left - r.left) || (a.getBoundingClientRect().top - c.getBoundingClientRect().top) * next)[0];
  } else return;
  e.preventDefault();
  e.stopPropagation();
  if (!to) return;
  last.set(s.box, to);
  grant();
  to.focus();
}

// ── Never on nothing ──
const home = () => /** @type {HTMLElement | null} */ (document.querySelector(LIST))?.focus({ preventScroll: true });
function after(/** @type {KeyboardEvent} */ e) {
  const was = /** @type {HTMLElement | null} */ (document.activeElement);
  if (!was || was === document.body) return;
  const typed = was.matches('input:not([type="checkbox"], [type="radio"], [type="range"]), textarea');
  const back = from.get(was);
  const keys = moving || typed;
  setTimeout(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (!was.isConnected) {
      // A pointer's own press on Undo, say, leaves focus where pointers leave it.
      if (!keys) return;
      if (back && usable(back)) back.focus({ preventScroll: true });
      else home();
    } else if (keys && e.key === 'Escape') home();
    else if (keys && typed) home();
  }, 40);
}

/** Starts; returns what stops it. */
export function startKeys() {
  const keydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Tab') return tab(e);
    if (e.key === 'F6') return void (moving = true);
    if (e.altKey || e.isComposing) return;
    if (!e.shiftKey && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) return arrow(e);
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') after(e);
  };
  const pointer = () => {
    moving = false;
    revoke();
  };
  const focusin = (/** @type {FocusEvent} */ e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const r = /** @type {HTMLElement | null} */ (e.relatedTarget);
    if (r && r !== t && !r.closest('.toast')) from.set(t, r);
    const s = setOf(t);
    if (s) last.set(s.box, t);
  };
  addEventListener('keydown', keydown, true);
  addEventListener('pointerdown', pointer, true);
  addEventListener('focusin', focusin, true);
  return () => {
    removeEventListener('keydown', keydown, true);
    removeEventListener('pointerdown', pointer, true);
    removeEventListener('focusin', focusin, true);
    revoke();
    moving = false;
  };
}
