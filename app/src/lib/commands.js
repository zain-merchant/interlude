// Every keyboard command in one list: a stable id, a default key and the
// label shown in tooltips and menus. Keys match on KeyboardEvent.code, so
// the layout keeps its shape on AZERTY, QWERTZ and Dvorak.
//
// The keyboard splits down the middle: the left hand plays deck A, the
// right hand deck B, mirrored. The left key of a pair always means "less".

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
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
  'deck.0.load': { code: 'ArrowLeft', shift: true, label: '⇧←' },
  'deck.1.load': { code: 'ArrowRight', shift: true, label: '⇧→' },
  'mixer.xfLeft': { code: 'BracketLeft', label: '[' },
  'mixer.xfRight': { code: 'BracketRight', label: ']' },
  'mixer.xfHardLeft': { code: 'BracketLeft', shift: true, label: '⇧[' },
  'mixer.xfHardRight': { code: 'BracketRight', shift: true, label: '⇧]' },
  'view.zoomOut': { code: 'Minus', label: '−' },
  'view.zoomIn': { code: 'Equal', label: '=' },
  'library.search': { code: 'KeyF', mod: true, label: `${MOD}F` },
  'focus.next': { code: 'F6', label: 'F6' },
  'focus.prev': { code: 'F6', shift: true, label: '⇧F6' },
};

/** The key label for a command, for tooltips ("" if it has none). */
export const keyLabel = (id) => keys[id]?.label ?? '';

/** The command a key event triggers, or null. */
export function commandFor(e) {
  const mod = e.metaKey || e.ctrlKey;
  for (const [id, k] of Object.entries(keys)) {
    if (k.code === e.code && !!k.shift === e.shiftKey && !!k.mod === mod && !e.altKey) return { id, ...k };
  }
  return null;
}
