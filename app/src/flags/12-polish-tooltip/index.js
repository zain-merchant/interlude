// #12 (polish): tooltips that open like they belong to each other.
//
// Every tooltip waited 600 ms and then popped in at full strength, even
// when you'd just read the one next to it, so scanning a row of controls
// (the mixer's knobs, the transport) meant waiting at each one. With the
// flag on, the first tip still waits, then fades and rises in over a
// short, strong ease-out; moving straight on to the next control (within
// 300 ms) shows its tip at once with no entrance, as macOS does. Live
// readouts while dragging a knob or fader never animate. Hooks:
// tooltip.svelte.js (the skip), Tooltip.svelte (data-warm).
export default {
  id: 'polish-tooltip',
  n: 12,
  title: 'Tooltips: no wait when moving between them',
  group: 'Polish',
  notes: 'After the first tip, the next control\'s tip shows at once with no entrance. The first fades and rises 3px in over a strong ease-out.',
  settings: {
    ms: { type: 'range', min: 0, max: 250, step: 10, default: 140, unit: 'ms', label: 'Entrance' },
  },
};

/** Show me: points at deck A's EQ labels one after another, as a hand scanning the mixer would. */
export const show = {
  note: "This pointed at deck A's High, then Mid, then Low label, 400ms apart, as you would scanning the mixer. On, the first tip waits and fades in and the next ones appear at once; off, each one waits 600ms and pops in. Replay runs it again; try it by hand along the mixer.",
  async setup(app, ctx) {
    await show.replay(app);
  },
  async replay(app) {
    app.hideTips();
    const labels = app.$$('.mixer .ch')[0].querySelectorAll('.knob button.label');
    let prev = null;
    for (const [i, el] of [...labels].slice(0, 3).entries()) {
      if (prev) app.unhover(prev);
      app.hover(el);
      prev = el;
      await app.wait(i ? 400 : 900);
    }
  },
  target: (app) => [app.$("[role='tooltip']") ?? app.$$('.mixer .ch')[0]?.querySelectorAll('.knob button.label')[2]],
  aid(d, app) {
    const tip = app.$("[role='tooltip']");
    if (!tip) return;
    const r = tip.getBoundingClientRect();
    d.text(r.x, r.y - 10, tip.hasAttribute('data-warm') ? 'no entrance (followed on)' : 'first tip: waited, faded in');
  },
};
