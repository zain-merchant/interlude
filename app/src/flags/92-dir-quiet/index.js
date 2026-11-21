// #92 (UI audit flag; a visual direction): Quiet.
//
// One of three whole-app looks for the beauty pass (92 Quiet, 93 Listening
// room, 94 Graphic). Only one is on at a time (only-one.svelte.js). Each sits
// on top of the round-2 picks (every recommended flag on) and restyles the
// whole app from its own tokens in style.css; with the flag off nothing
// changes. The idea, rules and risks are in the directions README.
//
// Quiet: an Apple pro app at night. Nothing shines except what you read:
// remaining time and tempo are the brightest things on screen. Controls are
// tone, not outlines; "on" is a tint of the thing's own colour; the mixer is
// flat discs and thin deck-coloured meters; waveforms peak at the deck's
// colour, never white. Signature: each deck panel's top edge catches its
// deck's light.
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-quiet',
  n: 92,
  title: 'Direction A: Quiet',
  group: 'Direction',
  against: '"One solid primary control, Play" and the outlined-control depth step: Play becomes a tint of its deck colour and no control has an outline.',
  notes: 'Whole-app look in style.css (tokens first, then decks, mixer, library, overlays). Waveform bands set on :root (Waveform.svelte re-reads them). One direction at a time: only-one.svelte.js.',
};

/** Show me: both decks playing, flipping between today and the Quiet look. */
export const show = {
  about: 'A calmer look for the whole app. The numbers you read while mixing (time left and tempo) become the brightest things on screen; buttons lose their outlines, the mixer loses its shiny knobs and green meters, and a button that is on simply takes on its own colour. Turn on one direction at a time.',
  before: "Today: pale Play buttons, white-hot waveforms and green meters catch the eye before the time and tempo.",
  after: 'Quiet: the time and tempo lead, everything else steps back, and every "on" looks the same (a tint of its own colour).',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
