// #18 (visual): analysis progress.
//
// While the library is being analysed the bar says "analyzing, 36 to go",
// a number that only counts down: there's no sense of how far along it
// is. With the flag on, a small meter after the note (a fixed 64×2px
// track, 8px after the text, centred on its x-height) fills with --fg-2 as
// tracks are analysed, and the note goes when it's done, as before. It sits
// beside the text, not under it: a line under the note read as underlined
// text or a selected tab, and shrank as the digits dropped.
// Hook: Library.svelte (a CSS variable on the note).
export default {
  id: 'visual-analysis',
  n: 18,
  title: 'A progress meter while the library is analysed',
  group: 'Polish',
  notes: 'A fixed 64×2px meter 8px after "analyzing, N to go" (track --line-2, fill --fg-2) fills as the library is analysed.',
};

/** Show me: the big test library being analysed; flipping shows the count alone (before) and with its meter (after), magnified. */
export const show = {
  about: 'While the library was being analysed it only said "analyzing, 36 to go", with no sense of how far along it was. Now a small meter beside it fills up as it goes.',
  before: 'The note under the search counts tracks down ("analyzing, 1,250 to go") but gives no feel for whether it\'s nearly done or barely started.',
  after: 'A small meter after the note fills from left to right as tracks are analysed, so you can see at a glance how far along it is.',
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
    const l = d.loupe('bar', { x: r.left - 8, y: r.top - 6 }, { zoom: z, size: { w: Math.min(620, (r.width + 88) * z), h: (r.height + 16) * z }, near: r, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    const done = getComputedStyle(p).getPropertyValue('--flag-visual-analysis-done').trim();
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'just a number counting down: how far along is it?' : `the meter fills as it goes${done ? `: ${done.replace(/\.\d+/, '')} done` : ''}`, { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
