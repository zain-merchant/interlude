import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camelot, playingKey, shiftTo } from './key.js';

test('key shift adds to the tempo shift, and keylock holds only the tempo part', () => {
  const am = { tonic: 9, minor: true };
  assert.deepEqual(playingKey(am, 1, false, 2), { tonic: 11, minor: true, shift: 2, keyShift: 2 });
  assert.equal(playingKey(am, 1.06, false, 2).shift, 3);
  assert.equal(playingKey(am, 1.06, true, -1).shift, -1);
});

test('shiftTo lands on the same Camelot code, within a tritone', () => {
  for (let a = 0; a < 24; a++) {
    for (let b = 0; b < 24; b++) {
      const x = { tonic: a % 12, minor: a >= 12 };
      const y = { tonic: b % 12, minor: b >= 12 };
      const s = shiftTo(x, y);
      assert.ok(s >= -5 && s <= 6);
      const moved = playingKey(x, 1, true, s);
      assert.equal(camelot(moved).slice(0, -1), camelot(y).slice(0, -1));
    }
  }
  // Same as the engine: D major to C major is two down.
  assert.equal(shiftTo({ tonic: 2, minor: false }, { tonic: 0, minor: false }), -2);
});
