// #20: the track list clipped its rows at an inner rounded box.
//
// The library card pads its track column by 8px all round, and the list
// (.scroll) scrolls inside that with its own 8px rounded corners. So rows
// scrolling past the bottom were cut off by a curved edge 8px above the
// card's own bottom edge, with a radius that isn't the card's: a selected
// row's fill and hairline were cut by a corner in the middle of nowhere.
// The same on main. With the flag on, the list runs to the card's bottom
// edge and clips there: square at the header and at the bottom left (both
// mid-card), and concentric with the card's corner at the bottom right.
//
// With #16 (library-end) on, the room under the last row now sits against
// the card's edge: scrolled to the end, the last row still stops above the
// corner. With #2 (concentric), this rule replaces its radius on the list.
export default {
  id: 'library-clip',
  n: 20,
  title: 'Track list runs to the library\'s edge',
  group: 'Layout',
  notes: 'Rows run to the library card\'s bottom edge and are cut there, by the card\'s own corner, instead of by a rounded box 8px inside it.',
};

/** Show me: a selected row straddling the bottom of the track list, a loupe on the library's bottom-right corner, flipping. */
export const show = {
  about: 'Tracks scrolling off the bottom of the list were cut by a rounded edge floating 8px above the bottom of the library. Now they run to the library\'s own edge and corner.',
  before: "Scroll the track list: rows disappear behind a curved edge that sits a little above the library's real bottom, so a highlighted row gets cut by a corner in mid-air.",
  after: "Rows run all the way to the library's bottom edge and tuck under its own rounded corner, so the list looks like it continues below rather than being chopped off.",
  async setup(app, ctx) {
    const list = app.$("[data-region='tracks']");
    // Scroll down a little, select the last row wholly in view, then scroll
    // back until its middle is on the list's bottom edge.
    list.scrollTop = 300;
    await app.wait(80);
    const lr = list.getBoundingClientRect();
    const row = app.rows().filter((r) => r.getBoundingClientRect().bottom < lr.bottom - 2).pop();
    await app.click(row);
    await app.wait(60);
    ctx.row = app.$("[data-region='tracks'] .row.sel");
    await show.each(app, ctx);
  },
  // Each flip puts the selected row back across the list's bottom edge.
  async each(app, ctx) {
    const list = app.$("[data-region='tracks']");
    const row = ctx.row?.isConnected ? ctx.row : app.$("[data-region='tracks'] .row.sel");
    if (!list || !row) return;
    const lr = list.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    list.scrollTop -= lr.bottom - (rr.top + rr.height / 2);
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    await app.wait(60);
  },
  target: "[data-region='tracks'] .row.sel",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const card = app.$('section.library')?.getBoundingClientRect();
    if (!card) return;
    const zoom = 4;
    const size = { w: 360, h: 220 };
    const src = { x: card.right - size.w / zoom + 6, y: card.bottom - size.h / zoom + 6 };
    const l = d.loupe('foot', src, { zoom, size, at: { x: card.right - size.w - 120, y: card.bottom - size.h - 110 }, caption: '' });
    ctx.at = l.rect;
    const on = ctx.phase !== 'before';
    // Before: where the list cuts its rows, a box a little inside the card.
    const list = app.$("[data-region='tracks']");
    if (!on && list) {
      const lr = list.getBoundingClientRect();
      const rad = Math.min(parseFloat(getComputedStyle(list).borderBottomRightRadius) || 0, 20);
      const a = l.map(lr.right, lr.bottom);
      const R = rad * zoom;
      if (a.x < l.rect.right && a.y < l.rect.bottom) {
        d.path(`M${l.rect.x} ${a.y}H${a.x - R}A${R} ${R} 0 0 0 ${a.x} ${a.y - R}V${l.rect.y + 30}`, { c: d.C.bad, dash: '5 4', w: 1.5 });
        d.text(a.x - R - 8, a.y + 14, 'rows are cut here', { anchor: 'end', tone: 'bad', fixed: true });
      }
    }
    d.text(l.rect.x + 10, l.rect.y + 16, "the library's bottom-right corner, 4×", { fixed: true });
    d.text(l.rect.x, l.rect.bottom + 16, on ? "rows run to the library's own edge and corner" : 'rows are cut by a curve above the real edge', { tone: on ? 'ok' : 'bad', fixed: true });
  },
};
