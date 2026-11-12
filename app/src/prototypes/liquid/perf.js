// Prototype data for the performance-area concepts: each track's sections
// (as an analyser would find them) and its named hot cues.
export const SECTIONS = [
  [[0, 30, 'Intro', 0.35], [30, 75, 'Groove', 0.7], [75, 105, 'Build', 0.8], [105, 210, 'Drop', 1], [210, 255, 'Break', 0.4], [255, 285, 'Build', 0.8], [285, 420, 'Drop', 1], [420, 479, 'Outro', 0.4]],
  [[0, 22, 'Intro', 0.4], [22, 70, 'Groove', 0.7], [70, 98, 'Break', 0.4], [98, 120, 'Build', 0.8], [120, 230, 'Drop', 1], [230, 302, 'Outro', 0.5]],
];
export const CUE_COLORS = ['#e8b04a', '#7cb6ff', '#ef7a64', '#6fd08c'];
export const CUES = [
  [{ n: 'Intro', t: 30.2, c: CUE_COLORS[0] }, { n: 'Build', t: 75.1, c: CUE_COLORS[1] }, { n: 'Drop', t: 105.0, c: CUE_COLORS[2] }, null],
  [{ n: 'Intro', t: 22.4, c: CUE_COLORS[0] }, { n: 'Break', t: 70.0, c: CUE_COLORS[1] }, null, { n: 'Drop', t: 120.5, c: CUE_COLORS[2] }],
];
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
