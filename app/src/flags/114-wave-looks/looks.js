// #114 (UI audit flag): wave-looks' looks and what each can tune.
//
// Every look but Today is drawn by wave.js on one core: a level per band per
// bin, smoothed only after a hit unless "before" says otherwise, drawn at one
// device pixel a column. `today` has no values: it's the app's own drawing.
// Today exact is what Direction 110 draws unless this flag picks another.

const SMOOTH = (after, before = [0, 0, 0]) => ({
  a0: after[0], a1: after[1], a2: after[2],
  b0: before[0], b1: before[1], b2: before[2],
});
const HEIGHTS = { h0: 95, h1: 62, h2: 34 };

/** What each value is: label, range, step, unit, and the folder it's in. */
export const PARAMS = {
  a0: ['After the hit: bass', 0, 200, 1, 'ms', 'Smoothing'],
  a1: ['After the hit: mids', 0, 200, 1, 'ms', 'Smoothing'],
  a2: ['After the hit: highs', 0, 200, 1, 'ms', 'Smoothing'],
  b0: ['Before the hit: bass', 0, 60, 1, 'ms', 'Smoothing'],
  b1: ['Before the hit: mids', 0, 60, 1, 'ms', 'Smoothing'],
  b2: ['Before the hit: highs', 0, 60, 1, 'ms', 'Smoothing'],
  soft: ['Softness between hits', 0, 8, 0.25, 'px', 'Smoothing'],
  hit: ['Smallest hit kept sharp', 2, 40, 1, '%', 'Smoothing'],
  ease: ['Ease the spikes', 0, 100, 5, '%', 'Smoothing'],
  h0: ['Bass height', 10, 100, 1, '%', 'Heights'],
  h1: ['Mids height', 10, 100, 1, '%', 'Heights'],
  h2: ['Highs height', 10, 100, 1, '%', 'Heights'],
  rim: ['Outline', 0, 100, 1, '%', 'Drawing'],
  outw: ['Outline width', 0.5, 2, 0.25, 'px', 'Drawing'],
  glow: ['Glow', 0, 300, 5, '%', 'Drawing'],
  grad: ['Fade to the edges', 0, 100, 1, '%', 'Drawing'],
  w: ['Mark width', 0.5, 12, 0.25, 'px', 'Marks'],
  gap: ['Gap', 0.5, 8, 0.25, 'px', 'Marks'],
  lock: ['Pitch follows the beat', 0, 1, 1, '', 'Marks'],
};

const RIBBON = { rim: 55, outw: 1, glow: 100, grad: 65 };
const ATTACK = SMOOTH([75, 55, 28]);

/** The looks in the order the step key goes through them: id, name, how it's drawn, and its values. */
export const LOOKS = [
  { id: 'today', name: 'Today', draw: null, values: {} },
  { id: 'exact', name: 'Today exact', draw: 'ribbon', values: { ...SMOOTH([25, 22, 18]), soft: 4, hit: 15, ease: 50, ...HEIGHTS, ...RIBBON, rim: 35 } },
  { id: 'attack', name: 'Attack', draw: 'ribbon', values: { ...ATTACK, ...HEIGHTS, ...RIBBON } },
  { id: 'pills', name: 'Pills', draw: 'pills', values: { ...ATTACK, ...HEIGHTS, w: 4.75, gap: 2.5, lock: 1 } },
  { id: 'narrow', name: 'Narrower pills', draw: 'pills', values: { ...ATTACK, ...HEIGHTS, w: 2.5, gap: 2, lock: 1 } },
  { id: 'ticks', name: 'Tapered ticks', draw: 'ticks', values: { ...ATTACK, ...HEIGHTS, w: 3, gap: 0.75, lock: 1 } },
];
export const lookOf = (id) => LOOKS.find((l) => l.id === id) ?? LOOKS[1];
/** What Direction 110 draws. */
export const DEFAULT = 'exact';

/**
 * How the beats are drawn, for every look but Today. Which beats are marked is
 * the app's own rule (Waveform2D.beats): every beat, a bar every four from the
 * first downbeat, bars only where a beat is under 6 px, on both halves. Grid
 * mode draws them in full, as they're being fixed there.
 */
export const LINES = [
  ['seam', 'Between the lanes', "One short tick for each, on the line between the lanes, so the two decks' beats stand back to back; a bar's is longer."],
  ['edges', 'Both edges', "A short tick for each at both edges of its lane, where they've always been; a bar's is longer."],
  ['ticks', 'Both edges, bars as lines', 'Longer ticks at both edges, and a faint line at each bar.'],
  ['full', 'Lines', 'A line on every beat, with its ticks.'],
];
/** The bar number at the play head. */
export const CHIPS = [
  ['quiet', 'Quiet', 'Small figures at the top of the play head, on the played side.'],
  ['pill', 'Pill', 'White, on the play head.'],
  ['none', 'Off', ''],
];
/** Registry settings: the look, and every look's values under `<look>-<value>`. */
export function settings() {
  const out = {
    pick: { type: 'choice', label: 'Look', default: DEFAULT, options: LOOKS.map((l) => [l.id, l.name]) },
    beats: { type: 'choice', label: 'Beat marks', default: 'seam', options: LINES },
    chip: { type: 'choice', label: 'Bar number', default: 'quiet', options: CHIPS },
  };
  for (const l of LOOKS) {
    for (const [k, v] of Object.entries(l.values)) {
      const [label, min, max, step, unit] = PARAMS[k];
      out[`${l.id}-${k}`] = { type: 'range', label: `${l.name}: ${label}`, min, max, step, unit, default: v, tuner: true };
    }
  }
  return out;
}
