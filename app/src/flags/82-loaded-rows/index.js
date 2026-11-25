// #82 (Li5): the "loaded on a deck" marker was a 3×14px sliver.
//
// The only sign that a library row is on a deck was a small bar in the
// marker column, quieter than the selected row's fill, telling the left
// deck from the right one by tint alone. With the flag on, the bar is a
// firm 2×20px mark 6px in from the row's left end (inside the selection
// pill's rounded end), in the deck's colour, with two bars 2px apart (ice
// first) for a track on both decks; and the title is drawn in the deck's
// colour (ice or cream, both over 12:1). No letters (the design doc rules
// them out). Both bars stay at the left: one at the row's far right, past
// Folder, read as a scroll marker. CSS only (:has on the row's .ld bars).
export default {
  id: 'loaded-rows',
  n: 82,
  title: 'Loaded tracks stand out in the list',
  group: 'Polish',
  notes: 'The loaded marker is a 2×20px bar 6px in from the row\'s left end (two, 2px apart, for both decks), and the title takes the deck colour. Positioned absolutely, so the column grid is unchanged.',
};

/** Show me: a track on each deck; flipping shows the slivers (before) and the firm bars and tinted titles (after). */
export const show = {
  about: 'The only sign a track was on a deck was a tiny bar beside it, fainter than the highlight, and the two decks differed only by a hint of colour. Now a firmer bar marks it, and the title takes the deck\'s colour.',
  before: 'Which rows are on a deck? A thin sliver at the left, easy to miss, and the left and right decks look almost the same.',
  after: 'A firm bar at the start of the row and the title in the deck\'s colour, ice for the left deck and cream for the right: you can find both at a glance.',
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
    for (const r of app.rows().filter((x) => x.querySelector('.ld b'))) {
      const rr = r.getBoundingClientRect();
      const where = r.querySelector('.ld b.b') ? 'right deck' : 'left deck';
      d.text(rr.left + 300, rr.top + rr.height / 2, before ? `on the ${where}? hard to tell` : `on the ${where}`, { tone: before ? 'bad' : 'ok' });
    }
  },
};
