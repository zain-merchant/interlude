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

/** Show me: the pointer moves along three of deck A's mixer labels; a timeline shows how long each tip took to appear. */
export const show = {
  about: 'Every tooltip made you wait over half a second, even right after reading the one next to it. Now, once one is showing, the next appears the moment you point at it.',
  before: 'The pointer moves along three labels. At each one you wait 0.6 seconds again before its tip appears, so reading a row of controls is slow going.',
  after: 'The first tip still waits (so tips don\'t flash up as you pass by), but moving on to the next control shows its tip at once.',
  period: 900,
  async setup(app, ctx) {
    await show.each(app, ctx);
  },
  // Each flip walks the pointer along the labels again and times every tip.
  async each(app, ctx) {
    // A newer walk (a flip, Before / After pressed) takes over from this one.
    const me = (ctx.walk = {});
    if (ctx.cur) app.unhover(ctx.cur);
    app.hideTips();
    await app.wait(400);
    if (me !== ctx.walk) return;
    const labels = [...app.$$('.mixer .ch')[0].querySelectorAll('.knob button.label')].slice(0, 3);
    const log = labels.map((el) => ({ name: el.textContent.trim(), el, wait: null }));
    ctx.log = log;
    for (const item of log) {
      if (me !== ctx.walk) return;
      if (ctx.cur) app.unhover(ctx.cur);
      const t0 = performance.now();
      app.hover(item.el);
      ctx.cur = item.el;
      for (let w = 0; w < 1000 && me === ctx.walk; w += 20) {
        if (app.tooltip.visible) {
          item.wait = performance.now() - t0;
          break;
        }
        await app.wait(20);
      }
      await app.wait(550);
    }
    if (me !== ctx.walk) return;
    app.unhover(ctx.cur);
    ctx.cur = null;
    app.hideTips();
  },
  target: (app) => [...app.$$('.mixer .ch')[0].querySelectorAll('.knob button.label')].slice(0, 3),
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const labels = [...app.$$('.mixer .ch')[0].querySelectorAll('.knob button.label')].slice(0, 3).map((e) => e.getBoundingClientRect());
    if (!labels.length || !ctx.log) return;
    // The label the pointer is on.
    if (ctx.cur) {
      const c = ctx.cur.getBoundingClientRect();
      d.box(new DOMRect(c.x - 3, c.y - 2, c.width + 6, c.height + 4), { w: 1.5, rx: 4 });
    }
    // A small timeline beside the mixer: one bar per label, as long as its tip kept you waiting.
    const x = labels[0].left - 330;
    const y = labels[0].top - 8;
    const W = 290;
    const k = 200; // px per second
    d.box(new DOMRect(x, y, W + 26, 34 + ctx.log.length * 26), { c: 'rgb(255 255 255 / .14)', fill: 'rgb(16 16 16 / .94)', w: 1, rx: 10 });
    ctx.at = new DOMRect(x, y, W, 10);
    d.text(x + 10, y + 16, 'Waiting for each tip', { fixed: true, free: true });
    ctx.log.forEach((item, i) => {
      const ry = y + 42 + i * 26;
      d.text(x + 10, ry, item.name, { fixed: true, free: true });
      const bx = x + 64;
      if (item.wait == null) {
        d.line(bx, ry, bx + 4, ry, { c: 'rgb(255 255 255 / .3)', w: 6 });
        return;
      }
      const w = Math.max(3, (item.wait / 1000) * k);
      // With the flag on, the first tip waiting is by design (tips don't flash up as you pass by).
      const first = i === 0 && ctx.phase === 'after';
      const slow = item.wait > 300;
      d.line(bx, ry, bx + w, ry, { c: first ? d.C.ghost : slow ? d.C.bad : d.C.ok, w: 6 });
      d.text(bx + w + 6, ry, slow ? `${(item.wait / 1000).toFixed(1)} s${first ? ', the first one' : ''}` : 'at once', { fixed: true, free: true, tone: first ? undefined : slow ? 'bad' : 'ok' });
    });
  },
};
