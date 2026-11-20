// Run with `npm test` (node's built-in test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPhrases, phraseAt } from './phrases.js';

const BPS = 172;
const BPM = 128;
const BAR = (4 * 60) / BPM;

/** Waveform bins for sections of [bars, low, mid, high] levels (0-255). */
function bins(sections, lead = 0) {
  const total = lead + sections.reduce((s, [bars]) => s + bars * BAR, 0);
  const out = new Uint8Array(Math.ceil(total * BPS) * 4);
  let t = lead;
  for (const [bars, low, mid, high] of sections) {
    const from = Math.floor(t * BPS), to = Math.floor((t + bars * BAR) * BPS);
    for (let i = from; i < to; i++) {
      // A little wobble, as real music has.
      const w = (i % 37) / 37 - 0.5;
      out.set([200, low + 10 * w, mid + 8 * w, high + 6 * w].map((v) => Math.max(0, Math.min(255, v))), i * 4);
    }
    t += bars * BAR;
  }
  return { bins: out, duration: total };
}

test('a club track splits into its sections', () => {
  const { bins: b, duration } = bins([
    [16, 30, 90, 120], // intro: drums, no bass
    [32, 200, 160, 150], // drop
    [16, 20, 120, 60], // breakdown: pads
    [8, 25, 130, 170], // build: risers
    [32, 205, 165, 155], // drop
    [16, 40, 90, 110], // outro
  ], 0.25);
  const p = findPhrases(b, BPS, { bpm: BPM, firstBeat: 0.25 }, duration);
  const kinds = p.map((x) => x.kind);
  // Drops may be told as two phrases of 16; joining runs of one kind:
  const runs = kinds.filter((k, i) => k !== kinds[i - 1]);
  assert.deepEqual(runs, ['intro', 'drop', 'breakdown', 'build', 'drop', 'outro']);
  for (const x of p) assert.ok([4, 8, 12, 16, 24, 32].includes(x.bars) || x === p[p.length - 1], `${x.bars} bars`);
  // Boundaries on bar lines from bar 1.
  const drop = p.find((x) => x.kind === 'drop');
  assert.ok(Math.abs(drop.start - (0.25 + 16 * BAR)) < 1e-6, `${drop.start}`);
  assert.equal(p[0].start, 0);
  assert.equal(p[p.length - 1].end, duration);
  assert.equal(Math.max(...p.map((x) => x.energy)), 10);
});

test('the phrase playing and the bars left in it', () => {
  /** @type {import('./phrases.js').Phrase[]} */
  const phrases = [
    { start: 0, end: 16 * BAR, bars: 16, kind: 'intro', energy: 3 },
    { start: 16 * BAR, end: 48 * BAR, bars: 32, kind: 'drop', energy: 10 },
  ];
  const grid = { bpm: BPM, firstBeat: 0 };
  assert.deepEqual(phraseAt(phrases, 8.5 * BAR, grid), { phrase: phrases[0], barsLeft: 8 });
  assert.deepEqual(phraseAt(phrases, 16 * BAR, grid), { phrase: phrases[1], barsLeft: 32 });
  assert.equal(phraseAt(phrases, 99 * BAR, grid), null);
  // A drop told as two phrases counts down to its end.
  const split = [phrases[0], { ...phrases[1], end: 32 * BAR, bars: 16 }, { ...phrases[1], start: 32 * BAR, bars: 16 }];
  assert.equal(phraseAt(split, 20 * BAR, grid).barsLeft, 28);
});

test('no grid or a short clip gives no phrases', () => {
  const { bins: b, duration } = bins([[4, 100, 100, 100]]);
  assert.deepEqual(findPhrases(b, BPS, null, duration), []);
  assert.deepEqual(findPhrases(b, BPS, { bpm: BPM, firstBeat: 0 }, duration), []);
});
