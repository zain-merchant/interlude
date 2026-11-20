// Run with `npm test` (node's built-in test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysFit, tempoFits, onAir, passes, describe } from './libraryfilter.js';

const Am = { tonic: 9, minor: true }; // 8A
const C = { tonic: 0, minor: false }; // 8B
const Em = { tonic: 4, minor: true }; // 9A
const Dm = { tonic: 2, minor: true }; // 7A
const G = { tonic: 7, minor: false }; // 9B
const Fsm = { tonic: 6, minor: true }; // 11A
const Abm = { tonic: 8, minor: true }; // 1A
const Ebm = { tonic: 3, minor: true }; // 2A
const Bbm = { tonic: 10, minor: true }; // 3A

test('keys fit on the Camelot wheel', () => {
  assert.ok(keysFit(Am, Am));
  assert.ok(keysFit(Am, Em)); // one step up
  assert.ok(keysFit(Am, Dm)); // one step down
  assert.ok(keysFit(Am, C)); // relative major
  assert.ok(!keysFit(Am, G)); // 9B: a step and a letter away
  assert.ok(!keysFit(Am, Fsm));
  assert.ok(keysFit(Abm, { tonic: 1, minor: true }), '1A and 12A are neighbours'); // C♯m = 12A
  assert.ok(keysFit(Abm, Ebm));
  assert.ok(!keysFit(Abm, Bbm));
});

test('tempo fits within 6%, at half and double time', () => {
  assert.ok(tempoFits(124, 124));
  assert.ok(tempoFits(130, 124));
  assert.ok(!tempoFits(135, 124));
  assert.ok(tempoFits(87, 174));
  assert.ok(tempoFits(172, 86));
  assert.ok(!tempoFits(undefined, 124));
});

const deck = (o) => ({ loaded: true, playing: false, bpm: 120, speed: 1, key: Am, keylock: false, fader: 1, ...o });

test('the deck on air: playing first, then the louder one', () => {
  assert.equal(onAir([deck({ loaded: false }), deck({ loaded: false })], null), null);
  assert.equal(onAir([deck({}), deck({ playing: true })], null).deck, 1);
  assert.equal(onAir([deck({ playing: true, fader: 0.2 }), deck({ playing: true })], null).deck, 1);
  assert.equal(onAir([deck({ playing: true }), deck({ playing: true })], { crossfader: -1 }).deck, 0);
});

test('the deck on air reports the tempo and key being heard', () => {
  const a = onAir([deck({ playing: true, bpm: 120, speed: 1.06 }), deck({ loaded: false })], null);
  assert.ok(Math.abs(a.bpm - 127.2) < 1e-9);
  assert.equal(a.key.tonic, 10); // a semitone up without keylock
  const b = onAir([deck({ playing: true, speed: 1.06, keylock: true }), deck({ loaded: false })], null);
  assert.equal(b.key.tonic, 9);
});

const track = (bpm, key) => ({ analysis: { bpm, key } });
const none = { bpmMin: null, bpmMax: null, keys: [] };

test('filters by BPM range and key', () => {
  assert.ok(passes(track(124, Am), none, null));
  assert.ok(passes({ analysis: null }, none, null));
  assert.ok(!passes({ analysis: null }, { ...none, bpmMin: 120 }, null));
  assert.ok(passes(track(124, Am), { ...none, bpmMin: 120, bpmMax: 126 }, null));
  assert.ok(!passes(track(128, Am), { ...none, bpmMin: 120, bpmMax: 126 }, null));
  assert.ok(passes(track(124, Am), { ...none, keys: ['8A', '9A'] }, null));
  assert.ok(!passes(track(124, C), { ...none, keys: ['8A'] }, null));
});

test('fits the deck on air', () => {
  const fit = { bpm: 124, key: Am };
  assert.ok(passes(track(126, Em), none, fit));
  assert.ok(!passes(track(126, G), none, fit));
  assert.ok(!passes(track(140, Am), none, fit));
  assert.ok(passes(track(140, G), none, { bpm: 140, key: null }), 'a deck with no key matches tempo only');
});

test('describes a filter', () => {
  assert.equal(describe({ bpmMin: 120, bpmMax: 126, keys: ['8A', '9A'] }), '120–126 BPM · 8A 9A');
  assert.equal(describe({ bpmMin: 170, bpmMax: null, keys: [] }), '170+ BPM');
  assert.equal(describe({ bpmMin: null, bpmMax: null, keys: ['1A', '2A', '3A', '4A'] }), '4 keys');
});
