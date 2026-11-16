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
  title: 'Track list clips at the card\'s edge',
  group: 'Layout',
  notes: 'Rows run to the library card\'s bottom edge and are cut there, by the card\'s own corner, instead of by a rounded box 8px inside it.',
};

/** Show me: selects a row that straddles the bottom edge, with the card's and the list's edges drawn. */
export const show = {
  note: "A selected row straddles the list's bottom. On, it's cut by the card's own edge and corner; off, by a rounded box 8px inside it (see the loupe).",
  async setup(app) {
    const list = app.$("[data-region='tracks']");
    // Select a row, then scroll so it straddles the list's bottom edge.
    const rows = app.rows();
    const row = rows[Math.min(rows.length - 1, 6)];
    await app.click(row);
    await app.wait(60);
    const lr = list.getBoundingClientRect();
    const rr = app.$("[data-region='tracks'] .row.sel").getBoundingClientRect();
    list.scrollTop += rr.top + rr.height / 2 - lr.bottom;
    await app.wait(60);
  },
  target: "[data-region='tracks'] .row.sel",
  aid(d, app) {
    const card = app.$('section.library')?.getBoundingClientRect();
    const list = app.$("[data-region='tracks']")?.getBoundingClientRect();
    if (card) d.box(card, { c: d.C.aid, w: 1, label: 'library card', below: false });
    if (list) d.box(list, { c: d.C.ghost, dash: '3 3' });
    if (list) d.text(list.right - 4, list.bottom - 10, 'list clips here', { c: d.C.ghost, anchor: 'end' });
    const sel = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    if (card && sel) d.loupe('foot', { x: card.right - 70, y: card.bottom - 40 }, { zoom: 4, size: { w: 280, h: 180 }, at: { x: 16, y: 14 }, caption: 'bottom right corner, 4×' });
  },
};
