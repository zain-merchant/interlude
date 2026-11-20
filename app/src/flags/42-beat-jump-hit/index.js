// #42: the beat-jump arrows answer across their whole third (batch D4,
// audit C1).
//
// The ‹ 4 › control looks like one 105px button, but .btn sets
// place-items: center (app.css), and neither .jumps (Deck.svelte) nor
// flag 05 reset justify-items, so each arrow shrank to its glyph: only a
// strip about 13px wide answered the pointer, and the hover fill and the
// focus ring were slivers. With the flag each arrow stretches to fill its
// third at the full 44px height, with --r corners.
export default {
  id: 'beat-jump-hit',
  n: 42,
  title: 'Beat-jump arrows work across their whole half',
  group: 'Controls',
  notes: 'The ‹ › arrows in the transport fill their third of the beat-jump control (justify-items: stretch), so the whole area clicks, hovers and takes the focus ring.',
};

/** Show me: outlines deck A's jump-back arrow; flipping shows the sliver it fills (before) and its whole third (after). */
export const show = {
  about: 'The beat-jump arrows only reacted on a thin strip around the ‹ › glyph, so clicks just beside them did nothing. Now each arrow fills its whole third of the control.',
  before: 'The ‹ 4 › control looks like one wide button, but only a thin strip around each arrow responds: the outline shows how little of it you can actually hit.',
  after: 'Each arrow now fills its whole third of the control, top to bottom, so a quick click anywhere on its side jumps.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: "[data-region='deck0'] .transport .jumps",
  badge: (app) => app.$("[data-region='deck0'] .transport .jumps")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const b = app.$("[data-region='deck0'] .transport .jumps button");
    const j = app.$("[data-region='deck0'] .transport .jumps");
    if (!b || !j) return;
    const r = b.getBoundingClientRect();
    const jr = j.getBoundingClientRect();
    d.box(r, { w: 1.5 });
    const before = ctx.phase === 'before';
    d.text(jr.left + jr.width / 2, jr.top - 14, before ? `jump back answers on ${Math.round(r.width)}px` : `jump back answers on its whole ${Math.round(r.width)}px`, { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
