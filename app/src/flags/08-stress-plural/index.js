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

/** Show me: searches for something with exactly one result, with the count as it reads off. */
export const show = {
  note: 'Searched down to one track: the count beside the search reads "1 track".',
  async setup(app, ctx) {
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
  target: 'section.library .bar .count',
  aid(d, app, ctx) {
    const r = app.textRect(app.$('section.library .bar .count'));
    if (r) d.text(r.x, r.bottom + 14, app.isOn('stress-plural') ? `off: ${ctx.text.off}` : `on: ${ctx.text.on}`);
  },
};
