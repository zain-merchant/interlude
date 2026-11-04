// Auto gain: tracks load at a common loudness, measured when they're
// analyzed, so trim starts from matched levels. On unless turned off in
// Settings; remembered between sessions. Applies to the next track loaded,
// so a playing deck never jumps in level.

const KEY = 'oss-dj.autoGain';

let saved = true;
try {
  saved = localStorage.getItem(KEY) !== 'off';
} catch {}

export const autoGain = $state({ on: saved });

export function setAutoGain(on) {
  autoGain.on = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
}
