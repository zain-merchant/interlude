// #12 (polish): the toast arrives instead of appearing.
//
// "Loaded Night Shift on deck A · Undo" blinked into place at the bottom of
// the window. Toasts are occasional, so a short entrance helps the eye find
// it without slowing anything down: it rises 8px and fades in over a
// strong ease-out. Leaving stays instant (that would need a hook). CSS only.
//
// Later (critique panel, Mo1): the whole card faded from 0 over the full
// 220ms, so for the first frames the library's text showed through the
// toast's words. The card is now opaque within 80ms while the rise takes
// 160ms. Docked in the library toolbar (#13) it rises only 4px, with the
// fade, over 180ms, and the track count under it cross-fades (180ms out,
// 140ms back). The toast itself still leaves at once (a fade-out would
// need an outro hook on the toast in App.svelte).
export default {
  id: 'polish-toast',
  n: 12,
  title: 'The "Loaded" message slides in',
  group: 'Polish',
  notes: 'The undo toast rises 8px over 160ms on a strong ease-out instead of blinking on; it turns opaque in the first 80ms so nothing shows through its words.',
  settings: {
    rise: { type: 'range', min: 100, max: 400, step: 20, default: 160, unit: 'ms', label: 'Rise (ease-out)' },
  },
};

/** Show me: a track load brings the toast up again and again, slowed down, flag off then on. */
export const show = {
  about: 'The "Loaded … on deck A" message blinked on out of nowhere. Now it slides up and fades in, so your eye catches where it came from.',
  before: 'The message at the bottom blinks into place in a single frame: easy to miss, or to be startled by.',
  after: 'It rises a little over a sixth of a second and is solid almost at once, so it draws the eye without the list showing through its words.',
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
    // The rise, not the 80ms fade: the longest of the toast's transitions.
    const a = t.getAnimations().reduce((m, x) => (Number(x.effect?.getComputedTiming?.().endTime) > Number(m?.effect?.getComputedTiming?.().endTime ?? 0) ? x : m), null);
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
