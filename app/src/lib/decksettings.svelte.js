// Deck behaviour from Settings > Decks, remembered between sessions and sent
// to the engine at startup so the controller follows it too.
// * hotCuePlays: a hot cue on a paused deck starts it playing from the cue;
//   off, it plays only while the pad is held, like the cue button.
// * autoSync: a deck started (play, cue or a hot cue) while the other deck
//   plays takes its tempo and beat, as if SYNC were pressed.
// * slip: slip mode for each deck. It lives here rather than on the deck so
//   the deck stays calm; the A and ; keys still flip it mid-set, and the
//   choice is remembered either way.

import { backend } from './backend.js';

const SETTINGS = {
  hotCuePlays: { key: 'oss-dj.hotCuePlays', command: 'setHotCuePlays' },
  autoSync: { key: 'oss-dj.autoSync', command: 'setAutoSync' },
};

const saved = (key) => {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
};

export const deckSettings = $state(Object.fromEntries(Object.entries(SETTINGS).map(([name, s]) => [name, saved(s.key)])));

/** @param {keyof typeof SETTINGS} name */
export function setDeckSetting(name, on) {
  const { key, command } = SETTINGS[name];
  deckSettings[name] = on;
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {}
  return backend.control({ type: command, on }).catch((e) => console.error(e));
}

const slipKey = (deck) => `oss-dj.slip.${deck}`;

/** The saved slip choice for a deck: off unless turned on. */
export function savedSlip(deck) {
  try {
    return localStorage.getItem(slipKey(deck)) === 'on';
  } catch {
    return false;
  }
}

/** Remembers a deck's slip choice for next time. */
export function saveSlip(deck, on) {
  try {
    localStorage.setItem(slipKey(deck), on ? 'on' : 'off');
  } catch {}
}

/** Tells the engine the saved choices. Call once at startup. */
export function syncDeckSettings() {
  for (const name of /** @type {(keyof typeof SETTINGS)[]} */ (Object.keys(SETTINGS))) setDeckSetting(name, deckSettings[name]);
  for (const deck of [0, 1]) {
    const on = savedSlip(deck);
    backend.control({ type: 'setSlip', deck, on }).catch((e) => console.error(e));
  }
}
