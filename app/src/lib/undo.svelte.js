// Undo covers edits, not performance: loading a track and removing a music
// folder can be taken back; play, faders and EQ can't, because the room
// already heard them. Each undoable action shows a toast with an Undo
// button, and ⌘Z keeps working after the toast fades.

import { announce } from './announce.svelte.js';

/**
 * @typedef {{ label: string, undo: () => Promise<boolean | void> | boolean | void,
 *             redo: () => Promise<boolean | void> | boolean | void }} Edit
 * `undo` and `redo` return false when they can't run right now (the deck
 * is playing, say); the edit then stays where it was.
 */

const LIMIT = 50;
/** @type {Edit[]} */
const past = [];
/** @type {Edit[]} */
const future = [];

/** The toast at the bottom of the window. `undo` shows an Undo button. */
export const toast = $state({ text: '', undo: false, id: 0 });
let timer;

/** Shows a short message. With `undo`, it offers Undo for 6 seconds. */
export function showToast(text, { undo = false } = {}) {
  toast.text = text;
  toast.undo = undo;
  toast.id++;
  clearTimeout(timer);
  timer = setTimeout(hideToast, undo ? 6000 : 2600);
}

export function hideToast() {
  clearTimeout(timer);
  toast.text = '';
  toast.undo = false;
}

/** Records an edit that has just happened, and offers to undo it. */
export function pushEdit(edit) {
  past.push(edit);
  if (past.length > LIMIT) past.shift();
  future.length = 0;
  showToast(edit.label, { undo: true });
}

let busy = false;

async function step(from, to, verb, fn) {
  if (busy) return;
  const edit = from.at(-1);
  if (!edit) {
    showToast(`Nothing to ${verb.toLowerCase()}`);
    return;
  }
  busy = true;
  try {
    if ((await fn(edit)) === false) return;
    from.pop();
    to.push(edit);
    showToast(`${verb}: ${edit.label}`);
    announce(`${verb}: ${edit.label}`);
  } catch (e) {
    showToast(`Couldn't ${verb.toLowerCase()}: ${e}`);
  } finally {
    busy = false;
  }
}

export const undo = () => step(past, future, 'Undo', (e) => e.undo());
export const redo = () => step(future, past, 'Redo', (e) => e.redo());
