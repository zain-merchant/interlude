// #94 (UI audit flag; a visual direction): Graphic.
//
// One of three whole-app looks for the beauty pass (92 Quiet, 93 Listening
// room, 94 Graphic). Only one is on at a time. Each sits on top of the
// round-2 picks and restyles the whole app from its own tokens in style.css;
// with the flag off nothing changes.
//
// Graphic: the site's display voice used as structure. Solid black panels
// (no frosted glass), bold tight type with the times and tempo set heavy,
// small capitals for every label, and one way to show "on": a dot that fills
// (the cue, stems and Rec dots, extended to every switch). Flat
// dials, segmented meters, waveforms printed flat. Instant motion.
export default {
  id: 'dir-graphic',
  n: 94,
  title: 'Direction C: Graphic',
  group: 'Direction',
  against: 'The Liquid Glass material (panels go solid), "Times and BPM are large and light" (set at 600 weight), and "One solid primary control, Play".',
  notes: 'Whole-app look in style.css. Waveform bands set on :root. The dot is drawn with ::before/::after on the toggles; the selected look is inverted (light pill, dark text).',
};

/** Show me: both decks playing, flipping between today and the Graphic look. */
export const show = {
  about: 'A bolder, poster-like look, taken from the website\'s big headings: solid black panels instead of frosted glass, heavy numbers for time and tempo, small capitals for labels, and one sign for "on" everywhere: a dot that fills in. Turn on one direction at a time.',
  before: 'Today: frosted panels, light numbers, and five different ways of showing that something is on.',
  after: 'Graphic: solid black, bold type, and a single sign for "on" (a filled dot), the same on every switch in the app.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
