// Run with `npm test` (node's built-in test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amount, isWaiting, mb, notYet, onUse, percent, progressText, spoken, stemsStatus, STEMS_MODES, timeLeft } from './stemsmodel.js';

const total = 165_612_636;
/** @param {string} state */
const model = (state, done = 0, rest = {}) => /** @type {any} */ ({ state, done, total, secondsLeft: null, error: null, ...rest });

test('sizes are megabytes as Finder counts them', () => {
  assert.equal(mb(total), '166 MB');
  assert.equal(amount(model('downloading', 70_000_000)), '70 of 166 MB');
});

test('percent only reaches 100 when everything is in', () => {
  assert.equal(percent(model('downloading', 0)), 0);
  assert.equal(percent(model('downloading', total - 1)), 99);
  assert.equal(percent(model('downloading', total)), 100);
  assert.equal(percent({ ...model('downloading'), total: 0 }), 0);
});

test('time left is said roughly, and only while downloading', () => {
  const left = (s) => timeLeft(model('downloading', 1, { secondsLeft: s }));
  assert.equal(left(null), '');
  assert.equal(left(0), '1 min left');
  assert.equal(left(80), '1 min left');
  assert.equal(left(200), '3 min left');
  assert.equal(left(9000), 'over an hour left');
  assert.equal(timeLeft(model('waiting', 1, { secondsLeft: 10 })), '');
});

test('progress is percent, size and time', () => {
  assert.equal(progressText(model('downloading', 70_000_000, { secondsLeft: 90 })), '42%, 70 of 166 MB, 2 min left');
  assert.equal(progressText(model('downloading', 70_000_000)), '42%, 70 of 166 MB');
});

test('every state has something to say, and a button unless it is under way', () => {
  for (const [m, action] of [
    [model('missing'), 'Download'],
    [model('missing', 5e6), 'Continue'],
    [model('downloading', 5e6), ''],
    [model('downloading', total), ''],
    [model('waiting', 5e6), 'Try now'],
    [model('failed', 5e6, { error: 'No.' }), 'Retry'],
    [model('ready', total), ''],
  ]) {
    const s = stemsStatus(m);
    assert.ok(s.title, m.state);
    assert.equal(s.action, action, m.state);
    assert.ok(notYet(m), m.state);
  }
  const s = stemsStatus(model('downloading', 70_000_000, { secondsLeft: 200 }));
  assert.equal(`${s.title}: ${s.detail}`, 'Downloading, 42%: 70 of 166 MB, 3 min left');
  assert.equal(stemsStatus(model('failed', 0, { error: 'No.' })).title, 'No.');
  assert.equal(notYet(model('failed', 0, { error: 'No.' })), "Stems didn't download. No. Retry in Settings › Stems.");
});

test('turns of events are spoken, progress is not', () => {
  const go = model('downloading', 10e6);
  assert.equal(spoken(model('missing'), go), '', 'it starts quietly');
  assert.equal(spoken(go, model('downloading', 11e6)), '');
  assert.equal(spoken(go, model('waiting', 10e6)), 'The stems download is waiting for a connection');
  assert.equal(spoken(model('waiting', 10e6), go), '');
  assert.equal(spoken(go, model('missing', 10e6)), 'Stems download stopped');
  assert.equal(spoken(model('ready', total), model('missing')), '');
  assert.equal(spoken(go, model('failed', 0, { error: 'No room.' })), "Stems didn't download. No room.");
  assert.equal(spoken(go, model('ready', total)), 'Stems have downloaded and are ready to use');
});

test('quarters are spoken while the progress is on screen', () => {
  const at = (p) => model('downloading', total * p);
  assert.equal(spoken(at(0.24), at(0.26)), '');
  assert.equal(spoken(at(0.24), at(0.26), true), 'Stems, 25% downloaded');
  assert.equal(spoken(at(0.26), at(0.27), true), '');
  assert.equal(spoken(at(0.2), at(0.8), true), 'Stems, 75% downloaded');
  assert.equal(spoken(at(0.9), at(1), true), '');
});

const deck = (state, rest = {}) => ({ loaded: true, state, ...rest });

test('the first use asks, whatever is going on with the model', () => {
  for (const state of ['ask', 'needsModel', 'failed']) assert.equal(onUse('ask', deck(state)), 'ask', state);
  // A track whose stems are in the cache plays them without being asked.
  assert.equal(onUse('ask', deck('ready')), 'go');
  assert.equal(onUse('ask', { loaded: false, state: 'off' }), 'cant');
});

test('once chosen, a press goes ahead or says why not', () => {
  for (const mode of /** @type {const} */ (['fast', 'efficient'])) {
    for (const state of ['onUse', 'starting', 'splitting', 'ready']) assert.equal(onUse(mode, deck(state)), 'go', state);
    for (const state of ['needsModel', 'failed', 'off']) assert.equal(onUse(mode, deck(state)), 'cant', state);
  }
  assert.equal(onUse('off', deck('off')), 'cant');
});

test('a press is waiting until the track is split where it plays', () => {
  const at = (state, here, mask = 0b1110) => isWaiting({ state, here, mask });
  assert.ok(at('onUse', false));
  assert.ok(at('starting', false));
  assert.ok(at('splitting', false));
  assert.ok(!at('splitting', true));
  assert.ok(!at('ready', true));
  assert.ok(!at('splitting', false, 0b1111), 'nothing is muted');
  assert.ok(!at('failed', false), 'it isn’t coming');
});

test('the choices are two, in plain words', () => {
  assert.deepEqual(STEMS_MODES.map((m) => m.name), ['Fast', 'Efficient']);
  for (const m of STEMS_MODES) {
    assert.ok(!/[·—]/.test(m.name + m.short + m.line));
    assert.ok(!/[A-Z]{4,}/.test(m.name + m.short + m.line));
  }
});
