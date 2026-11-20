// The kit a flag's `show` uses to set the app up (dev builds only): find
// things, click and type like a user, load tracks through the simulated
// engine, open dialogs. Everything goes through the app's own controls,
// so what you see is what a user would get.
import { flushSync } from 'svelte';
import { FLAGS, flags } from '../registry.svelte.js';
import { tooltip } from '../../lib/tooltip.svelte.js';
import { uiZoom, setUiZoom } from '../../lib/uizoom.svelte.js';

const OVERLAY = '.flag-show, .flag-dials, .dialkit-root';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** All matches outside the overlay and the flag bar. */
export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)].filter((el) => !el.closest(OVERLAY));
}
export const $ = (sel, root = document) => $$(sel, root)[0] ?? null;

/** Waits until fn() is truthy (returns it), or throws after `ms`. */
export async function until(fn, ms = 3000, what = 'the app') {
  const end = performance.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (performance.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await wait(40);
  }
}

const el = (x) => (typeof x === 'string' ? $(x) : x);

/** A full press: pointer and mouse down and up, then click. */
export async function click(target, opts = {}) {
  const e = el(target);
  if (!e) throw new Error(`Nothing to click: ${target}`);
  const r = e.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0, pointerId: 1, isPrimary: true, detail: 1, ...opts };
  e.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
  e.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 }));
  e.dispatchEvent(new PointerEvent('pointerup', at));
  e.dispatchEvent(new MouseEvent('mouseup', at));
  e.dispatchEvent(new MouseEvent('click', at));
  await frame();
  return e;
}
export async function dblclick(target) {
  const e = el(target);
  await click(e);
  await click(e, { detail: 2 });
  e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
  await frame();
  return e;
}
/** Points at a control (its tooltip, after the app's delay). */
export function hover(target) {
  const e = el(target);
  const r = e.getBoundingClientRect();
  const at = { bubbles: false, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'mouse' };
  e.dispatchEvent(new PointerEvent('pointerenter', at));
  e.dispatchEvent(new PointerEvent('pointerover', { ...at, bubbles: true }));
  return e;
}
export function unhover(target) {
  const e = el(target);
  e?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }));
  e?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
}

