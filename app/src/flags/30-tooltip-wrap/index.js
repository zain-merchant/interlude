// #30 (C6; critique E9; backlog e-K49, e-K50): long tooltips wrap.
//
// Tooltips never wrapped (white-space: nowrap), so a tip with a description
// was one long line: the Sampler button's was 381px and sat off-centre
// against the window edge. Now a tip is at most 280px wide and wraps into
// a balanced block (text-wrap: pretty; WebKit wraps normally); short tips
// (name, value, key) are narrower than that and stay on one line. Tooltip
// placement already measures the tip's width, so a wrapped tip stays
// centred on its control. Also from the backlog: the tip's radius is the
// controls' --r (it was 6px), and it gets the menus' drop shadow, since it
// floats over busy waveforms and knobs. The key's look (a bare dim glyph) is #10's.
export default {
  id: 'tooltip-wrap',
  n: 30,
  title: 'Long tooltips wrap',
  group: 'Polish',
  notes: 'Tooltips wrap at 280px (text-wrap: pretty); short ones stay one line. Radius --r and the menu shadow.',
};

/** Show me: the Sampler button's tooltip, flipping between one long line and a wrapped block. */
export const show = {
  about: 'Tooltips with an explanation ran out in one long line (the Sampler button\'s was almost 400px wide) and could sit off-centre. Now long tips wrap into a short block above the control.',
  before: "Point at Sampler: its tip is one long line, wider than the button by far, and pushed off-centre by the window's edge.",
  after: 'The tip wraps into two short lines centred over the button, easy to read at a glance, and floats clearly above what is behind it.',
  async setup(app, ctx) {
    ctx.btn = app.$('section.library .bar .samp');
    await show.each(app, ctx);
  },
  async each(app, ctx) {
    app.hover(ctx.btn);
    await app.until(() => app.$(".tip[role='tooltip']"), 2000, 'the tooltip');
    await app.wait(80);
  },
  target: (app) => [app.$(".tip[role='tooltip']")],
  aid(d, app, ctx) {
    const t = app.$(".tip[role='tooltip']")?.getBoundingClientRect();
    if (!t) return;
    const before = ctx.phase === 'before';
    d.text(t.x + t.width / 2, t.y - 16, before ? `one line, ${Math.round(t.width)}px wide` : `wrapped, ${Math.round(t.width)}px wide`, { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
