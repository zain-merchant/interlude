// #99 (UI audit flag; a visual direction): Listening room, done well.
//
// Round 2 of 93 (Listening room). The owner liked three things in it: the
// raised buttons, Cues / Loop / FX / Stems as a segmented control, and the
// build in layers, where every pane reads as a layer in depth. They didn't
// like the glow. This keeps the idea (the site's record room: warmth and a
// sense of material) and carries it with surfaces, edges, depth, type and
// colour instead of light. No light washes, no bloom, no grain, no glows,
// no backdrop blur, and nothing moves at rest.
//
// Only one direction is on at a time (only-one.svelte.js turns every other
// flag in the Direction group off when this one goes on).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-room',
  n: 99,
  title: 'Direction: Listening room, done well',
  group: 'Direction',
  against: '"One solid primary control, Play" and the outlined-control depth step: Play is a raised key that latches down in its deck colour, and controls are raised keys rather than outlines. Also the Liquid Glass blur: panels are solid.',
  notes: 'Whole-app look in style.css (built from a source with a short prefix; every rule is under the doubled :root[data-flag-dir-room] attribute so the baseline flags\' choice rules can\'t out-rank it). Tokens first, then the room, decks, mixer, library, messages, dialogs, settings. No hooks in components. only-one.svelte.js keeps one Direction flag on at a time.',
};

/** Show me: both decks playing, flipping between today and this direction. */
export const show = {
  about: 'A warmer, more physical look without any glow. Each part of the window sits at its own depth: the waveform window is cut into the room, the decks and mixer are solid plates on top of it, the readouts are set into the plates, and every button is a key that stands up off its plate and stays down while it is on. Turn on one direction at a time.',
  before: 'Today: glass panels lit from nowhere, outlined buttons, a solid pale Play and green meters that pull the eye away from the time and tempo.',
  after: 'Listening room: solid warm plates in clear layers, keys you could press that stay down in their own colour while on, and the time and tempo as the brightest things on screen.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
