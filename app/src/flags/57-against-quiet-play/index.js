// #57 (against the design doc; addendum part 4): a paused Play that isn't
// the brightest thing on screen.
//
// The doc's depth order ends in "One solid primary control, Play." The
// panel dropped a-K85 and d-K75: on a paused deck the solid near-white
// 104×44 block is the brightest, largest surface in the window, so the eye
// lands on the deck that isn't doing anything. The real fix is the
// polarity (flag 06's "Lit while playing", the build list's D2); this flag
// is the plain version for comparison: a paused, ready Play is a quiet
// tonal button with a hairline and a white glyph, whatever look playing
// has. Disabled (no track) and cueing are unchanged.
export default {
  id: 'against-quiet-play',
  n: 57,
  title: 'A paused Play that steps back',
  group: 'Controls',
  against: '"Depth, from back to front: ... 5. One solid primary control, Play."',
  notes: 'A paused, loaded Play becomes the tonal fill with a hairline and a white glyph, instead of the solid white block. Compare with flag 06 "Lit while playing".',
};

/** Show me: deck A playing, deck B paused; flipping shows the paused solid block (before) and a quiet paused button (after). */
export const show = {
  about: 'Against the design doc, which keeps Play solid white. Judges found a paused deck\'s solid Play the brightest thing on screen, drawing the eye to the deck that isn\'t running. Turn this on to judge a quieter paused Play (flag 06\'s "Lit while playing" is the fuller fix).',
  before: 'Deck B is paused and its Play is the solid white block, the brightest surface in the window, as the design doc intends.',
  after: 'Deck B\'s paused Play is a quiet button with a white triangle, so the bright surfaces on screen belong to what\'s playing. The cost: Play no longer stands out as the one solid control.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
  },
  target: (app) => [app.playButton(1)],
  badge: (app) => app.playButton(1)?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const r = app.playButton(1)?.getBoundingClientRect();
    if (!r) return;
    const before = ctx.phase === 'before';
    d.text(r.x + r.width / 2, r.bottom + 16, before ? 'the doc: paused Play is the solid block' : 'against the doc: paused Play steps back', { anchor: 'middle', tone: before ? undefined : 'ok' });
  },
};
