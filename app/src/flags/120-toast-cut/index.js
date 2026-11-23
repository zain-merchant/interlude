// #120 (UI audit flag; on 110): the toast's Undo is a cut that holds its keys.
//
// 110's recess (its grooves and edge), 4px in from the toast on three sides,
// with Command and Z raised in it. A cut alone reads as a readout, so it says
// it can be pressed: the word is the toast's own weight and brightness;
// pointed at, the grooves catch the light and the keys brighten; held, the
// keys go down into it and the whole cut darkens.
export default {
  id: 'toast-cut',
  n: 120,
  title: 'Undo is a cut that holds its keys',
  group: 'Shell',
  byDefault: true, // approved, on for judging with 110; does nothing without it
  notes: 'style.css; Keys.svelte (116) draws the keys. Hook: App.svelte, the toast.',
};

/** Show me: a toast. */
export const show = {
  about: 'The toast’s Undo is a depression like the app’s others, with its two keys in it.',
  before: 'Undo is one raised key with small grey text on it.',
  after: 'A cut with the record’s grooves, and the keys to press raised in it.',
  target: '.toastbox .undo',
};
