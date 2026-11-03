// Hot cues, loops and beat jump: the actions shared by the deck's pads,
// the keyboard (commands.js) and nothing else. The engine does the work;
// these only check a command makes sense and send it.

import { engine, tracks, control } from './engine.svelte.js';
import { announce } from './announce.svelte.js';

/** Hot cues the deck shows as pads. The engine and the FLX4 have eight. */
export const PADS = 4;

const deckName = (deck) => 'AB'[deck];
/** True when the deck's track has a beatgrid, which loops and jumps need. */
export const hasGrid = (deck) => !!tracks[deck] && engine.decks[deck].bpm > 0;

/** A loop size for display: 4, 1/2, 1/16. */
export function beatsLabel(beats) {
  if (!beats) return '';
  return beats >= 1 ? String(Math.round(beats * 100) / 100) : `1/${Math.round(1 / beats)}`;
}

/** Hot cue pad pressed (`down`) or released. */
export function hotCue(deck, index, down) {
  if (!tracks[deck]) return;
  control({ type: down ? 'hotCuePress' : 'hotCueRelease', deck, index });
}

export function clearHotCue(deck, index) {
  if (!tracks[deck] || engine.decks[deck].hotCues?.[index] == null) return;
  control({ type: 'hotCueClear', deck, index });
  announce(`Deck ${deckName(deck)} hot cue ${index + 1} cleared`);
}

export function loopToggle(deck) {
  if (!hasGrid(deck)) return;
  const d = engine.decks[deck];
  control({ type: 'loopToggle', deck });
  announce(d.looping ? `Deck ${deckName(deck)} loop off` : `Deck ${deckName(deck)} looping ${beatsLabel(d.loopBeats)} beats`);
}

/** Halves (0.5) or doubles (2) the loop size and the loop playing. */
export function loopScale(deck, factor) {
  if (!tracks[deck]) return;
  control({ type: 'loopScale', deck, factor });
}

/** Jumps back (-1) or forward (1) by the loop size. */
export function beatJump(deck, dir) {
  if (!hasGrid(deck)) return;
  control({ type: 'beatJump', deck, beats: dir * (engine.decks[deck].loopBeats || 4) });
}

/** Quantize, for both decks. On unless turned off; engines that don't report it count as on. */
export const quantizeOn = () => engine.mixer?.quantize ?? true;

export function toggleQuantize() {
  const on = !quantizeOn();
  control({ type: 'setQuantize', on });
  // Shown at once; the engine's next report agrees.
  if (engine.mixer) engine.mixer.quantize = on;
  announce(on ? 'Quantize on' : 'Quantize off');
}

/**
 * Runs a keyboard command from commands.js if it's one of ours. `down` is
 * false on key release. Returns false for commands it doesn't know.
 */
export function runPerformance(id, down) {
  if (id === 'mixer.quantize') {
    if (down) toggleQuantize();
    return true;
  }
  const m = /^deck\.(\d)\.(\w+?)(?:\.(\d))?$/.exec(id);
  if (!m) return false;
  const deck = Number(m[1]);
  const index = Number(m[3]);
  switch (m[2]) {
    case 'hotCue':
      hotCue(deck, index, down);
      return true;
    case 'hotCueClear':
      if (down) clearHotCue(deck, index);
      return true;
    case 'loop':
      if (down) loopToggle(deck);
      return true;
    case 'loopHalve':
    case 'loopDouble':
      if (down) loopScale(deck, m[2] === 'loopHalve' ? 0.5 : 2);
      return true;
    case 'jumpBack':
    case 'jumpForward':
      if (down) beatJump(deck, m[2] === 'jumpBack' ? -1 : 1);
      return true;
  }
  return false;
}
