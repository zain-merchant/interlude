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

/** Show me: selects the last row and measures the room under it, with a loupe on the list's foot. */
export const show = {
  note: 'The last row is selected: the room under it is measured, and the loupe shows it clear of the rounded foot.',
  async setup(app) {
    await app.selectRow('last');
  },
  target: "[data-region='tracks'] .row.sel",
  aid(d, app) {
    const row = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    const list = app.$("[data-region='tracks']")?.getBoundingClientRect();
    if (!row || !list) return;
    const gap = list.bottom - row.bottom;
    const x = row.left + 40;
    if (gap > 0.5) d.measure(x, row.bottom, x, list.bottom, { label: `${Math.round(gap * 10) / 10}`, side: 'right', tone: 'ok' });
    else d.text(x, list.bottom - 9, 'touches the foot', { tone: 'bad' });
    d.loupe('foot', { x: list.left - 4, y: list.bottom - 30 }, { zoom: 4, size: { w: 240, h: 136 }, near: new DOMRect(list.left, list.bottom - 30, 60, 34), caption: 'list foot, 4×' });
  },
};
