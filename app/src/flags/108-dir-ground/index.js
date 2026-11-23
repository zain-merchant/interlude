// #108 (UI audit flag; a visual direction): Ground.
//
// A dark full swing: each deck stands on a ground of its own colour, night
// blue on the left and tobacco on the right, and everything that belongs to
// a deck is a tone of that ground (its waveform lane, its plate, the wells
// cut into it, its keys, its text in the ground's pale twin). What's shared
// is black: the room, the mixer's master spine, the library, where the rows
// loaded on a deck come back in its ground. The two grounds meet in the
// mixer, and the crossfader runs from one to the other.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-ground',
  n: 108,
  title: 'Direction: Ground',
  group: 'Direction',
  against:
    'The design doc\'s "Liquid Glass on graphite" and its one neutral surface: each deck\'s plate, lane and keys are tones of a deep ground in its colour, with no glass and no blur.',
  notes:
    'style.css is built from the direction folder\'s work/ground.src.css; every rule is under the tripled :root[data-flag-dir-ground] attribute. Each region sets one family of --gd-* tokens (its ground) and every recipe reads them, so a key, dial or slot takes the tone of whatever ground it stands on. State is a step up that ladder: a key at rest, a latched key a lighter flat tone, Play while playing the pale face. Hooks: Deck.svelte (the tempo\'s decimals span), Waveform.svelte passes veil: \'ground\', and waveform-2d.js tints the played veil with the deck\'s ground instead of grey. The record takes its deck\'s ground through --record-mat (the well), --record-tint (the low step) and --record-high (the pale twin); its hub is a well and the tonearm is built from the dial materials.',
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    'Each deck on a ground of its own colour, night blue and tobacco, with its lane, plate, keys and text all tones of it; the mixer is where the two meet, and the library stays black. Turn on one direction at a time.',
  before: 'Today: one graphite glass for every panel, the decks told apart by small accents.',
  after: 'Ground: each deck is its colour, from its waveform lane down to its keys.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
