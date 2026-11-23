// The marks on keys, and the words for them off the Mac.
import { mac } from '../../lib/commands.js';

const MARKS = '⌘⇧⌥⌃⏎⌫⎋⇥←→↑↓';
const RE = new RegExp(`([${MARKS}]+)`);

/** A key that's drawn as a mark. @param {string} s */
export const isMark = (s) => s.length === 1 && MARKS.includes(s);

/** Off the Mac a shortcut is words: Shift, not its arrow. @param {string} s */
export const local = (s) =>
  mac
    ? s.replaceAll('↩', '⏎')
    : s.replaceAll('⇧', 'Shift+').replaceAll('⌥', 'Alt+').replaceAll('⌃', 'Ctrl+').replaceAll('⌘', 'Ctrl+').replace(/\+-(?=click|drag)/g, '+');

/** A text in runs, marks apart from words. @param {string} text */
export const runs = (text) =>
  local(text)
    .split(RE)
    .filter(Boolean)
    .map((s) => ({ s, mark: RE.test(s) }));
