// Every keyboard command in one list: a stable id, a default key and the
// label shown in tooltips and menus. Keys match on KeyboardEvent.code, so
// the layout keeps its shape on AZERTY, QWERTZ and Dvorak.
//
// The keyboard splits down the middle: the left hand plays deck A, the
// right hand deck B, mirrored. The left key of a pair always means "less".
//
// Users can rebind any of these on the Keyboard settings page; their
// bindings live in keymap.svelte.js and win over the defaults here.

import { keymap } from './keymap.svelte.js';

export const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? '⌘' : 'Ctrl+';

/** @type {Record<string, { code: string, shift?: boolean, mod?: boolean, label: string, hold?: boolean }>} */
export const keys = {
  'deck.0.cue': { code: 'KeyQ', label: 'Q', hold: true },
  'deck.1.cue': { code: 'KeyP', label: 'P', hold: true },
  'deck.0.play': { code: 'KeyW', label: 'W' },
  'deck.1.play': { code: 'KeyO', label: 'O' },
  'deck.0.sync': { code: 'KeyE', label: 'E' },
  'deck.1.sync': { code: 'KeyI', label: 'I' },
  'deck.0.slower': { code: 'KeyZ', label: 'Z', hold: true },
  'deck.0.faster': { code: 'KeyX', label: 'X', hold: true },
  'deck.1.slower': { code: 'Comma', label: ',', hold: true },
  'deck.1.faster': { code: 'Period', label: '.', hold: true },
  'deck.0.pfl': { code: 'KeyG', label: 'G' },
  'deck.1.pfl': { code: 'KeyH', label: 'H' },
  'deck.0.where': { code: 'KeyT', label: 'T' },
  'deck.1.where': { code: 'KeyY', label: 'Y' },
  // Hot cues 1 to 4: number row, 1-4 for deck A and 7-0 for deck B. Hold
  // on a paused deck to preview; ⇧ clears.
  ...hotCueKeys(0, ['Digit1', 'Digit2', 'Digit3', 'Digit4']),
  ...hotCueKeys(1, ['Digit7', 'Digit8', 'Digit9', 'Digit0']),
  // Stems have no keys until you give them some in Settings.
  ...stemKeys(0),
  ...stemKeys(1),
  'deck.0.loop': { code: 'KeyR', label: 'R' },
  'deck.1.loop': { code: 'KeyU', label: 'U' },
  'deck.0.loopHalve': { code: 'KeyD', label: 'D' },
  'deck.0.loopDouble': { code: 'KeyF', label: 'F' },
  'deck.1.loopHalve': { code: 'KeyJ', label: 'J' },
  'deck.1.loopDouble': { code: 'KeyK', label: 'K' },
  'deck.0.jumpBack': { code: 'KeyC', label: 'C' },
  'deck.0.jumpForward': { code: 'KeyV', label: 'V' },
  'deck.1.jumpBack': { code: 'KeyN', label: 'N' },
  'deck.1.jumpForward': { code: 'KeyM', label: 'M' },
  'deck.0.load': { code: 'ArrowLeft', shift: true, label: '⇧←' },
  'deck.1.load': { code: 'ArrowRight', shift: true, label: '⇧→' },
  'mixer.quantize': { code: 'KeyB', label: 'B' },
  'mixer.xfLeft': { code: 'BracketLeft', label: '[' },
  'mixer.xfRight': { code: 'BracketRight', label: ']' },
  'mixer.xfHardLeft': { code: 'BracketLeft', shift: true, label: '⇧[' },
  'mixer.xfHardRight': { code: 'BracketRight', shift: true, label: '⇧]' },
  'view.sampler': { code: 'KeyS', label: 'S' },
  'view.zoomOut': { code: 'Minus', label: '−' },
  'view.zoomIn': { code: 'Equal', label: '=' },
  'library.search': { code: 'KeyF', mod: true, label: `${MOD}F` },
  'focus.next': { code: 'F6', label: 'F6' },
  'focus.prev': { code: 'F6', shift: true, label: '⇧F6' },
  'edit.undo': { code: 'KeyZ', mod: true, label: `${MOD}Z` },
  'edit.redo': { code: 'KeyZ', mod: true, shift: true, label: mac ? '⇧⌘Z' : 'Ctrl+⇧Z' },
  'app.settings': { code: 'Comma', mod: true, label: `${MOD},` },
  'view.uiZoomIn': { code: 'Equal', mod: true, label: `${MOD}=` },
  'view.uiZoomOut': { code: 'Minus', mod: true, label: `${MOD}−` },
  'view.uiZoomReset': { code: 'Digit0', mod: true, label: `${MOD}0` },
};

