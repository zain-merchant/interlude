// Hot cues on a paused deck: start it playing from the cue (the default),
// or play only while the pad is held, like the cue button. Remembered
// between sessions and sent to the engine at startup, so the controller's
// pads follow it too.

import { backend } from './backend.js';

const KEY = 'oss-dj.hotCuePlays';

let saved = true;
try {
  saved = localStorage.getItem(KEY) !== 'off';
} catch {}

export const hotCuePlays = $state({ on: saved });

export function setHotCuePlays(on) {
  hotCuePlays.on = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  return backend.control({ type: 'setHotCuePlays', on }).catch((e) => console.error(e));
}

/** Tells the engine the saved choice. Call once at startup. */
export const syncHotCuePlays = () => setHotCuePlays(hotCuePlays.on);
