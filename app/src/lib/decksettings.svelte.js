// Deck behaviour from Settings > Decks, remembered between sessions and sent
// to the engine at startup so the controller follows it too.
// * hotCuePlays: a hot cue on a paused deck starts it playing from the cue;
//   off, it plays only while the pad is held, like the cue button.
// * autoSync: a deck started (play, cue or a hot cue) while the other deck
//   plays takes its tempo and beat, as if SYNC were pressed.

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

/** Tells the engine the saved choices. Call once at startup. */
export function syncDeckSettings() {
  for (const name of Object.keys(SETTINGS)) setDeckSetting(name, deckSettings[name]);
}
