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
  out: ['Outline', 0, 100, 1, '%', 'Drawing'],
  outw: ['Outline width', 0.5, 2, 0.25, 'px', 'Drawing'],
  glow: ['Glow', 0, 300, 5, '%', 'Drawing'],
  grad: ['Fade to the edges', 0, 100, 1, '%', 'Drawing'],
  w: ['Mark width', 0.5, 12, 0.25, 'px', 'Marks'],
  gap: ['Gap', 0.5, 8, 0.25, 'px', 'Marks'],
  lock: ['Pitch follows the beat', 0, 1, 1, '', 'Marks'],
};

const RIBBON = { out: 55, outw: 1, glow: 100, grad: 65 };
const ATTACK = SMOOTH([75, 55, 28]);

/** The looks in the order the step key goes through them: id, name, how it's drawn, and its values. */
export const LOOKS = [
  { id: 'today', name: 'Today', draw: null, values: {} },
  { id: 'exact', name: 'Today exact', draw: 'ribbon', values: { ...SMOOTH([25, 22, 18]), soft: 4, hit: 15, ease: 50, ...HEIGHTS, ...RIBBON } },
  { id: 'attack', name: 'Attack', draw: 'ribbon', values: { ...ATTACK, ...HEIGHTS, ...RIBBON } },
  { id: 'pills', name: 'Pills', draw: 'pills', values: { ...ATTACK, ...HEIGHTS, w: 4.75, gap: 2.5, lock: 1 } },
  { id: 'narrow', name: 'Narrower pills', draw: 'pills', values: { ...ATTACK, ...HEIGHTS, w: 2.5, gap: 2, lock: 1 } },
  { id: 'ticks', name: 'Tapered ticks', draw: 'ticks', values: { ...ATTACK, ...HEIGHTS, w: 3, gap: 0.75, lock: 1 } },
];
export const lookOf = (id) => LOOKS.find((l) => l.id === id) ?? LOOKS[1];
/** What Direction 110 draws. */
export const DEFAULT = 'exact';

/**
 * How the beats are marked, for every look but Today. Whatever's picked, Grid
 * mode shows them at full strength (`full`), as they're being fixed there.
 */
export const LINES = [
  ['near', 'Between the lanes, by the play head', 'Ticks on the line between the lanes, strongest at the play head and fading away from it; bars are longer, every fourth bar longest.'],
  ['seam', 'Between the lanes', "Ticks on the line between the lanes only, so the two decks' beats stand back to back."],
  ['match', 'Between the lanes, beats while matching', 'Bars only; beats while both decks play unsynced, during a nudge or a drag, or with the pointer over the waveforms.'],
  ['bars', 'Bars, beats when close', 'Faint bar lines; beats as ticks once zoomed in, or while matching.'],
  ['outer', 'Outer edges', 'Ticks on the top and bottom edges of the panel only.'],
  ['ruler', 'Ruler between the lanes', 'The same ticks on a dark strip, so loud sound never covers them.'],
  ['notch', 'Notches', 'A gap in the sound at each beat instead of a mark; wider at a bar.'],
  ['behind', 'Behind the sound', 'Lines that pass under the waveform.'],
  ['zoom', 'Every fourth bar, the rest by zoom', 'Lines: every fourth bar strongest, bars and beats fading as you zoom out.'],
  ['ticks', 'Edge ticks', 'Ticks at all four edges; bars are lines.'],
  ['faint', 'Fainter lines', 'A line on every beat, about a third as strong.'],
  ['dots', 'Bars and dots', 'Bars are lines; beats are dots on the rims.'],
  ['full', 'Full lines', "As strong as today's."],
];
/** The bar number at the play head. */
export const CHIPS = [
  ['quiet', 'Quiet', 'Small figures beside the play head, at the line between the lanes.'],
  ['pill', 'Pill', 'White, on the play head.'],
  ['none', 'Off', ''],
];
/** What the part behind the play head shows. */
export const PLAYED = [
  ['bare', 'Dimmed, no marks', 'No beat marks past the last beat.'],
  ['deep', 'Dimmed further, no marks', ''],
  ['veil', 'Dimmed', "As today's."],
];

/** Registry settings: the look, and every look's values under `<look>-<value>`. */
export function settings() {
  const out = {
    pick: { type: 'choice', label: 'Look', default: DEFAULT, options: LOOKS.map((l) => [l.id, l.name]) },
    marks: { type: 'choice', label: 'Beat marks', default: 'near', options: LINES },
    chip: { type: 'choice', label: 'Bar number', default: 'quiet', options: CHIPS },
    played: { type: 'choice', label: 'Played half', default: 'bare', options: PLAYED },
  };
  for (const l of LOOKS) {
    for (const [k, v] of Object.entries(l.values)) {
      const [label, min, max, step, unit] = PARAMS[k];
      out[`${l.id}-${k}`] = { type: 'range', label: `${l.name}: ${label}`, min, max, step, unit, default: v, tuner: true };
    }
  }
  return out;
}
