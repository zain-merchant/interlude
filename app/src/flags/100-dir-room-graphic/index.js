// #100 (UI audit flag; a visual direction): Room, graphic.
//
// Round 3: the owner's two favourites from round 2 in one. 99 (Listening
// room) gives the build: panels in clear layers, raised keys with a soft
// lift, the record grooves in the tab switch and behind the waveforms, the
// knurled dials, labels for the EQ kills, one-line beat jump and lane titles
// on a small plate. 97 (Graphic, raised) gives the type, the keys and the
// spacing, and hot cues 1 and 2 that aren't amber. Then it's cleaned up:
// neutral greys instead of warm ones, one clear value step between layers,
// hard 1px edges, smaller figures, a balanced deck header, coloured meters,
// and a playing deck you can see from across the room (Play is a flat face
// in the deck's colour, no gradient).
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-room-graphic',
  n: 100,
  title: 'Direction: Room, graphic',
  group: 'Direction',
  against:
    '"One solid primary control, Play" (Play is a key like the rest until it plays; playing, it is a flat face in its deck\'s colour), "Times and BPM are large and light" (set at 600 weight, a little smaller, so they lead without shouting) and the Liquid Glass blur (panels are solid).',
  settings: {
    title: {
      type: 'choice',
      label: 'Lane titles',
      default: 'plate',
      options: [
        ['plate', 'Small plate', 'A small raised plate over the waveform, like the zoom control: the clearest, but it covers the most.'],
        ['inset', 'Cut in', 'A small recess in the waveform window with the title in it.'],
        ['label', 'Label only', 'Just the title, held off the waveform by a soft dark halo.'],
      ],
    },
    mode: {
      type: 'choice',
      label: 'Appearance',
      default: 'dark',
      options: [
        ['dark', 'Dark', 'Graphite panels in a dark room.'],
        ['light', 'Light', "The site's paper: the panels become paper, the keys raised paper in ink, and everything that shows sound stays on black screens set into it."],
      ],
    },
  },
  notes:
    "Whole-app look in style.css (built from a source with a short prefix; every rule is under the tripled :root[data-flag-dir-room-graphic] attribute, since the sheet loads before flags 11 to 99 in path order and has to out-rank their ties). Tokens first, then the room, decks, keys, mixer, library, floating layer, dialogs, settings, and last the light appearance. Deck.svelte puts the tempo's decimals in a span.frac while this flag (or 97, 98) is on; ship that span with it. only-one.svelte.js keeps one Direction flag on at a time. Upstream's record, key menu button, Grid tab, library chips and filter, sampler row, Settings popup and Controller setup are styled in the source's last section (\"Upstream's new UI\"): the record's mat comes through --record-mat, its centre is a small plate with the times in the deck figures' weight, and the tonearm's pivot is a knurled dial.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    "The listening room's panels, layers and raised keys, set in the graphic direction's type, and made crisp: clean greys, one clear step between each layer, hard edges. A playing deck's Play key fills with its colour. Turn on one direction at a time.",
  before: 'Today: glass panels lit from nowhere, outlined buttons, light numbers, and green meters.',
  after: 'Room, graphic: solid panels in clear layers, keys you could press, firm numbers that lead, and Play that shows at a glance which deck is playing.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
