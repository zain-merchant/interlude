// Library filters: a BPM range, a set of keys, and "Fits", which keeps the
// tracks that mix well with the deck on air. Pure functions, so they test
// without the UI.

import { camelot, playingKey } from './key.js';

/** How far a track's tempo may be from the deck's for "Fits": about a semitone of pitch. */
export const FIT_TEMPO = 0.06;

/** Camelot code split into its number (1..12) and letter. */
const code = (k) => {
  const c = camelot(k);
  return { n: parseInt(c), letter: c.slice(-1) };
};

/**
 * Keys that mix with `k` on the Camelot wheel: the same key, one step either
 * way around the wheel, and its relative major or minor.
 */
export function keysFit(k, other) {
  const a = code(k);
  const b = code(other);
  if (a.letter === b.letter) {
    const d = Math.abs(a.n - b.n);
    return d === 0 || d === 1 || d === 11;
  }
  return a.n === b.n;
}

/** True when `bpm` is within FIT_TEMPO of `target`, at half, normal or double time. */
export function tempoFits(bpm, target) {
  if (!(bpm > 0) || !(target > 0)) return false;
  return [0.5, 1, 2].some((m) => Math.abs((bpm * m) / target - 1) <= FIT_TEMPO);
}

/**
 * What the deck on air is playing: its tempo and the key it sounds in.
 * Of the decks with a track, playing ones come first, then the one louder
 * through its fader and the crossfader. Null when no deck has a track.
 * @param {any[]} decks engine.decks
 * @param {{ crossfader?: number } | null} mixer engine.mixer
 */
export function onAir(decks, mixer) {
  const x = mixer?.crossfader ?? 0;
  const side = [Math.cos(((x + 1) * Math.PI) / 4), Math.sin(((x + 1) * Math.PI) / 4)];
  const level = (d, i) => (d.fader ?? 1) * side[i];
  /** @type {{ deck: number, score: number } | null} */
  let best = null;
  decks.forEach((d, i) => {
    if (!d.loaded || !(d.bpm > 0)) return;
    const score = (d.playing ? 10 : 0) + level(d, i);
    if (!best || score > best.score) best = { deck: i, score };
  });
  if (!best) return null;
  const d = decks[best.deck];
  return { deck: best.deck, bpm: d.bpm * d.speed, key: playingKey(d.key, d.speed, d.keylock) };
}

/**
 * @typedef {{ bpmMin: number | null, bpmMax: number | null, keys: string[] }} Filter
 * `keys` are Camelot codes ("8A"); empty means any key.
 */

/** True when a filter narrows anything. */
export const filtering = (/** @type {Filter} */ f) => f.bpmMin != null || f.bpmMax != null || f.keys.length > 0;

/**
 * Whether a track passes the filter and, when `fit` is given, fits the deck
 * on air. Tracks not analyzed yet pass only an empty filter.
 * @param {{ analysis?: { bpm?: number, key?: any } | null }} t
 * @param {Filter} f
 * @param {{ bpm: number, key: any } | null} fit
 */
export function passes(t, f, fit) {
  const bpm = t.analysis?.bpm;
  const key = t.analysis?.key;
  if (f.bpmMin != null && !(bpm >= f.bpmMin)) return false;
  if (f.bpmMax != null && !(bpm <= f.bpmMax)) return false;
  if (f.keys.length && !(key && f.keys.includes(camelot(key)))) return false;
  if (fit) {
    if (!tempoFits(bpm, fit.bpm)) return false;
    if (fit.key && !(key && keysFit(key, fit.key))) return false;
  }
  return true;
}

/** A short description of a filter, for its chip: "120–126 BPM · 8A 9A". */
export function describe(/** @type {Filter} */ f) {
  const parts = [];
  if (f.bpmMin != null && f.bpmMax != null) parts.push(`${f.bpmMin}–${f.bpmMax} BPM`);
  else if (f.bpmMin != null) parts.push(`${f.bpmMin}+ BPM`);
  else if (f.bpmMax != null) parts.push(`up to ${f.bpmMax} BPM`);
  if (f.keys.length) parts.push(f.keys.length > 3 ? `${f.keys.length} keys` : f.keys.join(' '));
  return parts.join(' · ');
}
