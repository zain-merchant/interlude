// #110 (UI audit flag; a visual direction): Room, tinted.
//
// Round 5: flag 100 (Room, graphic), the owner's base, refined with what
// worked in 105 (Pebble) and a trace of 108 (Ground). Each deck's side
// carries a barely-there tint of its colour: 100's ladder of greys at the
// same lightness, with a little chroma in the deck's hue, so it reads as
// "this side is the blue deck" without a coloured panel. The record
// grooves line every cavity cut into a surface, the record's bed included. From Pebble, in 100's softer shapes: dials fill a ring
// with their amount, on is a key tinted with its role colour, fader thumbs
// are raised discs, hot cues numbered discs, meters capsules with colour.
// Amber is Cue's again.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-room-tint',
  n: 110,
  title: 'Direction: Room, tinted',
  group: 'Direction',
  against:
    '"One solid primary control, Play" (Play is a key like the rest until it plays; playing, it is a flat face in its deck\'s colour), "Times and BPM are large and light" (set at 600 weight, smaller, so they lead without shouting) and the Liquid Glass blur (panels are solid), as in #100.',
  settings: {
    meters: {
      type: 'choice',
      label: 'Meters',
      default: 'level',
      options: [
        ['level', 'Level colours', 'Green, yellow-green for the top 6 dB, red over 0 dB. The tinted sides already say which deck is which, so the meters say how loud.'],
        ['deck', 'Deck colours', "Each channel in its deck's colour, the master in white (100's meters, as capsules)."],
      ],
    },
  },
  notes:
    "style.css is built from flag 100's current sheet (dark, lane titles on a small plate) and this direction's layer, in the scratchpad's directions5/work (build.py, tint.src.css); every rule is under the tripled :root[data-flag-dir-room-tint] attribute. The deck tints are generated: each of 100's steps at its own OKLCH lightness with a little chroma in the deck's hue, declared on the deck, with 100's composite recipes declared again there. Hooks, all gated on this flag: Deck.svelte (the tempo decimals span), Waveform.svelte (spreads waveOptions() from wave.js, empty today: the place a new waveform style drops in) and Platter.svelte (class long on the record's centre for an hour-long track, so its times fit).",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    "100's panels, layers and raised keys, with each deck's side faintly tinted in its colour, the record's grooves in every cavity, and Pebble's filled dials, disc thumbs and numbered cue discs. Turn on one direction at a time.",
  before: 'Today: glass panels lit from nowhere, outlined buttons, light numbers, and green meters.',
  after: 'Room, tinted: solid panels in clear layers, each side a breath of its deck\'s colour, dials that fill, and keys that show on in their colour.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
