// #105 (UI audit flag; a visual direction): Pebble.
//
// A swing in how the app speaks: everything is a filled, round shape, and an
// amount is how much is filled. Keys are pills; a dial is a filled wedge
// round a raised cap; a channel fader a capsule that fills to a round thumb;
// meters are capsules; a hot cue is a numbered disc that fills when set; the
// scrolling waveform is a row of beads on the beat grid, one per sixteenth
// at the default zoom. The letters are rounded too. On is a pill filled with
// its role colour at low strength; playing is Play alone, in its deck's
// colour at full strength.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-pebble',
  n: 105,
  title: 'Direction: Pebble',
  group: 'Direction',
  against:
    'The design doc\'s type ("Geist Variable … times and BPM are large and light"): SF Pro Rounded (ui-rounded in WebKit), a macOS system face, at 600. Its liquid ribbon waveform: beads on the beat grid. Its outlined controls and "one solid primary control, Play", as in #100.',
  notes:
    "style.css is built from two parts: flag 100's plates and keys (neutral, so the swing is the language, not the material) and Pebble's language layer; every rule is under the tripled :root[data-flag-dir-pebble] attribute. Hooks: Waveform.svelte passes look: 'beads'; waveform-2d.js hands the lane and the overview to wave.js here (and keys its tiles and overview cache on the look). Dials are pure CSS: a conic wedge drawn in the dial's turning frame from --rot. The rounded face is a macOS system font; another platform falls back to Geist.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    'Everything round and filled: pill keys, dials that fill a wedge, faders and meters as capsules, hot cues as discs, and the waveform as beads on the beat. Turn on one direction at a time.',
  before: 'Today: glass panels, outlined buttons, thin light numbers and a glowing ribbon waveform.',
  after: 'Pebble: round, filled shapes that show amounts by how full they are, rounded type, and beads that count the beat.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
