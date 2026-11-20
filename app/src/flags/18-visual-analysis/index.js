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
  title: 'A progress line while the library is analysed',
  group: 'Polish',
  notes: 'A hairline under "analyzing, N to go" fills as the library is analysed.',
};

/** Show me: the big test library being analysed; flipping shows the count alone (before) and with its progress line (after), magnified. */
export const show = {
  about: 'While the library was being analysed it only said "analyzing, 36 to go", with no sense of how far along it was. Now a thin line under it fills up as it goes.',
  before: 'The note under the search counts tracks down ("analyzing, 1,250 to go") but gives no feel for whether it\'s nearly done or barely started.',
  after: 'A thin line under the note fills from left to right as tracks are analysed, so you can see at a glance how far along it is.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app) {
    await app.until(() => app.$('section.library .bar .count .pending'), 4000, 'the analysis note');
  },
  target: 'section.library .bar .count .pending',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const p = app.$('section.library .bar .count .pending');
    if (!p) return;
    const r = p.getBoundingClientRect();
    const z = 3;
    const l = d.loupe('bar', { x: r.left - 8, y: r.top - 6 }, { zoom: z, size: { w: Math.min(520, (r.width + 16) * z), h: (r.height + 16) * z }, near: r, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    const done = getComputedStyle(p).getPropertyValue('--flag-visual-analysis-done').trim();
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'just a number counting down: how far along is it?' : `the line fills as it goes${done ? `: ${done.replace(/\.\d+/, '')} done` : ''}`, { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
