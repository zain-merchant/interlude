// #82 (Li5): the "loaded on a deck" marker was a 3×14px sliver.
//
// The only sign that a library row is on a deck was a small bar in the
// marker column, quieter than the selected row's fill, telling the left
// deck from the right one by tint alone. With the flag on, the bar runs the
// row's height (inset 3px so it sits inside the row's rounded corners), it
// sits on the side of its deck (left edge for the left deck, right edge for
// the right deck), and the title is drawn in the deck's colour (ice or
// cream, both over 12:1). No letters (the design doc rules them out).
// CSS only (:has on the row's .ld bars).
export default {
  id: 'loaded-rows',
  n: 82,
  title: 'Loaded tracks stand out in the list',
  group: 'Polish',
  notes: 'The loaded marker is a full-height bar on its deck\'s side of the row (left edge or right edge), and the title takes the deck colour. Positioned absolutely, so the column grid is unchanged.',
};

/** Show me: a track on each deck; flipping shows the slivers (before) and the full bars and tinted titles (after). */
export const show = {
  about: 'The only sign a track was on a deck was a tiny bar beside it, fainter than the highlight, and the two decks differed only by a hint of colour. Now the bar runs the full row on that deck\'s side, and the title takes the deck\'s colour.',
  before: 'Which rows are on a deck? A thin sliver at the left, easy to miss, and the left and right decks look almost the same.',
  after: 'A full-height bar on the left edge for the left deck, on the right edge for the right deck, and the title in that deck\'s colour: you can find both at a glance.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.clearSearch();
    app.$("[data-region='tracks']").scrollTop = 0;
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    await app.wait(100);
  },
  target: (app) => app.rows().filter((r) => r.querySelector('.ld b')),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const rows = app.rows().filter((r) => r.querySelector('.ld b'));
    for (const r of rows) {
      const b = r.querySelector('.ld b');
      const rr = r.getBoundingClientRect();
      const left = !b.classList.contains('b');
      const where = left ? 'left deck' : 'right deck';
      const x = left ? rr.left + 300 : rr.right - 300;
      d.text(x, rr.top + rr.height / 2, before ? `on the ${where}? hard to tell` : `on the ${where}`, { tone: before ? 'bad' : 'ok', anchor: left ? 'start' : 'end' });
    }
  },
};
