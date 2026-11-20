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

/** Show me: a selected row straddles the list's bottom; a loupe on the corner, with the old clip dashed. */
export const show = {
  note: "A selected row straddles the list's bottom: it's cut by the card's own edge and corner; dashed is the old clip, 8px inside.",
  async setup(app, ctx) {
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
    // The list's own clip with the flag off: its box and corner.
    ctx.off = app.without('library-clip', () => ({ r: DOMRect.fromRect(list.getBoundingClientRect()), rad: parseFloat(getComputedStyle(list).borderBottomRightRadius) || 0 }));
  },
  target: "[data-region='tracks'] .row.sel",
  aid(d, app, ctx) {
    const card = app.$('section.library')?.getBoundingClientRect();
    if (!card) return;
    const l = d.loupe('foot', { x: card.right - 66, y: card.bottom - 44 }, { zoom: 4, size: { w: 280, h: 200 }, near: new DOMRect(card.right - 66, card.bottom - 44, 70, 50), caption: 'bottom right, 4×' });
    const off = ctx.off;
    if (off && app.isOn('library-clip')) {
      const a = l.map(off.r.right, off.r.bottom);
      const rad = off.rad * l.zoom;
      d.clip(l.rect, () => d.path(`M${a.x} ${l.rect.y}V${a.y - rad}A${rad} ${rad} 0 0 1 ${a.x - rad} ${a.y}H${l.rect.x}`, { c: d.C.ghost, dash: '5 4', w: 1.5 }));
    }
  },
};