const KEYS = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Escape: 'Escape', Enter: 'Enter', End: 'End', Home: 'Home', Space: ' ' };
/** Presses a key by its code (KeyR, ArrowLeft…), as the app's shortcuts read it. */
export async function key(code, o = {}) {
  const k = KEYS[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
  const target = o.target ? el(o.target) : document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  const init = { code, key: o.shift && k.length === 1 ? k.toUpperCase() : k, shiftKey: !!o.shift, metaKey: !!o.meta, altKey: !!o.alt, bubbles: true, cancelable: true, composed: true };
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  await frame();
}

/** Types into an input as a user would (the app listens for input events). */
export async function type(target, text) {
  const e = /** @type {HTMLInputElement} */ (el(target));
  e.focus();
  e.value = text;
  e.dispatchEvent(new Event('input', { bubbles: true }));
  await frame();
  return e;
}

/** A deck's panel (0 = A, 1 = B). */
export const deck = (n) => $(`[data-region='deck${n}']`);
export const rows = () => $$("[data-region='tracks'] .row:not(.head)");
export const loaded = (n) => !/empty/i.test(deck(n)?.getAttribute('aria-label') ?? 'empty');

/** Clears the library search, so rows are where a show expects them. */
export async function clearSearch() {
  const s = /** @type {HTMLInputElement} */ ($("input[aria-label='Search the library']"));
  if (s && s.value) await type(s, '');
  s?.blur();
}

/** Searches the library; resolves once the list has updated. */
export async function search(text) {
  await type("input[aria-label='Search the library']", text);
  await wait(150);
  $("input[aria-label='Search the library']")?.blur();
}

/**
 * Selects a library row: an index, 'last', or a row whose text contains a string.
 * @param {number | string} [which]
 */
export async function selectRow(which = 0) {
  const list = $("[data-region='tracks']");
  if (which === 'last') {
    list.focus();
    await key('End', { target: list });
    await wait(120);
    return $("[data-region='tracks'] .row.sel");
  }
  const find = () => (typeof which === 'number' ? rows()[which] : rows().find((r) => r.textContent.includes(which)));
  let row = find();
  if (!row && typeof which === 'string') {
    // The list only renders the rows in view: search for it (up to any punctuation).
    await search(which.split(/[^\p{L}\p{N}\s]/u)[0].trim());
    row = await until(find, 2000, `a library row with “${which}”`);
  }
  if (!row) throw new Error(`No library row ${which}`);
  row.scrollIntoView({ block: 'nearest' });
  await click(row);
  return row;
}

/** Loads a track (as selectRow picks it) onto deck n with the load shortcut. */
export async function loadTrack(n, which = n === 0 ? 1 : 4) {
  const before = deck(n)?.getAttribute('aria-label');
  const row = await selectRow(which);
  const title = row?.querySelector('.t')?.textContent.trim();
  if (title && loaded(n) && $('.name', deck(n))?.textContent.trim() === title) return;
  await key(n === 0 ? 'ArrowLeft' : 'ArrowRight', { shift: true, target: $("[data-region='tracks']") });
  await until(() => loaded(n) && deck(n).getAttribute('aria-label') !== before, 4000, `deck ${'AB'[n]} to load`);
  await wait(250);
}

export const playButton = (n) => $('.transport .btn.play', deck(n));
/** Starts deck n playing (if it isn't). */
export async function play(n) {
  const b = playButton(n);
  if (!b.classList.contains('on')) await click(b);
  await until(() => playButton(n).classList.contains('on'), 2000, `deck ${'AB'[n]} to play`);
}
export async function pause(n) {
  const b = playButton(n);
  if (b?.classList.contains('on')) await click(b);
}

/** Opens a deck's mode tab: Cues, Loop, FX or Stems. */
export async function tab(n, name) {
  const b = $$('.modes button', deck(n)).find((x) => x.textContent.trim().startsWith(name));
  if (!b) throw new Error(`No ${name} tab on deck ${'AB'[n]}`);
  await click(b);
  await wait(60);
  return b;
}

/** Opens Settings (and a page of it, by its name in the sidebar). */
export async function openSettings(page) {
  if (!$('.settings')) await click("button[aria-label='Settings']");
  await until(() => $('.settings'), 2000, 'Settings');
  if (page) {
    const item = $$('.settings nav .item').find((x) => x.textContent.trim().toLowerCase().startsWith(page.toLowerCase()));
    if (item) await click(item);
    await wait(60);
  }
  return $('.settings');
}
export async function openImport() {
  await openSettings('Library');
  const b = await until(() => $$('.settings button').find((x) => /Import a library/.test(x.textContent)), 2000, 'the Import button');
  await click(b);
  return until(() => $(".card[aria-labelledby='import-title']"), 2000, 'the Import dialog');
}
export async function openReport() {
  await openSettings();
  const b = await until(() => $$('.settings button').find((x) => /Report a problem/.test(x.textContent)), 2000, 'Report a problem');
  await click(b);
  return until(() => $(".card[aria-labelledby='report-title']"), 2000, 'the Report dialog');
}

/** The user's own interface zoom while a show has changed it. */
let userZoom = /** @type {number | null} */ (null);
/** Sets the interface zoom (⌘= / ⌘−) and returns the one it replaced. */
export function zoom(scale) {
  const was = uiZoom.scale;
  userZoom ??= was;
  setUiZoom(scale);
  // The app remembers its zoom; a reload mid-show should come back at the
  // user's own, not the show's.
  try {
    localStorage.setItem('oss-dj.uiZoom', String(userZoom));
  } catch {}
  if (scale === userZoom) userZoom = null;
  return was;
}

/** Runs fn with flag `id` off (DOM updated), then turns it back on; returns fn's result. */
export function without(id, fn) {
  const was = flags.on[id];
  if (was) setFlag(id, false);
  try {
    return fn();
  } finally {
    if (was) setFlag(id, true);
  }
}

/**
 * Lets a show put controls into :hover, :active and :focus-visible without a
 * pointer: copies every rule that uses those into one sheet, with the
 * pseudo-class swapped for an attribute (data-show-hover, data-show-active,
 * data-show-focus) to set on an element. Returns a function that removes it.
 */
export function forceStates() {
  /** @type {[RegExp, string][]} */
  const map = [
    [/:hover/g, '[data-show-hover]'],
    [/:active/g, '[data-show-active]'],
    [/:focus-visible/g, '[data-show-focus]'],
    [/:focus-within/g, ':has([data-show-focus])'],
    [/:focus(?![-\w])/g, '[data-show-focus]'],
  ];
  const out = [];
  const visit = (rules, wrap) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        if (!/:(hover|active|focus)/.test(r.selectorText)) continue;
        let sel = r.selectorText;
        for (const [re, to] of map) sel = sel.replace(re, to);
        out.push(wrap(`${sel} { ${r.style.cssText} }`));
      } else if (r instanceof CSSMediaRule) visit(r.cssRules, (x) => wrap(`@media ${r.conditionText} { ${x} }`));
      else if (r instanceof CSSSupportsRule) visit(r.cssRules, (x) => wrap(`@supports ${r.conditionText} { ${x} }`));
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules, (x) => x);
    } catch {}
  }
  const style = document.createElement('style');
  style.dataset.flagShow = 'states';
  style.textContent = out.join('\n');
  document.head.append(style);
  return () => {
    style.remove();
    for (const a of ['data-show-hover', 'data-show-active', 'data-show-focus']) for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a);
  };
}

