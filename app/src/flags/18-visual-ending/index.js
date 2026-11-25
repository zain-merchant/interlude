// #18 (visual): the track is running out.
//
// The remaining time ("−0:24.3") looked the same at five minutes and at
// five seconds, so a track could end on you mid-mix. With the flag on,
// while a deck plays its last seconds the remaining time turns red
// (--kill, the app's "critical" colour, well apart from Cue's amber just
// below it), and in the last ten seconds it pulses slowly by brightening
// towards white and back, never dimming (not under reduced motion).
// Hook: Deck.svelte (class:ending on the remaining time).
export default {
  id: 'visual-ending',
  n: 18,
  title: 'Warn when a track is about to end',
  group: 'Polish',
  notes: 'While playing, the remaining time turns red (--kill) in the last seconds, and pulses brighter in the last ten.',
  settings: {
    secs: { type: 'range', min: 10, max: 60, step: 5, default: 30, label: 'Warn from (s)' },
    pulse: {
      type: 'choice',
      label: 'Last ten seconds',
      default: 'on',
      options: [
        ['on', 'Pulse', 'In the last ten seconds the red time also brightens and settles slowly, so it catches your eye even while you look at the other deck (never under reduced motion).'],
        ['off', 'Steady', 'The red stays steady to the end: calmer, but easier to miss.'],
      ],
    },
  },
};

/** Show me: deck A plays its last seconds; flipping shows the remaining time unchanged (before) and turned to the warning colour (after). */
export const show = {
  about: 'The time left looked the same with five minutes or five seconds to go, so a track could run out mid-mix. Now it turns red in the last 30 seconds and pulses in the last ten.',
  before: 'Deck A has only seconds left, but its remaining time looks exactly as it does mid-track: nothing tells you to get the next one in.',
  after: 'In the last 30 seconds the remaining time turns red, and in the last ten it pulses brighter, so you notice even while looking at the other deck.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    // The mock's tracks run 5 to 8 minutes; 95% in is 15 to 25 seconds from the end.
    await app.seek(0, 0.95);
    await app.play(0);
  },
  // Keeps it in its last seconds (it would run out during a long look).
  async each(app) {
    const rm = app.$("[data-region='deck0'] .hub .rm")?.textContent ?? '';
    const m = rm.match(/(\d+):(\d\d)/);
    const left = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    if (left < 6 || left > 28) await app.seek(0, 0.95);
    await app.play(0);
  },
  target: "[data-region='deck0'] .hub .rm",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const rm = app.$("[data-region='deck0'] .hub .rm");
    if (!rm) return;
    const r = app.textRect(rm) ?? rm.getBoundingClientRect();
    const z = 3;
    const l = d.loupe('time', { x: r.left - 10, y: r.top - 8 }, { zoom: z, size: { w: (r.width + 20) * z, h: (r.height + 16) * z }, near: r, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    const last = rm.classList.contains('last');
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'seconds left, but it looks like any other time' : last ? 'last ten seconds: red, and pulsing brighter' : 'last 30 seconds: turns red', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
