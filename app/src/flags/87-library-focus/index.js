// #87 (Li12; E11's sidebar count): you couldn't tell which pane had the
// arrow keys.
//
// The sidebar's current list ("All tracks") and the track list's selected
// row were drawn with the same lit pill, so the library showed two equal
// selections and nothing said which one the arrow keys, the browse knob
// and Enter would move. With the flag on, the track list keeps the full
// selection (it's what those keys act on, from anywhere) and the sidebar's
// current list steps down to the plain selected fill (--sel, above hover's
// 5%) with no edge. While keyboard
// focus is in the sidebar the two swap. The count in the sidebar's current
// pill goes from --fg-3 to --fg-2, since --fg-3 on that fill dropped under
// 4.5:1 (E11). CSS only. Built here rather than in #4 (borders) and #11
// (colour scale), and written to beat #4's selected looks.
export default {
  id: 'library-focus',
  n: 87,
  title: 'Only the list the keys move looks selected',
  group: 'Polish',
  notes: 'Sidebar current item: --sel fill (above hover), no edge, --fg text, unless the sidebar has focus (then the track list\'s selection steps down instead). Selected sidebar count --fg-2. Beats #4.',
};

/** Show me: All tracks current and a row selected; flipping shows two equal pills (before) and one (after). */
export const show = {
  about: 'The sidebar\'s current list and the selected track were lit the same way, so you couldn\'t tell which one the arrow keys would move. Now only the track list is lit; the sidebar\'s current list is a quieter shade.',
  before: '"All tracks" and the selected track look exactly alike: two selections, and no sign which one the arrow keys, the browse knob and Enter act on.',
  after: 'The selected track is the one lit pill, because that\'s what the keys move. "All tracks" is marked more quietly, as where you are rather than what you\'re on.',
  async setup(app) {
    await app.clearSearch();
    await app.selectRow(2);
  },
  target: (app) => [app.$("[data-region='sidebar'] .item.on"), app.$("[data-region='tracks'] .row.sel")],
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const side = app.$("[data-region='sidebar'] .item.on")?.getBoundingClientRect();
    const row = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    if (row) d.text(row.left + 420, row.top + row.height / 2, before ? 'lit like "All tracks"' : 'the one lit pill: the keys move this', { tone: before ? 'bad' : 'ok' });
    if (side) d.text(side.left + 8, side.bottom + 14, before ? 'lit like the row' : 'quieter: where you are', { tone: before ? 'bad' : 'ok' });
  },
};
