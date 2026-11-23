// #110 (UI audit flag; a visual direction): Room, tinted.
//
// Flag 100 (Room, graphic), the owner's base, refined with what worked in
// 105 (Pebble) and a trace of 108 (Ground). Each deck's side is faintly
// tinted in its colour. Keys are raised and Play leads; on is pressed in and
// tinted; nothing moves when it's pressed. Tracks, fields, readouts and every
// minus and plus are cut in. Hot cues are ghosts until they're set. Short
// etched rules set parts off. The list's columns drag to size and order.
// One focus line, and one drawing for every place a track can be dropped.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined')
  setTimeout(() => {
    import('./only-one.svelte.js');
    import('./drops.svelte.js');
  }, 0);

export default {
  id: 'dir-room-tint',
  n: 110,
  title: 'Direction: Room, tinted',
  group: 'Direction',
  against:
    '"One solid primary control, Play" (Play is a key like the rest until it plays; playing, it is a flat face in its deck\'s colour), "Times and BPM are large and light" (set at 600 weight, smaller, so they lead without shouting) and the Liquid Glass blur (panels are solid), as in #100.',
  settings: {
    cues: {
      type: 'choice',
      label: 'Hot cues',
      default: 'foot',
      options: [
        ['socket', 'Sockets', 'An empty place is its number in a small recess.'],
        ['foot', 'Feet', 'A number over a short etched rule.'],
        ['corner', 'Corner ticks', "A number, and a tick in its place's corner."],
        ['next', 'Next only', 'Numbers alone; only the next free place is a key, and says Set.'],
      ],
    },
    rules: {
      type: 'choice',
      label: "Library's rules",
      default: 'inset',
      options: [
        ['inset', 'Inset', 'Neither the sidebar\'s rule nor the headings\' reaches an edge.'],
        ['full', 'Edge to edge', 'Both run the whole way.'],
      ],
    },
    cue: {
      type: 'choice',
      label: "Cue's colour",
      default: 'amber',
      options: [
        ['amber', 'Amber on both decks', 'The Cue key and the headphone cue are amber, as on DJ hardware; the side\'s tint says which deck.'],
        ['deck', "Each deck's colour", 'Cue and its headphone cue are blue on the left and warm on the right.'],
      ],
    },
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
    "style.css is built from flag 100's current sheet (dark, without its keys and mixer sections) and this direction's layer, in the scratchpad's directions5/work (build.py, tint.src.css); every rule is under the tripled :root[data-flag-dir-room-tint] attribute, the key states under eight of it so they outrank #9's and #14's. The deck tints are generated: each of 100's steps at its own OKLCH lightness with a little chroma in the deck's hue. Hooks, gated on this flag: Deck.svelte (the tempo's decimals and the pitch readout's parts in spans), Performance.svelte (the Loop row: one key, then the length), Stems.svelte (the four stems stay in view, off, while the model is missing), Platter.svelte (class long for an hour-long track), Waveform.svelte (waveOptions() from wave.js), waveform-2d.js (chipTop), Library.svelte (column order, columns.js on the headings, ColumnsMenu.svelte). drops.svelte.js draws the drop targets.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    "Each deck's side faintly tinted in its colour, and one way for every button to behave: raised until you press it, pressed in while it's on. Turn on one direction at a time.",
  before: 'Today: glass panels lit from nowhere, outlined buttons, light numbers, and green meters.',
  after: "Room, tinted: solid panels in clear layers, each side a breath of its deck's colour, keys that stay in while they're on, and hot cues lit in their colours.",
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
