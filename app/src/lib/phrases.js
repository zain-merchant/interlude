// Phrases: a track split into the sections DJs mix by (intro, build, drop,
// breakdown, outro), found from the waveform's band levels on the beat grid.
//
// Dance music is built in phrases of 8 or 16 bars, and a new phrase usually
// changes what's playing: the bass comes in, the drums drop out. So:
//
// 1. Average the waveform's low, mid and high levels over each bar.
// 2. Score each bar line by how different the bars after it are from the
//    bars before it (a few bars each side).
// 3. Split the track into phrases of 4 to 32 bars, preferring 8 and 16, so
//    the bar lines between them score highest.
// 4. Name each phrase from its level and bass against the rest of the track.
//
// It runs in the UI over data it already has, so it follows the grid: fix
// the grid and the phrases move with it.

/** @typedef {'intro' | 'build' | 'drop' | 'breakdown' | 'verse' | 'outro'} PhraseKind */
/** @typedef {{ start: number, end: number, bars: number, kind: PhraseKind, energy: number }} Phrase */

/** Phrase lengths allowed, in bars, and how much each is preferred. */
const LENGTHS = new Map([
  [4, 0.35],
  [8, 0],
  [12, 0.5],
  [16, 0],
  [24, 0.45],
  [32, 0.25],
]);
/** Bars compared on each side of a bar line. */
const SIDE = 4;

export const PHRASE_NAMES = {
  intro: 'Intro',
  build: 'Build',
  drop: 'Drop',
  breakdown: 'Breakdown',
  verse: 'Verse',
  outro: 'Outro',
};

/**
 * The phrases of a track.
 * @param {Uint8Array} bins the waveform: 4 bytes a bin (peak, low, mid, high)
 * @param {number} binsPerSec
 * @param {{ bpm: number, firstBeat: number } | null} grid
 * @param {number} duration seconds
 * @returns {Phrase[]}
 */
export function findPhrases(bins, binsPerSec, grid, duration) {
  if (!bins || !grid || !(grid.bpm > 0) || !(duration > 0)) return [];
  const bar = (4 * 60) / grid.bpm;
  // Bar 1 at the first bar line at or after the start; a part bar before
  // it joins the first phrase.
  const first = ((grid.firstBeat % bar) + bar) % bar;
  const count = Math.floor((duration - first) / bar);
  if (count < 8) return [];

  // 1. Each bar's mean low, mid and high level.
  const feats = [];
  for (let b = 0; b < count; b++) {
    const from = Math.floor((first + b * bar) * binsPerSec);
    const to = Math.min(bins.length / 4, Math.floor((first + (b + 1) * bar) * binsPerSec));
    let low = 0, mid = 0, high = 0, n = 0;
    for (let i = from; i < to; i++) {
      low += bins[i * 4 + 1];
      mid += bins[i * 4 + 2];
      high += bins[i * 4 + 3];
      n++;
    }
    n = Math.max(n, 1);
    feats.push([low / n / 255, mid / n / 255, high / n / 255]);
  }

  // 2. How much the music changes at each bar line.
  const mean = (from, to) => {
    const m = [0, 0, 0];
    const lo = Math.max(0, from), hi = Math.min(count, to);
    for (let b = lo; b < hi; b++) for (let k = 0; k < 3; k++) m[k] += feats[b][k];
    return m.map((v) => v / Math.max(1, hi - lo));
  };
  const novelty = new Float64Array(count + 1);
  for (let b = 1; b < count; b++) {
    const before = mean(b - SIDE, b), after = mean(b, b + SIDE);
    // Bass changes matter most: they're what a DJ hears as a new section.
    novelty[b] = 2 * Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1]) + Math.abs(after[2] - before[2]);
  }
  const top = Math.max(...novelty) || 1;
  for (let b = 0; b <= count; b++) novelty[b] /= top;

  // 3. The split whose bar lines change the most, phrases of the allowed
  //    lengths (the last may be short).
  const best = new Float64Array(count + 1).fill(-Infinity);
  const from = new Int32Array(count + 1).fill(-1);
  best[0] = 0;
  for (let end = 1; end <= count; end++) {
    for (const [len, cost] of LENGTHS) {
      const start = end - len;
      if (start < 0 || best[start] === -Infinity) continue;
      const score = best[start] + (end < count ? novelty[end] : 0) - cost;
      if (score > best[end]) {
        best[end] = score;
        from[end] = start;
      }
    }
  }
  // The end may not be reachable in whole phrases: end at the reachable
  // bar closest to it and let the last phrase run on.
  let end = count;
  while (end > 0 && from[end] < 0) end--;
  const cuts = [];
  for (let e = end; e > 0; e = from[e]) cuts.push(e);
  cuts.push(0);
  cuts.reverse();
  if (cuts[cuts.length - 1] !== count) cuts[cuts.length - 1] = count;

  // 4. Names, from each phrase's level and bass.
  const parts = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [low, mid, high] = mean(cuts[i], cuts[i + 1]);
    parts.push({ a: cuts[i], b: cuts[i + 1], level: 0.5 * low + 0.3 * mid + 0.2 * high, low, high });
  }
  const levels = parts.map((p) => p.level).sort((x, y) => x - y);
  const loudest = levels[levels.length - 1] || 1;
  const lows = parts.map((p) => p.low).sort((x, y) => x - y);
  const typicalLow = lows[Math.floor(lows.length / 2)] || 1;
  const isDrop = (p) => p.level >= 0.85 * loudest;
  // Before the first drop is the intro (less a build into it), and after
  // the last one the outro; with no drop at all, the first and last
  // phrases are.
  const drops = parts.map((p, i) => (isDrop(p) ? i : -1)).filter((i) => i >= 0);
  const firstDrop = drops.length ? drops[0] : 1;
  const lastDrop = drops.length ? drops[drops.length - 1] : parts.length - 2;
  return parts.map((p, i) => {
    const next = parts[i + 1];
    const intoDrop = next && isDrop(next) && p.high >= (parts[i - 1]?.high ?? 0);
    /** @type {PhraseKind} */
    let kind = 'verse';
    if (isDrop(p)) kind = 'drop';
    else if (intoDrop && i > 0) kind = 'build';
    else if (i < firstDrop) kind = 'intro';
    else if (i > lastDrop) kind = 'outro';
    else if (p.low < 0.6 * typicalLow) kind = 'breakdown';
    return {
      start: i === 0 ? 0 : first + p.a * bar,
      end: i === parts.length - 1 ? duration : first + p.b * bar,
      bars: p.b - p.a,
      kind,
      energy: Math.max(1, Math.min(10, Math.round((p.level / loudest) * 10))),
    };
  });
}

/**
 * The phrase playing at `t` seconds and how many whole bars are left
 * before the music changes: phrases of the same kind in a row count as
 * one (a 32-bar drop told as two of 16).
 * @param {Phrase[]} phrases
 * @param {number} t
 * @param {{ bpm: number }} grid
 */
export function phraseAt(phrases, t, grid) {
  const i = phrases.findIndex((p) => t >= p.start && t < p.end);
  if (i < 0 || !(grid?.bpm > 0)) return null;
  let end = i;
  while (end + 1 < phrases.length && phrases[end + 1].kind === phrases[i].kind) end++;
  const bar = (4 * 60) / grid.bpm;
  return { phrase: phrases[i], barsLeft: Math.max(0, Math.ceil((phrases[end].end - t) / bar - 1e-6)) };
}
