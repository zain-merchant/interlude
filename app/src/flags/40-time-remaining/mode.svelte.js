// #40 (UI audit flag): which of a deck's two times is the big one. One
// setting for both decks, remembered as oss-dj.timeMode ('remaining' or
// 'elapsed').
const KEY = 'oss-dj.timeMode';
let saved = 'remaining';
try {
  if (localStorage.getItem(KEY) === 'elapsed') saved = 'elapsed';
} catch {}

export const timeMode = $state({ big: saved });

export function swapTimes() {
  timeMode.big = timeMode.big === 'remaining' ? 'elapsed' : 'remaining';
  try {
    localStorage.setItem(KEY, timeMode.big);
  } catch {}
}
