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

/** Show me: the worst-case library analysing, with a loupe on the hairline under its count. */
export const show = {
  note: 'With 1,284 tracks analysing, the hairline under "analyzing, N to go" fills (loupe).',
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
    d.loupe('bar', { x: r.left - 6, y: r.top - 4 }, { zoom: 3, size: { w: Math.min(420, (r.width + 12) * 3), h: (r.height + 10) * 3 }, near: r, caption: done ? `${done} analysed, 3×` : '3×' });
  },
};
