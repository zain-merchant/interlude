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

/** Show me: searches for something with exactly one result and points at the count. */
export const show = {
  note: "Searched down to one track: read the count beside the search. Off, \"1 tracks\"; on, \"1 track\".",
  async setup(app, ctx) {
    const count = () => app.$('section.library .bar .count')?.textContent ?? '';
    // Find a search with exactly one result among the tracks' own titles.
    const titles = app.rows().map((r) => r.querySelector('.t')?.textContent.trim()).filter(Boolean);
    const tries = [...new Set(titles.map((t) => t + ' Extended'))].concat(titles);
    for (const q of tries) {
      await app.search(q);
      if (/^\s*1\s+track/.test(count())) return;
    }
    throw new Error('No search with exactly one result');
  },
  target: 'section.library .bar .count',
  aid(d, app) {
    const r = app.$('section.library .bar .count')?.getBoundingClientRect();
    if (r) d.text(r.x, r.bottom + 10, 'the count');
  },
};
