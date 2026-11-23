// #110 (UI audit flag; a visual direction): Room, tinted.
//
// Flag 100 (Room, graphic), the owner's base, refined with what worked in
// 105 (Pebble) and a trace of 108 (Ground). Each deck's side is faintly
// tinted in its colour. One state system covers everything you press: up,
// or down 1px; hover lightens, held is down, on stays down. The record
// grooves line the cavities. The knurled dials and lined fader thumbs are
// the app's own. Hot cues are pads, the tabs' pill slides, and Loop, FX,
// Stems and Grid are laid out as keys, groups and readouts. Amber is Cue's.
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
    cues: {
      type: 'choice',
      label: 'Hot cues',
      default: 'tile',
      options: [
        ['tile', 'Flat tiles', 'An empty place is a flat tone with its number.'],
        ['tray', 'One tray', 'All eight on one flat tone, parted by thin gaps.'],
        ['ledge', 'Ledges', 'A number over a short bar, no tile.'],
        ['bare', 'Bare', 'The number alone.'],
      ],
    },
    zoom: {
      type: 'choice',
      label: 'Waveform zoom',
      default: 'float',
      options: [
        ['float', 'Over the waveform', 'Upright at the right, the sound passing under it.'],
        ['bar', 'Top right of the window', 'On one line, out of the waveform.'],
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
    "style.css is built from flag 100's current sheet (dark, lane titles on a small plate, without its keys and mixer sections) and this direction's layer, in the scratchpad's directions5/work (build.py, tint.src.css); every rule is under the tripled :root[data-flag-dir-room-tint] attribute, the key states under eight of it so they outrank #9's and #14's. The deck tints are generated: each of 100's steps at its own OKLCH lightness with a little chroma in the deck's hue. Hooks, gated on this flag: Deck.svelte (the tempo's decimals span, and the pitch readout's sign, number and unit in spans), Stems.svelte (the four stems stay in view, off, while the model is missing), Platter.svelte (class long for an hour-long track), Waveform.svelte (spreads waveOptions() from wave.js: the place a new waveform style drops in, today only chipTop), waveform-2d.js (chipTop: the overview's cue chips stand clear of its top edge).",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    "Each deck's side faintly tinted in its colour, and one way for every button to behave: raised until you press it, pressed in while it's on. Turn on one direction at a time.",
  before: 'Today: glass panels lit from nowhere, outlined buttons, light numbers, and green meters.',
  after: "Room, tinted: solid panels in clear layers, each side a breath of its deck's colour, keys that stay down while they're on, and cue pads lit in their colours.",
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
