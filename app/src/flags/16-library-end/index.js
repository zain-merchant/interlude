// #16: the selected last row of the library was cut off at the list's foot.
//
// The track list was exactly as tall as its rows, so the last row sat flush
// against the list's rounded bottom edge, which clipped its corners and its
// selection hairline; selecting it with the keyboard scrolled it to exactly
// that edge. This leaves room under the last row, and scrolls a row clear
// of the edge by the same amount (Library.svelte, select()).
export default {
  id: 'library-end',
  n: 16,
  title: 'Room under the last library row',
  group: 'Layout',
  notes: 'The last row no longer touches the list\'s rounded foot; keyboard selection scrolls it clear by the same gap.',
  settings: {
    gap: { type: 'range', min: 0, max: 16, step: 1, default: 6, unit: 'px', label: 'Gap' },
  },
};

/** Show me: the last library row selected, a loupe on the list's foot, flipping. */
export const show = {
  about: 'Selecting the last track in the library pushed it flush against the rounded bottom edge, clipping its corners. Now there is a little room under it.',
  before: 'Go to the last track (End key): its highlight is jammed against the bottom of the list and the rounded edge cuts its corners off.',
  after: 'A small gap under the last row keeps the whole highlight in view, so the end of the list looks like an end, not a cut.',
  async setup(app, ctx) {
    await show.each(app);
  },
  // Each flip selects the last row again, so the list scrolls the way it would.
  async each(app) {
    await app.selectRow('last');
    await app.wait(80);
  },
  target: "[data-region='tracks'] .row.sel",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const row = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    const list = app.$("[data-region='tracks']")?.getBoundingClientRect();
    if (!row || !list) return;
    const zoom = 4;
    const size = { w: 400, h: 200 };
    const src = { x: list.left - 6, y: list.bottom - size.h / zoom + 8 };
    const l = d.loupe('foot', src, { zoom, size, at: { x: list.left + 380, y: list.bottom - size.h - 70 }, caption: '' });
    ctx.at = l.rect;
    const gap = list.bottom - row.bottom;
    d.text(l.rect.x + 10, l.rect.y + 16, 'the last row and the bottom of the list, 4× bigger', { fixed: true });
    d.text(l.rect.x + 10, l.rect.bottom + 16, gap > 0.5 ? `${Math.round(gap)}px of room under the last row` : 'the last row touches the bottom: its corners are cut', { tone: gap > 0.5 ? 'ok' : 'bad', fixed: true });
    void before;
  },
};
