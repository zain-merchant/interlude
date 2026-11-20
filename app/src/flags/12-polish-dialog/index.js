// #12 (polish): dialogs open on a strong ease-out.
//
// The import and report dialogs rise in over 200 ms on the browser's
// built-in ease-out, which is soft at the start: the first frames, the
// ones you watch most closely, barely move, so the dialog feels late.
// With the flag on they use a strong ease-out (cubic-bezier(0.23, 1,
// 0.32, 1)), which covers most of the distance at once and settles, and
// start from scale 0.97 rather than 0.99 so the motion reads. CSS only.
export default {
  id: 'polish-dialog',
  n: 12,
  title: 'Dialogs open on a strong ease-out',
  group: 'Polish',
  notes: 'Import and Report dialogs: strong ease-out curve instead of the built-in one, from scale 0.97.',
  settings: {
    ms: { type: 'range', min: 120, max: 320, step: 20, default: 220, unit: 'ms', label: 'Duration' },
  },
};

/** Show me: the Report dialog opens again and again, slowed down, flag off then on; a chart of how far it has come. */
export const show = {
  about: 'Dialogs drifted in slowly at first, so they felt late. Now they arrive at once and settle gently.',
  before: 'The dialog creeps in: its first moments, the ones you notice, barely move, so it feels a beat late.',
  after: 'It covers most of the way straight away and then eases to a stop, so it feels quick without being abrupt.',
  motion: true,
  period: 2000,
  async setup(app) {
    await app.openReport();
  },
  // Each flip opens it again, so its entrance plays with the flag that way.
  async each(app) {
    await app.key('Escape', { target: app.$(".card[aria-labelledby='report-title']") ?? document.body });
    await app.wait(120);
    await app.openReport();
  },
  async replay(app) {
    await show.each(app);
  },
  target: ".card[aria-labelledby='report-title']",
  aid(d, app, ctx) {
    const card = app.$(".card[aria-labelledby='report-title']");
    if (!card) return;
    const r = card.getBoundingClientRect();
    const a = card.getAnimations().find((x) => x.effect?.getTiming?.().duration > 0);
    const t = a ? Number(a.currentTime ?? 0) / Number(a.effect.getComputedTiming().endTime || 1) : 1;
    d.motion(r, {
      title: 'How far in it is, over time',
      curves: { before: [0, 0, 0.58, 1], after: [0.23, 1, 0.32, 1] },
      phase: ctx.phase,
      now: a && a.playState === 'running' ? t : 1,
      legend: [
        { tone: 'bad', text: 'Before: slow start' },
        { tone: 'ok', text: 'After: most of the way at once' },
      ],
    });
  },
};
