// The user's own key bindings, layered over the defaults in commands.js.
// Kept in localStorage and written the moment they change, so there is no
// Save button.
//
// An override is a binding ({ code, shift, mod, label }) or null, which
// means the user removed that command's key.

const KEY = 'oss-dj.keys';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** @type {{ overrides: Record<string, { code: string, shift?: boolean, mod?: boolean, label: string } | null> }} */
export const keymap = $state({ overrides: load() });

export function saveKeymap() {
  try {
    localStorage.setItem(KEY, JSON.stringify(keymap.overrides));
  } catch {}
}

// Printed names for keys whose e.key is unhelpful (shifted symbols,
// arrows, space). Letters use e.key so each layout shows its own letter.
const NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Space', Enter: '↩', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\',
  PageUp: 'Page Up', PageDown: 'Page Down', Home: 'Home', End: 'End',
};

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/**
 * Keys that stay the system's or the app's own: focus moves with Tab, Esc
 * always backs out, and ⌘Q, ⌘W, ⌘H, ⌘M belong to the OS.
 */
export function reserved(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Tab' || e.code === 'Escape') return true;
  return mod && ['KeyQ', 'KeyW', 'KeyH', 'KeyM', 'Tab'].includes(e.code);
}

/**
 * The binding a key press describes, or null for a bare modifier.
 * @param {KeyboardEvent} e @param {boolean} mac label with macOS glyphs (⇧⌘Z rather than Ctrl+⇧Z)
 */
export function bindingFrom(e, mac) {
  if (MODIFIERS.has(e.key)) return null;
  const isMod = e.metaKey || e.ctrlKey;
  let name = NAMES[e.code];
  if (!name && /^Key[A-Z]$/.test(e.code)) name = e.key.length === 1 && !e.altKey ? e.key.toUpperCase() : e.code.slice(3);
  if (!name && /^Digit\d$/.test(e.code)) name = e.code.slice(5);
  if (!name && /^F\d+$/.test(e.code)) name = e.code;
  name ??= e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return {
    code: e.code,
    shift: e.shiftKey || undefined,
    mod: isMod || undefined,
    label: mac ? `${e.shiftKey ? '⇧' : ''}${isMod ? '⌘' : ''}${name}` : `${isMod ? 'Ctrl+' : ''}${e.shiftKey ? '⇧' : ''}${name}`,
  };
}
