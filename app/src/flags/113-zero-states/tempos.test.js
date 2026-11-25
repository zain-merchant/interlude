import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picture, said, head } from './tempos.js';
import { passes } from '../../lib/libraryfilter.js';

const T = (bpm, tonic = 0, minor = true) => ({ path: String(bpm) + tonic, analysis: bpm ? { bpm, key: tonic === null ? null : { tonic, minor } } : null });
const F = (bpmMin = null, bpmMax = null, keys = []) => ({ bpmMin, bpmMax, keys });
const inside = (p) => p.bars.filter((b) => b.x0 >= p.range[0] - 1e-3 && b.x1 <= p.range[1] + 1e-3);

test('every tempo is counted once, in the bar it is in', () => {
  const ts = Array.from({ length: 500 }, (_, i) => T(90 + (i % 60) + 0.37));
  const p = picture(ts, F(200, 210));
  assert.equal(p.bars.reduce((n, b) => n + b.all, 0) + p.off.low + p.off.high, 500);
  assert.ok(p.bars.every((b, i) => !i || b.x0 === p.bars[i - 1].x1));
});
test('nothing is drawn inside an empty range, however close', () => {
  const ts = [T(119.96), T(126.01), T(118), T(130)];
  const f = F(120, 126);
  assert.equal(ts.filter((t) => passes(t, f, null)).length, 0);
  assert.equal(inside(picture(ts, f)).reduce((n, b) => n + b.all, 0), 0);
});
test('a track exactly on either end is inside', () => {
  const p = picture([T(120), T(126)], F(120, 126));
  assert.equal(p.count.range, 2);
  assert.equal(inside(p).reduce((n, b) => n + b.all, 0), 2);
});
test('BPM and key: the two halves, none both', () => {
  const ts = [T(122, 9), T(124, 9), T(140, 2), T(100, 2)]; // 8A, then 7A
  const f = F(120, 126, ['7A']);
  const p = picture(ts, f);
  assert.deepEqual([p.count.range, p.count.keys, p.count.filter], [2, 2, 0]);
  assert.equal(inside(p).reduce((n, b) => n + b.a, 0), 0);
  assert.equal(p.bars.reduce((n, b) => n + b.a, 0), 2);
  assert.equal(said(p, f), '2 at that tempo, 2 in 7A, none both.');
});
test('keys alone are the wheel', () => {
  const p = picture([T(120, 9), T(0)], F(null, null, ['7A']));
  assert.equal(p.kind, 'keys');
  assert.equal(p.keys.reduce((a, b) => a + b, 0), 1);
  assert.equal(p.keys[7], 1); // 8A
  assert.ok(p.chosen[6]);
});
test('the wheel and the keys agree', async () => {
  const { WHEEL, keyAt } = await import('./tempos.js');
  const { camelot } = await import('../../lib/key.js');
  WHEEL.forEach((c, i) => assert.equal(camelot(keyAt(i)), c));
});
test('Fits with tempos apart: two spans that share nothing', () => {
  const air = { bpm: 120, key: { tonic: 2, minor: true } };
  const p = picture([T(119, 2), T(200, 9)], F(190, 210), air, null);
  assert.equal(p.kind, 'spans');
  const [[a, b]] = p.windows;
  assert.ok(b < p.range[0] || a > p.range[1]);
});
test('Fits with tempos that meet: the keys that would do, empty', () => {
  const air = { bpm: 120, key: { tonic: 2, minor: true } }; // 7A
  const ts = [T(119, 9), T(122, 4)];
  const p = picture(ts, F(115, 125), air, null);
  assert.equal(p.kind, 'slots');
  assert.deepEqual([...p.keys].sort(), ['6A', '7A', '7B', '8A'].sort());
  assert.equal(ts.filter((t) => p.keys.includes('x')).length, 0);
  assert.equal(p.count.both, 2);
});
test('Fits leaves out the track on air', () => {
  const air = { bpm: 120, key: { tonic: 2, minor: true } };
  const p = picture([{ ...T(120, 2), path: 'air' }, T(60, 2)], F(190, 210), air, 'air');
  assert.equal(p.count.fit, 1);
});
test('one track, none known, and nothing at all', () => {
  assert.equal(picture([T(128)], F(90, 100)).bars.reduce((n, b) => n + b.all, 0), 1);
  const none = picture([T(0), T(0)], F(120, 126));
  assert.equal(none.have, 0);
  assert.equal(said(none, F(120, 126)), 'No tempos are known yet.');
  assert.equal(picture([], F(120, 126)).have, 0);
});
test('wild tempos stay off the scale and are counted', () => {
  const ts = [...Array.from({ length: 400 }, (_, i) => T(118 + (i % 12))), T(999), T(4000)];
  const p = picture(ts, F(140, 150));
  assert.ok(p.hi < 300);
  assert.equal(p.off.high, 2);
  const far = picture(ts, F(5000, null));
  assert.ok(far.hi <= 1200 && far.range[0] === far.range[1]);
});
test('the nearest tempo', () => {
  assert.equal(said(picture([T(110), T(129)], F(140, 150)), F(140, 150)), 'The nearest is 129 BPM.');
  assert.equal(said(picture([T(110), T(171.25)], F(140, 150)), F(140, 150)), 'The nearest is 171.3 BPM.');
});
test('headings', () => {
  assert.equal(head(F(120, 126, ['7A', '8A'])), 'No tracks in 7A or 8A between 120 and 126 BPM');
  assert.equal(head(F(null, 90)), 'No tracks at 90 BPM or less');
});
test('a hundred thousand tracks take well under a frame or two', () => {
  const ts = Array.from({ length: 100000 }, (_, i) => T(80 + ((i * 7919) % 9000) / 100, i % 12, i % 2 === 0));
  picture(ts.slice(0, 2000), F(300, 310));
  const t0 = performance.now();
  picture(ts, F(300, 310, ['7A']), { bpm: 120, key: { tonic: 2, minor: true } });
  const ms = performance.now() - t0;
  console.log(`100,000 tracks: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 400);
});
