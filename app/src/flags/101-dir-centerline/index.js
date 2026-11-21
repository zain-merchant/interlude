// #101 (UI audit flag; a visual direction): Centerline.
//
// A swing at the layout, not the surface. The two scrolling waveforms stop
// being two lanes and become one picture: the left deck's track rises from
// a shared centre line, the right deck's hangs from it, under one play
// head, across the full width and most of the window's height. You see the
// mix rather than two tracks. Each deck's title, tempo and time remaining
// sit in the field's corners (the left deck along the top edge, the right
// deck along the bottom), where the eye already is. The decks shrink to a
// console of controls under the field, and the library keeps the bottom.
// The surface is #99's (solid plates, raised keys, segmented tabs),
// crisper, with Play latched flat in the deck's colour.
//
// Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-centerline',
  n: 101,
  title: 'Direction: Centerline',
  group: 'Direction',
  against: 'The layout in the design doc ("waveform lanes on top, deck, mixer and deck below them"): the lanes become one field on a shared axis that takes most of the window, and the decks\' titles, tempos and times move into its corners. Also the Liquid Glass blur and "one solid primary control, Play", as in #99.',
  notes: 'style.css is built from two sources with a short prefix (every rule is under the tripled :root[data-flag-dir-centerline] attribute): the material (from #99, crisper) and the layout. Hooks: Waveform.svelte passes half: \'up\' | \'down\' to the scrolling lanes and waveform-2d.js draws a half ribbon on the lane\'s edge (ribbonShape, band\'s gradient, the tile key); Mixer.svelte sizes the channel dials for three rows (dialRows), shared with #102. The library row is clamp(160px, --lib − 98px, 60vh), so the handle still works both ways, within App.svelte\'s range for --lib (160 to about 410px). only-one.svelte.js keeps one Direction flag on at a time.',
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about: 'The two waveforms share one centre line and fill the top of the window: the left deck\'s track rises from the line, the right deck\'s hangs from it, so you see how the two fit together beat by beat. Each deck\'s title, tempo and time remaining sit in the corners of that field; the decks below are just their controls. Turn on one direction at a time.',
  before: 'Today: two thin lanes over three tall panels, with the times and tempos down in the decks.',
  after: 'Centerline: the mix as one picture across half the window, the time and tempo at its corners, the controls underneath.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
