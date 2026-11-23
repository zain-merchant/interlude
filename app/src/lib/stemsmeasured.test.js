// Run with `npm test` (node's built-in test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figures, kept, memory, takes, wait } from './stemsmeasured.js';

const says = (mode, m) => takes(mode, figures(m).takes).map((r) => r.join(' '));

test('times are said roughly, and never as none', () => {
  assert.equal(wait(0.02), 1);
  assert.equal(wait(1.2), 1);
  assert.equal(wait(4.6), 5);
});

test('memory is rounded up to the next half', () => {
  assert.equal(memory(0.1), 0.5);
  assert.equal(memory(2.41), 2.5);
  assert.equal(memory(2.51), 3);
});

test('what stems keep while a track is loaded', () => {
  assert.equal(kept(4.5), 140);
  assert.equal(kept(5), 160);
  assert.equal(kept(6), 190);
});

test('says what this computer takes once that is known', () => {
  const m = { heard: 6.2, memory: 2.4 };
  assert.equal(figures(m).note, '');
  assert.deepEqual(figures(m).takes, { perTrackMb: 160, makingGb: 2.5, waitSeconds: 6 });
  assert.deepEqual(says('fast', m), ['160 MB of memory for each 5-minute track you load', '2.5 GB of memory while separating a track', 'No wait once a track is separated']);
  assert.deepEqual(says('efficient', m), ['160 MB of memory for each 5-minute track separated', '2.5 GB of memory while separating a track', '6 second wait the first time, for each track']);
});

test('until then it says what is usual, and that it is', () => {
  for (const m of [null, undefined, { heard: null, memory: null }]) {
    assert.match(figures(m).note, /^These are the usual figures/);
    const all = [...says('fast', m), ...says('efficient', m)].join('\n');
    assert.ok(!/NaN|null|undefined/.test(all));
    assert.match(all, /2 to 3 GB of memory while separating a track/);
    assert.match(all, /1 to 6 second wait the first time/);
  }
});

test('when only one is known, the other is a range and the note says what ranges are', () => {
  assert.match(figures({ heard: 2, memory: null }).note, /^Ranges are the usual/);
  assert.equal(says('fast', { heard: 2, memory: null })[1], '2 to 3 GB of memory while separating a track');
  assert.equal(says('efficient', { heard: null, memory: 1.9 })[2], '1 to 6 second wait the first time, for each track');
});