/** What each command does, as the Keyboard settings page and menus name it. */
const NAMES = {
  cue: 'Cue (hold to preview)',
  play: 'Play / pause',
  sync: 'Sync',
  slower: 'Nudge slower (hold)',
  faster: 'Nudge faster (hold)',
  pfl: 'Headphone cue',
  where: 'Read out position',
  load: 'Load selected track',
  loop: 'Loop on / off',
  loopHalve: 'Halve loop',
  loopDouble: 'Double loop',
  jumpBack: 'Beat jump back',
  jumpForward: 'Beat jump forward',
  'mixer.quantize': 'Quantize on / off',
  'mixer.xfLeft': 'Crossfader left',
  'mixer.xfRight': 'Crossfader right',
  'mixer.xfHardLeft': 'Crossfader all the way left',
  'mixer.xfHardRight': 'Crossfader all the way right',
  'view.sampler': 'Show / hide sampler',
  'view.zoomOut': 'Zoom waveforms out',
  'view.zoomIn': 'Zoom waveforms in',
  'view.uiZoomIn': 'Make everything bigger',
  'view.uiZoomOut': 'Make everything smaller',
  'view.uiZoomReset': 'Actual size',
  'library.search': 'Search the library',
  'focus.next': 'Next area',
  'focus.prev': 'Previous area',
  'edit.undo': 'Undo',
  'edit.redo': 'Redo',
  'app.settings': 'Settings',
};

/** A command's name, without its deck ("Play / pause"). */
export function commandName(id) {
  const action = id.startsWith('deck.') ? id.split('.').slice(2).join('.') : id;
  if (NAMES[action]) return NAMES[action];
  const stem = action.match(/^stem(Solo)?\.(\d)$/);
  if (stem) return `${STEM_NAMES[+stem[2]]} ${stem[1] ? 'alone' : 'on / off'}`;
  const hot = action.match(/^hotCue(Clear)?\.(\d+)$/);
  if (hot) return hot[1] ? `Clear hot cue ${+hot[2] + 1}` : `Hot cue ${+hot[2] + 1} (hold to preview)`;
  // Commands added without a name still get a readable one.
  const words = action.split('.').pop().replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A command's key as the user has it: their own binding, the default, or
 * null if they removed it.
 */
export function binding(id) {
  return id in keymap.overrides ? keymap.overrides[id] : (keys[id] ?? null);
}

const STEM_NAMES = ['Vocals', 'Melody', 'Bass', 'Drums'];

function stemKeys(deck) {
  const out = {};
  for (let i = 0; i < 4; i++) {
    out[`deck.${deck}.stem.${i}`] = null;
  }
  return out;
}

function hotCueKeys(deck, codes) {
  const out = {};
  codes.forEach((code, i) => {
    const label = code.slice(-1);
    out[`deck.${deck}.hotCue.${i}`] = { code, label, hold: true };
    out[`deck.${deck}.hotCueClear.${i}`] = { code, shift: true, label: `⇧${label}` };
  });
  return out;
}

/** The key label for a command, for tooltips ("" if it has none). */
export const keyLabel = (id) => binding(id)?.label ?? '';

/** True when two bindings are the same key press. */
export const sameKey = (a, b) => !!a && !!b && a.code === b.code && !!a.shift === !!b.shift && !!a.mod === !!b.mod;

/** The command a key event triggers, or null. */
export function commandFor(e) {
  if (e.altKey) return null;
  const press = { code: e.code, shift: e.shiftKey, mod: e.metaKey || e.ctrlKey };
  for (const id of Object.keys(keys)) {
    const k = binding(id);
    if (sameKey(k, press)) return { id, ...k, hold: keys[id]?.hold };
  }
  return null;
}
