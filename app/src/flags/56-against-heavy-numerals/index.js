// #56 (against the design doc; addendum part 3): heavier time and BPM
// numerals.
//
// The doc: "Times and BPM are large and light" (weight 300). The panel
// dropped seven clusters (a-K86, b-K81, b-K85, a-K90, b-K86, e-K79, e-K80):
// judges found the light numerals thin at 24 and 32px, especially from a
// distance or on a dim screen. With this flag the deck's BPM and both times
// are 400 (Regular), or 500 (Medium) with the Weight setting.
export default {
  id: 'against-heavy-numerals',
  n: 56,
  title: 'Heavier times and BPM',
  group: 'Type and colour',
  against: '"Typography: Geist Variable with tabular numbers. Times and BPM are large and light."',
  notes: 'The deck BPM and both times at weight 400 (or 500) instead of 300.',
  settings: {
    weight: {
      type: 'choice',
      label: 'Weight',
      default: 'regular',
      options: [
        ['regular', 'Regular (400)', 'One step heavier than today: sturdier from a distance, still calm.'],
        ['medium', 'Medium (500)', 'Two steps heavier: the numbers become the boldest text on the deck.'],
      ],
    },
  },
};

/** Show me: deck A playing; flipping shows the light numerals (before) and heavier ones (after), magnified. */
export const show = {
  about: 'Against the design doc, which sets the times and BPM large and light. Judges found the thin strokes hard to read from a distance. Turn this on to judge a heavier weight.',
  before: 'The BPM and times are large and light (weight 300), as the design doc intends: elegant, but thin strokes on a dark screen.',
  after: 'The same numbers at a heavier weight read more solidly from across the booth. The cost: they compete more with the track title.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.play(0);
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm"), app.$("[data-region='deck0'] .hub")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const b = app.$("[data-region='deck0'] .bpm")?.getBoundingClientRect();
    if (!b) return;
    const z = 2;
    const l = d.loupe('bpm', { x: b.left - 8, y: b.top - 6 }, { zoom: z, size: { w: (b.width + 16) * z, h: (b.height + 12) * z }, near: b, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'the doc: large and light' : 'against the doc: heavier', { tone: before ? undefined : 'ok', fixed: true });
  },
};
