// #102 (UI audit flag; a visual direction): Crate.
//
// A swing at the layout, not the surface. Choosing the next record is most
// of a DJ's time, so the library is the main place: it takes the top of
// the window, roomy, with larger rows. The decks become a controller strip
// under it, by your hands: the two scrolling lanes, then deck, mixer and
// deck, each a compact panel: title and tempo on top, the time remaining
// beside the overview, then its controls. The surface is #99's (solid plates, raised keys,
// segmented tabs), crisper, with Play latched flat in the deck's colour.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-crate',
  n: 102,
  title: 'Direction: Crate',
  group: 'Direction',
  against: 'The layout in the design doc ("waveform lanes on top, deck, mixer and deck below them, the library at the bottom"): the library moves to the top and the decks become a strip under it. Also the Liquid Glass blur and "one solid primary control, Play", as in #99.',
  notes: 'style.css is built from two sources with a short prefix (every rule is under the tripled :root[data-flag-dir-crate] attribute): the material (from #99, crisper) and the layout, which places the app\'s rows with grid areas. Hooks: Library.svelte puts rows on a 40px pitch (ROW); Mixer.svelte sizes the channel dials for three rows (dialRows), shared with #101. only-one.svelte.js keeps one Direction flag on at a time.',
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about: 'The library moves to the top of the window and gets room: larger rows you can read from a step back. The decks become a strip under it, by your hands: both waveforms, then each deck in one compact panel: title and tempo on top, the time remaining beside the overview. Turn on one direction at a time.',
  before: 'Today: the decks and waveforms take the top two thirds, and the library is what\'s left.',
  after: 'Crate: the library is the main place, and the decks are a controller under it.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
