// #57 (against the design doc; addendum part 4): the deck's overview well
// gets an edge.
//
// The doc's depth layer 3: "Recessed wells: darker, with an inner shadow.
// Used for waveforms and search." The panel dropped a-K93 (and, for the
// mixer, b-K83 and b-K84): fills one step from the panel with no visible
// border read as not quite there. With this flag the deck's overview well
// adds a 1px --line-2 edge to its inner shadow. (The mixer builder's
// mixer-against-doc flag does the sampler wells and fader slots.)
export default {
  id: 'against-deck-wells',
  n: 57,
  title: 'An edge on the deck overview well',
  group: 'Shape',
  against: '"Depth, from back to front: ... 3. Recessed wells: darker, with an inner shadow."',
  notes: 'The deck overview\'s recessed well gets a 1px --line-2 edge on top of its inner shadow.',
};

/** Show me: deck A loaded; flipping shows the overview's well without (before) and with an edge (after), magnified. */
export const show = {
  about: 'Against the design doc, which draws recessed wells with only an inner shadow. Judges found the overview\'s well hard to see as a shape. Turn this on to judge a thin edge around it.',
  before: 'The overview sits in a darker well with an inner shadow and no edge, as the design doc intends.',
  after: 'A thin edge outlines the well, so the overview reads as a distinct box. The cost: one more line on a deck the doc keeps calm.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: "[data-region='deck0'] .overview",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const o = app.$("[data-region='deck0'] .overview")?.getBoundingClientRect();
    if (!o) return;
    const z = 3;
    const l = d.loupe('well', { x: o.left - 8, y: o.top - 8 }, { zoom: z, size: { w: 140 * z, h: (o.height + 16) * z }, near: o, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'the doc: shadow only' : 'against the doc: an edge', { tone: before ? undefined : 'ok', fixed: true });
  },
};
