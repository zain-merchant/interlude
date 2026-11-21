// #97 (UI audit flag; a visual direction): Graphic, raised.
//
// Round 2 of the directions. Round 1's Graphic (94) had the best text
// hierarchy but shouted: capitals on every label, corner dots, inverted
// pills. This keeps what worked (solid panels, heavy numerals that lead) and
// rebuilds the rest: sentence case, keys that are raised and sink when
// pressed, a segmented control for the deck tabs, four readable layers
// (page, panel, sunk screen, raised key), and today's waveforms untouched.
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-graphic2',
  n: 97,
  title: 'Direction: Graphic, raised',
  group: 'Direction',
  against:
    '"Times and BPM are large and light" (set at 600 weight so they lead), the Liquid Glass material (panels go solid), and "One solid primary control, Play" (Play is a key like the rest; playing, it stays down and its glyph takes the deck colour).',
  notes:
    "Whole-app look in style.css, from the tokens at its top. Waveform band colours are today's; only the hot cue palette changes (Waveform.svelte re-reads it when the flag flips).",
};

/** Show me: both decks playing, flipping between today and this look. */
export const show = {
  about:
    "A graphic look done carefully: solid panels, heavy numbers for time left and tempo so they are the first thing you read, plain sentence-case labels, buttons that look raised and sink when pressed, and the deck tabs as one segmented switch. Today's waveforms are kept. Turn on one direction at a time.",
  before: 'Today: frosted panels, light numbers, and the brightest things on screen are the Play buttons and the green meters.',
  after: 'Graphic, raised: time left and tempo lead. Every button is a raised key; anything that is on stays pressed in, with its label in its own colour.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
