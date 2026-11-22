// #107 (UI audit flag; a visual direction): Field.
//
// A light, graphic answer. Each deck is a sheet of its own colour (a clear
// sky blue for the left, apricot for the right), cut from card and laid on a
// light table, with crisp short shadows and no gradients. The sound is
// printed on the sheet tone-on-tone in the deck's deep inks, so there are no
// black screens. Each mixer channel stands on its deck's sheet; the master is
// on paper. Keys are white card tiles. On is a tile gone to black ink; Play,
// while it plays, is the one tile in its deck's full colour. An empty deck is
// plain paper: the colour arrives with the track.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-field',
  n: 107,
  title: 'Direction: Field',
  group: 'Direction',
  against:
    '"The app is dark only", the Liquid Glass material and the additive "liquid ribbon" on black (docs/design-direction.md): light card surfaces, each deck a solid sheet of its colour, and the ribbon printed dark on light in the deck\'s own inks.',
  notes:
    "Whole-app look in style.css (every rule under the tripled :root[data-flag-dir-field] attribute). Hooks: Waveform.svelte passes look: 'field'; waveform-2d.js hands that draw to wave.js here (its own tile and overview caches, keyed on the look); Deck.svelte's tempo-decimals span also turns on for this flag. The waveform inks are the theme's --a-low/--deck-a/--a-high (and b), set by style.css on :root, so the canvas reads them as it does today.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    "A light look in solid colour: each deck is a sheet of its own colour with the sound printed on it in that colour's deep inks, the keys are white card, and on is black ink. Turn on one direction at a time.",
  before: 'Today: dark glass panels and a glowing ribbon waveform.',
  after: 'Field: two coloured sheets, the sound printed on them, white keys and ink.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
