// #81 (Li4; F1's heading radius): the column headings never showed a sort.
//
// The scan's order matched no column, so no heading had an arrow and nothing
// said how the list was ordered, and hovering a heading only stepped its
// colour. With the flag on, a library or folder view with no column picked
// sorts by Artist, then Title, and shows Artist's arrow (playlists and
// History keep their own order, so drag-to-reorder still works there).
// Headings have three steps: at rest --fg-3, hovered --fg-2, sorted --fg
// with the arrow. Only the sorted heading has an arrow (a faint one on
// hover read as a second sort key). Every heading keeps an invisible slot
// for its arrow, so sorting never moves a word. Pressing fills the heading
// with --hover, and headings get a 6px radius. Hooks: Library.svelte
// (sortOn, the heading markup).
export default {
  id: 'library-sort',
  n: 81,
  title: 'Column headings show the sort',
  group: 'Controls',
  notes: 'Default sort Artist then Title with its arrow (not in playlists or History); headings --fg-3 / hover --fg-2 / sorted --fg + arrow; a hidden arrow slot on every heading so nothing shifts; :active --hover fill; radius 6px.',
};

/** Show me: All tracks with no column picked; flipping shows no arrow (before) and Artist's arrow with the list in artist order (after). */
export const show = {
  about: 'The track list had an order, but no column heading said what it was, and pointing at a heading barely changed it. Now Artist shows its arrow, and a heading you point at brightens a step.',
  before: "No heading has an arrow, so you can't tell how the list is ordered, or that clicking a heading sorts by it.",
  after: 'Artist shows its arrow and the list is in artist order, then title. Point at another heading and it brightens a step, still dimmer than Artist: click to sort by it.',
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
    if (title) d.text(title.x + 6, title.bottom + 44, before ? 'pointed at: barely changes' : 'pointed at: a step brighter, still below Artist', { tone: before ? 'bad' : 'ok' });
  },
};
