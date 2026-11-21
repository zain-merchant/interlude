// #93 (UI audit flag; a visual direction): Listening room.
//
// One of three whole-app looks for the beauty pass (92 Quiet, 93 Listening
// room, 94 Graphic). Only one is on at a time. Each sits on top of the
// round-2 picks and restyles the whole app from its own tokens in style.css;
// with the flag off nothing changes.
//
// Listening room: the marketing site's record room brought into the app.
// A soft light in each deck's colour sits behind the glass and swells with
// that deck's level (light.svelte.js, the site's .glow); film grain over the
// page; a record's grooves in the overview; smoked glass with real top
// light; buttons you could press (raised at rest, sunk and lit when on);
// matte machined dials; the site's springs.
if (typeof window !== 'undefined') setTimeout(() => import('./light.svelte.js'), 0);

export default {
  id: 'dir-warm',
  n: 93,
  title: 'Direction B: Listening room',
  group: 'Direction',
  against: '"One solid primary control, Play", the five type sizes (titles at the site\'s 18px), and "Strong gradients, glows" (the deck light is the doc\'s own background pools, made visible and moving with the music).',
  notes: 'Whole-app look in style.css. light.svelte.js writes --dir-la / --dir-lb (eased deck levels) while the flag is on; off under reduced motion. Waveform bands set on :root.',
};

/** Show me: both decks playing, flipping between today and the Listening room. */
export const show = {
  about: 'A warmer, more physical look, taken from the website: a soft light in each deck\'s colour glows behind the panels and swells with the music, the background has a fine film grain, the track overview shows a record\'s grooves, and buttons look like things you press: raised at rest, pushed in and lit when on. Turn on one direction at a time.',
  before: 'Today: dark flat slabs lit from nowhere; the only lights are the Play buttons, the waveform cores and the green meters.',
  after: 'Listening room: the room is lit by the decks themselves, and every control has a body that sinks and lights when it\'s on.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
