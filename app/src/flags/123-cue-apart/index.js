// #123 (UI audit flag): hot cue colours that stay apart.
//
// Every slot keeps its hue within 10 degrees; lightness and strength move so
// that no two look alike in any of four ways of seeing: usual sight, no red,
// no green, no blue (Machado 2009, full strength; distance in OKLab). The
// least between any two is 0.075. It was 0.012 (3 and 7, without green).
// The number beside each ring and on each marker stays what tells them apart.
export default {
  id: 'cue-apart',
  n: 123,
  title: 'Hot cue colours anyone can tell apart',
  group: 'Type and colour',
  notes: 'style.css only. The waveforms read --hc-1 to --hc-8 as they are drawn.',
};

export const show = {
  about: 'Cues whose colours looked alike to a colour-blind person no longer do.',
  before: '3 and 7, 4 and 5, 2 and 4 could look the same.',
  after: 'Each has its own lightness as well as its own hue.',
  async setup(app) {
    await app.loadTrack(0, 1);
  },
  target: "[data-region='deck0'] .tc",
};
