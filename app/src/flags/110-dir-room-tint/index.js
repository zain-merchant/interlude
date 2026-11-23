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
    import('./glint.svelte.js');
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
    stepper: {
      type: 'choice',
      label: 'Steppers',
      default: 'split',
      options: [
        ['split', 'Two keys and a well', 'A raised key each side, the amount sunk between them.'],
        ['under', 'Keys in a cut', 'One cut; the keys stand in it and the amount is its floor.'],
        ['seam', 'Touching', 'The same as the first, with only a seam between.'],
        ['one', 'One cut', 'As it was: no keys until the pointer is over an end.'],
      ],
    },
    step: {
      type: 'choice',
      label: "A one-cut stepper's end (and the zoom's) under the pointer",
      default: 'rise',
      options: [
        ['rise', 'Rises', 'A small key comes up out of the cut, and goes in when held.'],
        ['sink', 'Sinks', 'The end goes deeper into the cut.'],
        ['tint', 'Tints', 'A lighter tone, no depth.'],
      ],
    },
    drop: {
      type: 'choice',
      label: 'Where a dragged track can land',
      default: 'tint',
      options: [
        ['tint', 'A tint', 'Every place takes a breath of its colour; the one under the pointer more, with one thin edge.'],
        ['pick', 'Only under the pointer', 'Nothing until you reach a place.'],
        ['label', 'With a label', 'Only under the pointer, saying what dropping does.'],
      ],
    },
    playing: {
      type: 'choice',
      label: "Dragging over a deck that's playing",
      default: 'words',
      options: [
        ['words', 'It says so', "The deck's own tint, and a line: dropping once warns, twice replaces it."],
        ['quiet', 'Like any deck', "The deck's own tint and nothing else; the first drop still warns."],
        ['red', 'A red edge', 'As it was: a fainter tint, a red edge and the line in red.'],
      ],
    },
    on: {
      type: 'choice',
      label: "A key that's on",
      default: 'ink',
      options: [
        ['ink', 'Only its glyph or label', 'The key is in, and its glyph or label takes the colour. Rec has red in it while it records.'],
        ['breath', 'A breath of colour', 'The same, with a trace of the colour in the fill.'],
      ],
    },
    setcue: {
      type: 'choice',
      label: 'A set hot cue',
      default: 'tint',
      options: [
        ['tint', 'Its colour in the fill', 'Quick to tell one from another.'],
        ['ink', 'Its colour in the number', 'The fill stays dark.'],
      ],
    },
    figures: {
      type: 'choice',
      label: "The meters' figures",
      default: 'off',
      options: [
        ['off', 'Ticks only', 'Marks at 0, 6 and 18 dB.'],
        ['on', 'With figures', 'The same marks, numbered.'],
      ],
    },
    side: {
      type: 'choice',
      label: "The library's sidebar",
      default: 'list',
      options: [
        ['list', 'The list is a plate', 'The track list is a cut plate inside the panel; the sidebar stands on the panel.'],
        ['line', 'A full rule', 'One panel, an etched rule from its top to its foot.'],
        ['ground', 'Darker ground', "The sidebar on darker ground, to the panel's edges."],
        ['dock', 'The sidebar is a plate', 'The sidebar is a cut plate inside the panel.'],
        ['split', 'Two panels', 'The sidebar is a panel of its own, like the decks.'],
      ],
    },
    lanes: { type: 'range', label: 'Grooves behind the waveforms', min: 0, max: 100, step: 1, default: 8, unit: '' },
    overview: {
      type: 'choice',
      label: "Grooves behind each deck's overview",
      default: 'quiet',
      options: [
        ['quiet', 'None', 'Like the lanes: only the waveform.'],
        ['rings', 'As in the other cuts', 'The rings show where the track is quiet.'],
      ],
    },
    cut: {
      type: 'choice',
      label: "A cut's edge",
      default: 'crisp',
      options: [
        ['crisp', 'Two lines', 'A dark line inside the top, a light one on the lower lip, no blur.'],
        ['rim', 'Two lines and a rim', 'The same, with a thin dark line all round inside.'],
        ['step', 'A hard shadow', 'The same, with a 2px shadow under the top edge, no blur.'],
        ['soft', 'Blurred', 'As it was: a blurred shadow inside.'],
      ],
    },
    glint: {
      type: 'choice',
      label: 'Grooves under the pointer',
      default: 'fixed',
      options: [
        ['fixed', 'Catch the light', 'A soft band, always in the same place.'],
        ['follow', 'Follow the pointer', 'The band leans a little towards the pointer.'],
        ['off', 'Nothing', 'As they were.'],
      ],
    },
    light: { type: 'range', label: 'How much light', min: 1, max: 16, step: 1, default: 5, unit: '' },
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
    "style.css is built from flag 100's current sheet (dark, without its keys and mixer sections) and this direction's layer, in the scratchpad's directions5/work (build.py, tint.src.css); every rule is under the tripled :root[data-flag-dir-room-tint] attribute, the key states under eight of it so they outrank #9's and #14's. The deck tints are generated: each of 100's steps at its own OKLCH lightness with a little chroma in the deck's hue. Hooks, gated on this flag: Deck.svelte (the tempo's decimals and the pitch readout's parts in spans), Performance.svelte (the Loop row: one key, then the length), Stems.svelte (the four stems stay in view, off, while the model is missing), Platter.svelte (class long for an hour-long track), Waveform.svelte (waveOptions() from wave.js), waveform-2d.js (chipTop), Library.svelte (column order, columns.js on the headings, ColumnsMenu.svelte). Mid.svelte cuts long names in the middle. Fader.svelte takes the volume faders' marks from Mixer.svelte.",
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
