// #98 (UI audit flag; a visual direction): Sleeve.
//
// Round 2's bigger swing. The website's warmest things are paper: the record
// sleeve, the letter, the Download button. Sleeve makes the app out of that
// paper. Deck A sits on a cool sheet and deck B on a warm one (the two deck
// whites, used as surfaces). Everything that shows sound (the waveforms, the
// overviews, the meters) stays on black screens set into the paper, with
// today's waveforms unchanged. Controls are raised paper keys in ink.
// Only one direction is on at a time (97's only-one.svelte.js).
export default {
  id: 'dir-sleeve',
  n: 98,
  title: 'Direction: Sleeve',
  group: 'Direction',
  against:
    '"The app is dark only" and the Liquid Glass material: panels are solid paper, light, with ink type. The case for it: the site\'s own paper, the two deck whites finally used at full size, and raised keys, a segmented switch and layered panes all read most clearly on a light ground.',
  notes:
    "Whole-app look in style.css. The light tokens are set on #app, not :root, so the waveform canvases (which read their colours from body) keep today's dark-screen colours. Deck.svelte puts the tempo's decimals in a span.frac while this flag (or 97) is on; ship that span with it.",
};

/** Show me: both decks playing, flipping between today and Sleeve. */
export const show = {
  about:
    "A light look made from the website's paper: the decks sit on a cool and a warm sheet, buttons are raised paper keys, and everything that shows sound (waveforms, meters) stays on black screens set into the paper. Turn on one direction at a time.",
  before: 'Today: a dark app, like every other DJ app.',
  after: 'Sleeve: paper and ink. You touch the paper and you watch the black screens.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
