// #18 (visual): analysis progress.
//
// While the library is being analysed the bar says "analyzing, 36 to go",
// a number that only counts down: there's no sense of how far along it
// is. With the flag on, a hairline under the note fills from left to right
// as tracks are analysed, and the note goes when it's done, as before.
// Hook: Library.svelte (a CSS variable on the note).
export default {
  id: 'visual-analysis',
  n: 18,
  title: 'Analysis progress under the library count',
  group: 'Polish',
  notes: 'A hairline under "analyzing, N to go" fills as the library is analysed.',
};

/** Show me: the worst-case library, still analysing, with the progress hairline under its note. */
export const show = {
  note: 'Turned on Worst-case data (the page reloaded for it): 1,284 tracks are being analysed. Under "analyzing, N to go" beside the track count, a hairline fills left to right as they finish (it takes about a minute and a half). Off, there is only the number counting down.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app) {
    await app.until(() => app.$('section.library .bar .count .pending'), 4000, 'the analysis note');
  },
  target: 'section.library .bar .count .pending',
  aid(d, app) {
    const p = app.$('section.library .bar .count .pending');
    if (!p) return;
    const r = p.getBoundingClientRect();
    const done = getComputedStyle(p).getPropertyValue('--flag-visual-analysis-done').trim();
    d.text(r.x, r.bottom + 12, `progress ${done || '—'}`);
    d.box(new DOMRect(r.x, r.bottom - 3, r.width, 5), { c: d.C.aid, dash: '2 2' });
  },
};
