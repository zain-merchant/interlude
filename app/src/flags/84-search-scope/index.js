// #84 (Li8, C19): a failed search was a dead end.
//
// "Nothing matches “x”." didn't say where it had looked or how to get back,
// the clear button was a 6px cross in a 20px target, and the count beside
// the field dropped the total ("4 tracks"). With the flag on:
// - the empty list says "Nothing in All tracks matches “x”." (or the
//   folder or playlist you're in, in quotes since you named it: Nothing in
//   “Peak time” matches “x”) with a "Clear search  esc" button 8px under
//   it, the key hint styled like the toast's ⌘Z;
// - the clear button is 24×24 with an 8px cross drawn like the magnifier
//   (--fg-3, the same line);
// - the count reads "4 of 48 tracks" while a search is on;
// - the searched words are marked in titles and artists (--fg, weight 500).
// Hooks: Library.svelte (countText, viewName, marks(), the empty state).
export default {
  id: 'search-scope',
  n: 84,
  title: 'Searches say where they looked, and how to get back',
  group: 'Controls',
  notes: 'Empty search names the view (user-made names in quotes) and offers Clear search with an esc hint; clear button 24px with an 8px cross drawn like the magnifier; count "4 of 48 tracks"; matched words marked in Title and Artist.',
};

/** Show me: a search that finds nothing, flipping; then the answer on the count. */
export const show = {
  about: 'A search that found nothing just said "Nothing matches" and left you there, with a tiny × to get out. Now it says where it looked and gives you a Clear search button, and the count keeps the total.',
  before: '"Nothing matches" with no way back but a tiny × in the corner of the search field, and no hint whether you were searching everything or just one playlist.',
  after: 'It says where it looked ("Nothing in All tracks matches …") and offers Clear search right there. The × is bigger and drawn like the magnifier, and while you search the count reads "4 of 48 tracks".',
  async setup(app) {
    await app.search('zzqx');
    await app.until(() => app.$("[data-region='tracks'] .empty"), 2000, 'the empty search');
  },
  target: (app) => [app.$("[data-region='tracks'] .empty"), app.$('section.library .search .clear')],
  badge: (app) => {
    const e = app.$("[data-region='tracks'] .empty p") ?? app.$("[data-region='tracks'] .empty");
    const r = e && app.textRect(e);
    return r && new DOMRect(r.x - 10, r.y - 8, r.width, r.height);
  },
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const e = app.$("[data-region='tracks'] .empty");
    const r = e && app.textRect(e.querySelector('p') ?? e);
    if (r) d.text(r.x + r.width / 2, r.bottom + (before ? 24 : 56), before ? 'where did it look? how do I get back?' : 'says where it looked, and the way back', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
    const c = app.$('section.library .search .clear')?.getBoundingClientRect();
    if (c) d.text(c.left + c.width / 2, c.bottom + 20, before ? 'a 6px ×' : 'an 8px × in a 24px target', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
