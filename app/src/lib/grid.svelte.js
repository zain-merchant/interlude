// Fixing a deck's beatgrid by hand, from the BPM readout, the scrolling
// waveform or the keyboard. Every change is saved, locked against
// analysis, read aloud and can be undone.

import { engine, tracks, nextGrid, setGrid } from './engine.svelte.js';
import { pushEdit } from './undo.svelte.js';
import { announce } from './announce.svelte.js';

/** Which deck's BPM readout is being typed into, if any. */
export const bpmEdit = $state({ deck: -1 });

/** How far one nudge moves the grid, in seconds. */
export const NUDGE = 0.01;

/**
 * Applies a grid change, with Undo back to the grid before it.
 * @param {number} deck
 * @param {'halve' | 'double' | 'downbeat' | 'nudge' | 'bpm' | 'reset'} op
 * @param {string} label what happened, as it's read aloud ("Halved the BPM")
 * @param {number} [value] seconds for 'nudge', BPM for 'bpm'
 * @param {number} [at] where 'downbeat' and 'bpm' anchor, in seconds; the play head by default
 */
export async function gridEdit(deck, op, label, value, at) {
  const t = tracks[deck];
  if (!t) return;
  const name = 'AB'[deck];
  const before = t.gridLocked ? t.beatgrid : null;
  const after = op === 'reset' ? null : nextGrid(t.beatgrid, op, at ?? engine.decks[deck].position, value);
  if (op !== 'reset' && !after) return;
  await setGrid(deck, after);
  announce(`${label} on deck ${name}`);
  pushEdit({ label: `${label} on deck ${name}`, undo: () => setGrid(deck, before), redo: () => setGrid(deck, after) });
}

/**
 * The right-click menu for a deck's grid. `at` is the time under the
 * pointer, when the menu was opened on the waveform.
 * @param {number} deck
 * @param {number} [at]
 * @returns {import('./menu.svelte.js').MenuEntry[]}
 */
export function gridMenu(deck, at) {
  const t = tracks[deck];
  const has = !!t?.beatgrid;
  const here = at != null;
  return [
    { label: here ? 'Set downbeat here' : 'Set downbeat at play head', enabled: has, action: () => gridEdit(deck, 'downbeat', 'Moved the downbeat', 0, at) },
    { label: 'Move grid earlier', enabled: has, action: () => gridEdit(deck, 'nudge', 'Moved the grid earlier', -NUDGE) },
    { label: 'Move grid later', enabled: has, action: () => gridEdit(deck, 'nudge', 'Moved the grid later', NUDGE) },
    '-',
    { label: 'Halve BPM', enabled: has, action: () => gridEdit(deck, 'halve', 'Halved the BPM') },
    { label: 'Double BPM', enabled: has, action: () => gridEdit(deck, 'double', 'Doubled the BPM') },
    { label: 'Set BPM…', enabled: !!t, action: () => (bpmEdit.deck = deck) },
    '-',
    { label: 'Reset to detected grid', enabled: !!t?.gridLocked, action: () => gridEdit(deck, 'reset', 'Reset the beatgrid') },
  ];
}
