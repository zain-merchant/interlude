// Hot cues, loops, beat jump, slip and key shift: the actions shared by the deck's pads,
// the keyboard (commands.js) and nothing else. The engine does the work;
// these only check a command makes sense and send it.

import { engine, tracks, control } from './engine.svelte.js';
import { announce } from './announce.svelte.js';
import { flag } from '../flags/registry.svelte.js';
import { deckSettings, setDeckSetting, saveSlip } from './decksettings.svelte.js';

/** Hot cues the deck shows as pads: all eight, like the engine and the
 * FLX4, in two rows of four laid out like the controller's pads. */
export const PADS = 8;

const deckName = (deck) => 'AB'[deck];
// #88 (UI audit flag): deck-names says "Left deck" / "Right deck" ("Deck A" otherwise).
const Deck = (deck) => (flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${deckName(deck)}`);
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
  announce(`${Deck(deck)} hot cue ${index + 1} cleared`);
}

export function loopToggle(deck) {
  if (!hasGrid(deck)) return;
  const d = engine.decks[deck];
  control({ type: 'loopToggle', deck });
  announce(d.looping ? `${Deck(deck)} loop off` : `${Deck(deck)} looping ${beatsLabel(d.loopBeats)} beats`);
}

/** Halves (0.5) or doubles (2) the loop size and the loop playing. */
export function loopScale(deck, factor) {
  if (!tracks[deck]) return;
  control({ type: 'loopScale', deck, factor });
}

/** A long beat jump, in beats: four bars, to skip a phrase. */
export const LONG_JUMP = 16;

/** Jumps back (-1) or forward (1) by the loop size, or with `long` by four bars. */
export function beatJump(deck, dir, long = false) {
  if (!hasGrid(deck)) return;
  control({ type: 'beatJump', deck, beats: dir * (long ? LONG_JUMP : engine.decks[deck].loopBeats || 4) });
}

/** Turns slip mode on or off for a deck, and remembers it. */
export function setSlip(deck, on) {
  control({ type: 'setSlip', deck, on });
  // Shown at once; the engine's next report agrees.
  engine.decks[deck].slip = on;
  saveSlip(deck, on);
  announce(`${Deck(deck)} slip ${on ? 'on' : 'off'}`);
}

/** Slip mode on or off. */
export const toggleSlip = (deck) => setSlip(deck, !engine.decks[deck].slip);

/** How far key shift goes either way, in semitones, as in the engine. */
export const KEY_SHIFT_MAX = 12;

const semis = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ${Math.abs(n) === 1 ? 'semitone' : 'semitones'}`;

/** Sets a deck's key shift, in semitones from the track's key. */
export function setKeyShift(deck, semitones) {
  if (!tracks[deck]) return;
  const s = Math.max(-KEY_SHIFT_MAX, Math.min(KEY_SHIFT_MAX, semitones));
  control({ type: 'setKeyShift', deck, semitones: s });
  // Shown at once; the engine's next report agrees.
  engine.decks[deck].keyShift = s;
  announce(s ? `${Deck(deck)} key ${semis(s)}` : `${Deck(deck)} back to the track's key`); // #88 (UI audit flag): deck-names
}

/** Moves a deck's key a semitone up (1) or down (-1). */
export const keyStep = (deck, dir) => setKeyShift(deck, (engine.decks[deck].keyShift ?? 0) + dir);

/** True when both decks have a key, which key sync needs. */
export const canKeySync = (deck) => !!tracks[deck] && !!engine.decks[deck].key && !!tracks[1 - deck] && !!engine.decks[1 - deck].key;

/** Shifts a deck's key to the other deck's. */
export function keySync(deck) {
  if (!canKeySync(deck)) return;
  control({ type: 'keySync', deck });
  announce(`${Deck(deck)} key matched to ${Deck(1 - deck).replace(/^D/, 'd').replace(/^Left|^Right/, (w) => w.toLowerCase())}`); // #88 (UI audit flag): deck-names
}

/** Quantize, for both decks, from Settings > Decks (B toggles it too). */
export function toggleQuantize() {
  const on = !deckSettings.quantize;
  setDeckSetting('quantize', on);
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
    case 'jumpBackLong':
    case 'jumpForwardLong':
      if (down) beatJump(deck, m[2] === 'jumpBackLong' ? -1 : 1, true);
      return true;
    case 'slip':
      if (down) toggleSlip(deck);
      return true;
    case 'keyUp':
    case 'keyDown':
      if (down) keyStep(deck, m[2] === 'keyUp' ? 1 : -1);
      return true;
    case 'keyReset':
      if (down) setKeyShift(deck, 0);
      return true;
    case 'keySync':
      if (down) keySync(deck);
      return true;
  }
  return false;
}
