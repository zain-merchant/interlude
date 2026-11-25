// The marks on keys, and the words for them off the Mac.
import { mac } from '../../lib/commands.js';

const MARKS = '⌘⇧⌥⌃⏎⌫⎋⇥←→↑↓';

/**
 * Return and Tab aren't in the system font in the shape the Mac's symbols have,
 * so they're ours: its arrow's stroke (80 in text, 108 in a key, per 1000 of
 * the size), round ends, its 97 at each side. y is up from the baseline.
 */
export const OURS = {
  '⏎': { w: 984, d: 'M847 -660V-370Q847 -250 727 -250H137M367 -480 137 -250 367 -20' },
  '⇥': { w: 1040, d: 'M137 -355H800M590 -565 800 -355 590 -145M903 -605V-105' },
};
const RE = new RegExp(`([${MARKS}]+)`);

/** A key that's drawn as a mark. @param {string} s */
export const isMark = (s) => s.length === 1 && MARKS.includes(s);

/** Off the Mac a shortcut is words: Shift, not its arrow. @param {string} s */
export const local = (s) =>
  mac
    ? s.replaceAll('↩', '⏎').replaceAll('↵', '⏎')
    : s.replaceAll('⇧', 'Shift+').replaceAll('⌥', 'Alt+').replaceAll('⌃', 'Ctrl+').replaceAll('⌘', 'Ctrl+').replace(/\+-(?=click|drag)/g, '+');

/** A text in runs, marks apart from words. @param {string} text */
export const runs = (text) =>
  local(text)
    .split(RE)
    .filter(Boolean)
    .flatMap((s) => (RE.test(s) ? [...s.matchAll(/[⏎⇥]|[^⏎⇥]+/g)].map(([m]) => ({ s: m, mark: true, ours: OURS[m] })) : [{ s, mark: false, ours: undefined }]));
