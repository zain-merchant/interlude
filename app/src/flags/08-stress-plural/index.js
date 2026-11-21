// #8: "1 tracks".
//
// The library's count always said "tracks", so a playlist or search with
// one result read "1 tracks" (found with the stress-data "One" set). It now
// says "1 track" (Library.svelte). The deck's beat counts, FX lengths and
// toasts already handle one.
export default {
  id: 'stress-plural',
  n: 8,
  title: '"1 track", not "1 tracks"',
  group: 'Stability',
  notes: 'The library count reads "1 track" for a single result.',
};

/** Show me: searched down to one track; the count flips between "1 tracks" and "1 track". */
export const show = {
  about: 'A search with one result said "1 tracks". Now it says "1 track".',
  before: 'Search down to a single result and the count beside the search reads "1 tracks".',
  after: 'It reads "1 track", as you would write it.',
  async setup(app, ctx) {
    // #84 (search-scope) counts a search against the total ("1 of 48 tracks"), where this
    // flag's word doesn't show: off for the show, back after.
    ctx.scope = app.isOn('search-scope');
    if (ctx.scope) app.setFlag('search-scope', false);
    const count = () => app.$('section.library .bar .count');
    // Find a search with exactly one result among the tracks' own titles.
    const titles = app.rows().map((r) => r.querySelector('.t')?.textContent.trim()).filter(Boolean);
    const tries = [...new Set(titles.map((t) => t + ' Extended'))].concat(titles);
    for (const q of tries) {
      await app.search(q);
      if (/^\s*1\s+track/.test(count()?.textContent ?? '')) break;
    }
    if (!/^\s*1\s+track/.test(count()?.textContent ?? '')) throw new Error('No search with exactly one result');
    // The count's own words (not the analysis note after them), on and off.
    const words = () => (count()?.firstChild?.textContent ?? '').trim();
    ctx.text = { on: words(), off: app.without('stress-plural', words) };
  },
  cleanup(app, ctx) {
    if (ctx.scope) app.setFlag('search-scope', true);
  },
  target: 'section.library .bar .count',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const r = app.textRect(app.$('section.library .bar .count'));
    if (!r) return;
    const before = ctx.phase === 'before';
    d.box(new DOMRect(r.x - 4, r.y - 3, r.width + 8, r.height + 6), { c: before ? d.C.bad : d.C.ok, w: 1.5, rx: 4 });
    // The change is one letter: magnified, it reads from across the room.
    const z = 4;
    const w = 90;
    const h = r.height + 12;
    const l = d.loupe('count', { x: r.x - 6, y: r.y - 6 }, { zoom: z, size: { w: w * z, h: h * z }, at: { x: r.x - 6, y: r.bottom + 44 }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x, l.rect.bottom + 16, before ? 'says "tracks" for one' : 'one track, one "track"', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
