// Prototype data: each track's hot cues. A cue is a time and a colour; the
// app can't know which part is the intro or the drop, so cues aren't named.
export const CUE_COLORS = ['#e8b04a', '#7cb6ff', '#ef7a64', '#6fd08c'];
export const CUES = [
  [{ t: 30.2, c: CUE_COLORS[0] }, { t: 75.1, c: CUE_COLORS[1] }, { t: 105.0, c: CUE_COLORS[2] }, null],
  [{ t: 22.4, c: CUE_COLORS[0] }, { t: 70.0, c: CUE_COLORS[1] }, null, { t: 120.5, c: CUE_COLORS[2] }],
];
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
