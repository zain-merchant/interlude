// #95 (UI audit flag; a visual direction): Layered.
//
// Round 2 of the whole-app looks. Today's app, kept as it is in voice
// (graphite, glass, the two deck whites, today's waveforms), made tactile:
// every surface sits at a readable depth under one light from above (page,
// panel, wells cut into it, keys raised off it, floating messages, dialog
// sheets), every control is a key that sinks when pressed and stays down
// when on, and the deck tabs are a segmented control. No glow, no grain, no
// ambient light. Only one direction is on at a time (only-one.svelte.js).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-layered',
  n: 95,
  title: 'Direction D: Layered',
  group: 'Direction',
  against: '"One solid primary control, Play": Play is a raised key that latches down and takes its deck\'s white while playing, so the brightest things on screen are the time left and the tempo, not two pale slabs.',
  notes: 'Whole-app look in style.css, built on a depth ladder of tokens (--ly-*): panel, well, raised key, sunk, float, sheet. The baseline\'s button tokens (flag 09) map onto the raised key. Dial faces are drawn on .dial::after turned back by -var(--rot), so the light stays on top while the index turns. One direction at a time: only-one.svelte.js (reads the Direction group from the registry).',
};

/** Show me: both decks playing, flipping between today and the Layered look. */
export const show = {
  about: 'Today\'s app, made tactile. Each panel reads as a layer at its own depth, buttons stand up off the panel and sink when you press them (and stay down while they\'re on), and Cues, Loop, FX and Stems become one segmented switch. No glows. Turn on one direction at a time.',
  before: 'Today: flat buttons, underline tabs, two pale Play slabs and green meters that outshine the time and tempo.',
  after: 'Layered: keys you could press, a segmented switch for the deck\'s modes, and one way of being on (a key that stays down, in its own colour). The time left and the tempo are the brightest things on screen.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
