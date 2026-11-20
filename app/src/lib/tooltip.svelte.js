// One tooltip for the whole app. After 600 ms of hover, or straight away
// on keyboard focus, it shows a control's name, value and shortcut
// ("Low EQ · −6.0 dB · double-click to reset"). Knobs and faders also use
// it as a live readout while they're dragged.

import { flag } from '../flags/registry.svelte.js';
import { keys, keyLabel } from './commands.js';
import { keymap } from './keymap.svelte.js';

export const tooltip = $state({ text: '', x: 0, y: 0, below: false, visible: false });
// #12 (UI audit flag): whether the tip showing came straight from another, so it skips its entrance.
export const tipWarm = $state({ on: false });

let timer;
let owner = null;
let leftAt = -Infinity; // #12 (UI audit flag): when the pointer last left a showing tip's control.

function place(node, text) {
  const r = node.getBoundingClientRect();
  tooltip.text = text;
  tooltip.x = r.left + r.width / 2;
  // Above the control unless there's no room; never over its own value.
  tooltip.below = r.top < 40;
  tooltip.y = tooltip.below ? r.bottom + 8 : r.top - 8;
  tooltip.visible = true;
  owner = node;
}

/** Shows `text` for `node` now (live readouts). */
export function showTip(node, text) {
  clearTimeout(timer);
  tipWarm.on = true; // #12 (UI audit flag): live readouts (drags, keys) appear without an entrance.
  place(node, text);
}

export function hideTip(node) {
  clearTimeout(timer);
  if (!node || owner === node) {
    tooltip.visible = false;
    owner = null;
  }
}

/**
 * Svelte action: `use:tip={() => 'Play · W'}`. The function is called each
 * time the tip shows, so values stay current.
 * @param {HTMLElement} node
 * @param {() => string} text
 */
export function tip(node, text) {
  let get = text;
  const enter = () => {
    clearTimeout(timer);
    // #12 (UI audit flag): moving straight from one tip to the next skips the delay and the entrance.
    if (flag('polish-tooltip') && performance.now() - leftAt < 300) {
      tipWarm.on = true;
      return place(node, get());
    }
    tipWarm.on = false;
    timer = setTimeout(() => place(node, get()), 600);
  };
  // #12 (UI audit flag): keyboard focus shows its tip without an entrance.
  const focus = () => node.matches(':focus-visible') && ((tipWarm.on = true), place(node, get()));
  const leave = () => hideTip(node);
  // #12 (UI audit flag): note when a showing tip is left, for the next control's tip.
  const out = () => (owner === node && tooltip.visible && (leftAt = performance.now()), hideTip(node));
  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointerleave', out);
  node.addEventListener('pointerdown', leave);
  node.addEventListener('focus', focus);
  node.addEventListener('blur', leave);
  return {
    update(next) {
      get = next;
      if (owner === node && tooltip.visible) tooltip.text = get();
    },
    destroy() {
      hideTip(node);
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', out);
      node.removeEventListener('pointerdown', leave);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', leave);
    },
  };
}

// #10 (UI audit flag): no-dots: a part that is a key (a command's current key, or Esc) is marked
// with an invisible separator, so the tip can draw it as a keycap at its end.
export const KEY_MARK = '\u2063';
const keyLabels = () => new Set([...Object.keys(keys), ...Object.keys(keymap.overrides)].map(keyLabel).filter(Boolean).concat('Esc'));

/** Joins tooltip parts, skipping empty ones. */
export const tipText = (...parts) => {
  const list = parts.filter(Boolean);
  if (!flag('no-dots')) return list.join(' · ');
  const k = keyLabels();
  return list.map((p) => (k.has(p) ? KEY_MARK + p : p)).join(' · ');
};
