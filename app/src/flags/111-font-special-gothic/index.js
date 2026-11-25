// #111 (UI audit flag; a typeface): Special Gothic.
//
// The app set in Special Gothic (Alistair McCready, SIL OFL 1.1, OFL.txt), a
// compact gothic with a punchy, narrow bold, instead of Geist. Song titles
// are 700, so more of a long title fits before the ellipsis. It works with
// any direction, or none.
//
// Its weaknesses, and what's done about each:
//   - its minus, plus, times and divide are small (a minus reads as a hyphen): those signs
//     and the plus-minus are left out of its range, so they come from Geist;
//   - its tabular figures sit very tight at 500 and up (0.014 to 0.036em of
//     ink between two digits, against Geist's 0.052 to 0.065): figures get a
//     little tracking, more as they get bolder;
//   - no weight under 400: light text is set at 400;
//   - capital I and small l look alike, and it has no alternates for them:
//     nothing to be done, noted.
// Geist is the fallback for every glyph it doesn't have.
export default {
  id: 'font-special-gothic',
  n: 111,
  title: 'Typeface: Special Gothic',
  group: 'The look',
  notes:
    'SpecialGothic.woff2 is the OFL variable TTF (wght 400 to 700, wdth 75 to 125) compressed, unchanged otherwise. --font and --font-sans are set on :root and html\'s font-family too, since Tailwind\'s @theme inline bakes Geist into it. Waveform.svelte passes labelFont so the bar number on the play head (drawn on a canvas, waveform-2d.js) follows; the overview\'s cue numbers read the canvas\'s own font family.',
};

/** Show me: both decks loaded, flipping between Geist and Special Gothic. */
export const show = {
  about: 'The whole app in Special Gothic, a compact gothic, with song titles in its bold.',
  before: 'Geist.',
  after: 'Special Gothic, song titles at 700. Minus and plus signs stay in Geist, where they are long enough to read.',
  period: 2200,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: '.app',
};
