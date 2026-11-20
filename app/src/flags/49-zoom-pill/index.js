// #49: the waveform zoom stops covering the waveform (batch D14, audit C7
// for the 24px targets).
//
// The "− 12 s +" pill floated over the right end of the top lane, exactly
// where the next beats come in, with 20×20 buttons. With the flag the
// waveforms panel keeps a 44px gutter on its right, so the lanes end
// before it, and the pill stands upright in it, centred on the lane
// divider: opaque (--popover) with the glass edge (--glass-edge), buttons
// 24×24 (--h-sm) with a --t-md glyph. CSS only (App.svelte's .zoom).
export default {
  id: 'zoom-pill',
  n: 49,
  title: 'Waveform zoom moves off the waveform',
  group: 'Layout',
  notes: 'A 44px gutter at the right of the waveforms holds the zoom pill upright on the lane divider (opaque, 24px buttons); the lanes end before it.',
};

/** Show me: both decks loaded; flipping shows the pill over the incoming waveform (before) and in its own gutter (after). */
export const show = {
  about: 'The waveform zoom control sat on top of the right end of the upper waveform, right where the next beats come in. Now it has its own strip at the right edge, with bigger buttons.',
  before: 'The "− 12 s +" pill covers the start of what is coming up on deck A, the part of the waveform you look at to time your next move, and its buttons are tiny.',
  after: 'The waveforms stop short of a narrow strip at the right, where the zoom stands on its own, between the two lanes, with bigger buttons.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: "[data-region='waves'] .zoom",
  badge: (app) => {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    return w && new DOMRect(w.right - 260, w.top, 200, w.height);
  },
  aid(d, app, ctx) {
    const z = app.$("[data-region='waves'] .zoom")?.getBoundingClientRect();
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    if (!z || !w) return;
    const before = ctx.phase === 'before';
    d.text(z.right, w.bottom + 16, before ? 'covers the incoming waveform; 20px buttons' : 'its own gutter; 24px buttons', { anchor: 'end', tone: before ? 'bad' : 'ok' });
  },
};
