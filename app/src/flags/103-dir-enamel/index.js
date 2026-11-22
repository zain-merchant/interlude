// #103 (UI audit flag; a visual direction): Enamel.
//
// A swing at the material. The app as a piece of enamelled equipment: every
// plate is white vitreous enamel, set in a near-black cast-iron frame that
// shows as the seams between plates. Nothing is a screen: the sound is
// printed on the enamel in ink, Prussian blue for the left deck and umber
// for the right, with the playheads and legends in black. A playing deck's
// Play key is a solid tile of its ink. Built on #100's panels, keys and
// grooves (forked, so it ships alone), on its light ground.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-enamel',
  n: 103,
  title: 'Direction: Enamel',
  group: 'Direction',
  against:
    'The Liquid Glass material and the graphite room in the design doc: the plates are white enamel in a dark iron frame, and the waveforms are printed in ink on them rather than lit on a dark screen. Also "one solid primary control, Play" (playing, Play is a tile of its deck\'s ink).',
  notes:
    "style.css is built (work/build.py in the direction's folder) from #100's two sources, forked, then this direction's own; every rule is under the tripled :root[data-flag-dir-enamel] attribute, since the sheet loads before flags 11 to 99 in path order. The printed waveforms are the renderer's canvases shown with filter: invert(1) hue-rotate(180deg): lightness flips and hue stays, so the colours the renderer reads (--a-low and so on, on :root) are the light twins of the inks. Deck.svelte puts the tempo's decimals in a span.frac while this flag is on. only-one.svelte.js keeps one Direction flag on at a time.",
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about:
    'White enamel plates in a dark iron frame, with the sound printed on them in two inks: Prussian blue for the left deck, umber for the right. No screens, no glow. Turn on one direction at a time.',
  before: 'Today: glass panels on graphite, the sound lit on dark screens.',
  after: 'Enamel: white plates in an iron frame, the sound printed on them in ink.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
