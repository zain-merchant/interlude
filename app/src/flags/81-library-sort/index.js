// #81 (Li4; F1's heading radius): the column headings never showed a sort.
//
// The scan's order matched no column, so no heading had an arrow and nothing
// said how the list was ordered. Hovering a heading only stepped its colour
// from --fg-3 to --fg-2, and pressing looked like hovering. With the flag on,
// a library or folder view with no column picked sorts by Artist, then
// Title, and shows Artist's arrow (playlists and History keep their own
// order, so drag-to-reorder still works there). Every heading keeps a slot
// for its arrow: hovering shows a faint one, so you can see what a click
// will do, and nothing moves. Hover lifts the word to --fg, pressing fills
// the heading with --hover, and headings get a 6px radius (so the pressed
// fill and the focus ring are rounded). Hooks: Library.svelte (sortOn, the
// heading markup). Built here rather than in #14 (states), which owns the
// other hover and pressed rules; this beats #14's heading hover.
export default {
  id: 'library-sort',
  n: 81,
  title: 'Column headings show the sort',
  group: 'Controls',
  notes: 'Default sort Artist then Title with its arrow (not in playlists or History); ghost arrow on hover in a fixed slot; hover --fg; :active --hover fill; heading radius 6px.',
};

/** Show me: All tracks with no column picked; flipping shows no arrow (before) and Artist's arrow with the list in artist order (after). */
export const show = {
  about: 'The track list had an order, but no column heading said what it was, and pointing at a heading barely changed it. Now Artist shows its arrow, and a heading you point at lights up with a faint arrow.',
  before: "No heading has an arrow, so you can't tell how the list is ordered, or that clicking a heading sorts by it.",
  after: 'Artist shows its arrow and the list is in artist order, then title. Point at another heading and it brightens with a faint arrow: click to sort by it.',
  async setup(app, ctx) {
    await app.clearSearch();
    ctx.unforce = app.forceStates();
    const title = app.$$('section.library .head .sort').find((b) => b.textContent.trim() === 'Title');
    title?.setAttribute('data-show-hover', '');
    ctx.title = title;
    app.$("[data-region='tracks']").scrollTop = 0;
  },
  cleanup(app, ctx) {
    ctx.unforce?.();
  },
  target: 'section.library .head',
  badge: (app) => app.$('section.library .bar')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const heads = app.$$('section.library .head .sort');
    const artist = heads.find((b) => b.textContent.trim() === 'Artist')?.getBoundingClientRect();
    const title = ctx.title?.getBoundingClientRect();
    if (artist) d.text(artist.x + 6, artist.bottom + 44, before ? 'sorted by what?' : 'sorted by artist: the arrow says so', { tone: before ? 'bad' : 'ok' });
    if (title) d.text(title.x + 6, title.bottom + 44, before ? 'pointed at: barely changes' : 'pointed at: brighter, with a faint arrow', { tone: before ? 'bad' : 'ok' });
  },
};
