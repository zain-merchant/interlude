// #104 (UI audit flag; a visual direction): Alloy.
//
// A swing at the material. The app as one machined aluminium faceplate:
// bead-blasted silver plates set in a dark anodised chassis, black glass
// set into the metal wherever sound is shown (the waveform window, the
// overviews, the meters), and dark rubber keys standing on the metal.
// Colour lives only in anodised parts: a playing deck's Play key, in its
// deck's ice or champagne, and the meters. Neither a dark nor a light
// appearance: a mid-valued object. Built on #100's panels, keys and
// grooves (forked, so it ships alone).
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-alloy',
  n: 104,
  title: 'Direction: Alloy',
  group: 'Direction',
  against:
    'The Liquid Glass material and the graphite room in the design doc: the plates are bead-blasted aluminium with black glass set in for sound and dark rubber keys. Also "one solid primary control, Play" (playing, Play is anodised in its deck\'s colour).',
  notes:
    "style.css is built (work/build.py in the direction's folder) from #100's two sources, forked, then this direction's own; every rule is under the tripled :root[data-flag-dir-alloy] attribute, since the sheet loads before flags 11 to 99 in path order. Three text polarities: ink on the metal, light legends on the rubber keys (set as --fg tokens on the key group), and light on the black glass. Deck.svelte puts the tempo's decimals in a span.frac while this flag is on. only-one.svelte.js keeps one Direction flag on at a time.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    'One machined aluminium faceplate: silver plates, black glass where the sound is, dark rubber keys, and colour only where a part is anodised (a playing Play key, the meters). Turn on one direction at a time.',
  before: 'Today: glass panels on graphite.',
  after: 'Alloy: a silver instrument with black glass and rubber keys.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
