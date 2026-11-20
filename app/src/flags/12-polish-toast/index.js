// #12 (polish): the toast arrives instead of appearing.
//
// "Loaded Night Shift on deck A · Undo" blinked into place at the bottom of
// the window. Toasts are occasional, so a short entrance helps the eye find
// it without slowing anything down: it rises 8px and fades in over a
// strong ease-out. Leaving stays instant (that would need a hook). CSS only.
export default {
  id: 'polish-toast',
  n: 12,
  title: 'The "Loaded" message slides in',
  group: 'Polish',
  notes: 'The undo toast rises 8px and fades in with a strong ease-out instead of blinking on.',
  settings: {
    ms: { type: 'range', min: 100, max: 400, step: 20, default: 220, unit: 'ms', label: 'Entrance' },
  },
};

/** Show me: a track load brings the toast up again and again, slowed down, flag off then on. */
export const show = {
  about: 'The "Loaded … on deck A" message blinked on out of nowhere. Now it slides up and fades in, so your eye catches where it came from.',
  before: 'The message at the bottom blinks into place in a single frame: easy to miss, or to be startled by.',
  after: 'It rises a little and fades in over a fifth of a second, which draws the eye to it without slowing anything down.',
  motion: true,
  period: 1800,
  async setup(app, ctx) {
    await show.each(app, ctx);
  },
  // Each flip loads another track, so the message arrives with the flag that way.
  async each(app, ctx) {
    ctx.n = ((ctx.n ?? 1) % 6) + 2;
    await app.loadTrack(0, ctx.n);
    await app.until(() => app.$('.toastbox .toast'), 2000, 'the message');
  },
  async replay(app, ctx) {
    await show.each(app, ctx);
  },
  target: '.toastbox .toast',
  aid(d, app, ctx) {
    const t = app.$('.toastbox .toast');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const a = t.getAnimations().find((x) => Number(x.effect?.getComputedTiming?.().endTime) > 0);
    const now = a && a.playState === 'running' ? Number(a.currentTime ?? 0) / Number(a.effect.getComputedTiming().endTime || 1) : 1;
    d.motion(r, {
      title: 'How far in it is, over time',
      curves: { before: [0, 1, 0, 1], after: [0.23, 1, 0.32, 1] },
      phase: ctx.phase,
      now,
      legend: [
        { tone: 'bad', text: 'Before: just appears' },
        { tone: 'ok', text: 'After: rises in, quickly' },
      ],
    });
  },
};