/** Hides any tooltip showing. */
export function hideTips() {
  tooltip.visible = false;
}

/** Closes dialogs, menus and Settings, restores the audio device: a clean slate. */
export async function reset() {
  globalThis.__mockAudio?.restore?.();
  for (let i = 0; i < 4; i++) {
    const open = $(".card[role='dialog'], .settings, .menu");
    if (!open) break;
    const done = $$('.settings .bar button').find((b) => b.textContent.trim() === 'Done');
    if ($(".card[role='dialog']") || $('.menu') || !done) await key('Escape', { target: document.body });
    else await click(done);
    await wait(120);
  }
  hideTips();
  for (const n of [0, 1]) await pause(n);
  await clearSearch();
  // Back to the whole library (a show may have opened a playlist).
  const all = $$("[data-region='sidebar'] .item")[0];
  if (all && !all.classList.contains('on')) await click(all);
  /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
}

/** Turns a flag on or off now (DOM updated before this returns). */
export function setFlag(id, on = true) {
  flushSync(() => (flags.on[id] = on));
}
export function setSetting(id, k, v) {
  flushSync(() => (flags.settings[id][k] = v));
}
export const isOn = (id) => !!flags.on[id];

/**
 * Rects of `els` as they'd be with flag `id` off, measured now and put back
 * at once (nothing is painted in between).
 */
export function rectsWithout(id, els) {
  const was = flags.on[id];
  if (was) setFlag(id, false);
  const out = els.map((e) => e?.getBoundingClientRect() ?? null);
  if (was) setFlag(id, true);
  return out;
}

/** The box of an element's own text (not its padding), or null. */
export function textRect(e) {
  if (!e) return null;
  const range = document.createRange();
  const nodes = [];
  const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) if (walk.currentNode.textContent.trim()) nodes.push(walk.currentNode);
  if (!nodes.length) return null;
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[nodes.length - 1]);
  const r = range.getBoundingClientRect();
  return r.width ? r : null;
}

/** A snapshot of rects, to compare against later (ghosts). */
export const snap = (els) => els.map((e) => (e ? DOMRect.fromRect(e.getBoundingClientRect()) : null));

export const FLAG_IDS = FLAGS.map((f) => f.id);

/** Everything above, as the `app` a show's setup(app) and aid(d, app) get. */
export const kit = {
  $, $$, until, wait, click, dblclick, hover, unhover, key, type, deck, rows, loaded, search, clearSearch, selectRow, loadTrack,
  playButton, play, pause, tab, zoom, forceStates, hideTips, tooltip, openSettings, openImport, openReport, reset, setFlag, setSetting, isOn, without, rectsWithout, textRect, snap,
  get mock() {
    return globalThis.__mockAudio;
  },
};
