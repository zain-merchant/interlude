// #106 (UI audit flag; a visual direction): Liner.
//
// A swing in how the app speaks: set like a record's liner notes. A serif
// for everything you read (titles, artists in italic, times, tempo, key,
// the library, dialogs), Geist for what you press. The times say what they
// are ("played", "left"). Being on is emphasis: a latched key's label in
// the serif's italic, in its role colour. Playing, Play is ringed in its
// deck's colour, the glyph in it. Waveforms are printed ink: today's three
// bands as flat fills, no glow.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-liner',
  n: 106,
  title: 'Direction: Liner',
  group: 'Direction',
  against:
    'The design doc\'s type ("Geist Variable … times and BPM are large and light"): New York (ui-serif in WebKit), a macOS system face, for everything you read. Its liquid ribbon\'s glow: flat ink. "One solid primary control, Play": playing is a ring in the deck\'s colour.',
  notes:
    "style.css is built from two parts: flag 100's plates and keys (neutral, so the swing is the language, not the material) and Liner's language layer; every rule is under the tripled :root[data-flag-dir-liner] attribute. Hooks: Waveform.svelte passes look: 'ink'; waveform-2d.js hands the lane and the overview to wave.js here (and keys its tiles and overview cache on the look). \"played\" and \"left\" are CSS content after the times. The serif is a macOS system font; another platform falls back to Iowan Old Style or Georgia.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    'The app set like liner notes: a serif for what you read, plain keys for what you press, times that say "played" and "left", and waveforms printed in flat ink. Turn on one direction at a time.',
  before: 'Today: one sans for everything, light numbers, and a glowing ribbon waveform.',
  after: 'Liner: titles, times and the library in a serif, state shown as emphasis, and flat printed waveforms.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
