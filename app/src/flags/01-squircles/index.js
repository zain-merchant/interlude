// #1: Apple-style continuous corners (squircles) wherever there's a radius.
//
// Every rounded rect (panels, buttons, fields, rows, popovers, menus, the
// toast) gets a smoothed corner whose curvature eases in from the edge, like
// iOS and macOS, instead of a circular arc that starts abruptly. Circles and
// capsules stay as they are.
//
// The shape is Figma's corner smoothing: 0% is the plain border-radius, and
// more smoothing starts the curve further along each edge while its middle
// (the 45° point) stays where the plain radius puts it, so a corner never
// looks bigger or smaller, only smoother. squircles.js (started from
// App.svelte) draws it one of two ways:
// - Chrome 139+: CSS corner-shape: superellipse(1 + smoothing), with the
//   radius scaled so its 45° point matches (a superellipse at the same
//   radius cuts the corner less, which reads as a bigger corner).
// - WebKit (Safari, and Tauri's WKWebView, which the app ships in; neither
//   has corner-shape as of macOS 26.4 / Safari 18.4): a clip-path that cuts
//   only the slivers between the round and the smoothed corner (shadows
//   outside the box are kept), with the element's inset ring or border
//   redrawn along the smoothed edge, so it is never cropped.
// Elements are re-measured only when their size or class changes.
export default {
  id: 'squircles',
  n: 1,
  title: 'Smoother rounded corners',
  group: 'Shape',
  notes:
    'Figma-style smoothed corners on every rounded rect; circles and capsules unchanged. Smoothing changes the curve, not the corner\'s size (0% is the plain radius). Native corner-shape in Chrome 139+; in WebKit (Safari, the app) a clip with the ring redrawn along the curve, so borders are never cropped.',
  settings: {
    // A plain number (0 to 100) rather than a %.
    smoothing: { type: 'range', min: 0, max: 100, step: 5, default: 60, unit: '', label: 'Smoothing %' },
  },
};

/** Show me: loupes on deck A's corner and Sync's, flipping between the plain round corner and the smoothed one. */
export const show = {
  about: 'Rounded corners bent suddenly, like a circle stuck onto a box. Now they ease into the curve, the way Apple\'s do.',
  before: 'Each corner is a quarter circle: the straight edge turns into the curve all at once, which looks a little stiff up close.',
  after: 'The edge starts bending earlier and more gradually, so corners look softer and more finished. Their size is the same.',
  setup(app, ctx) {
    const els = () => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")];
    // The plain radius each corner has with the flag off.
    ctx.radius = app.without('squircles', () => els().map((e) => (e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0 : 0)));
    ctx.els = els;
  },
  target: (app) => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const [deck, sync] = ctx.els().map((e) => e?.getBoundingClientRect());
    const smooth = (app.isOn('squircles') ? Number(document.documentElement.style.getPropertyValue('--flag-squircles-smoothing')) || 60 : 0) / 100;
    const on = ctx.phase !== 'before';
    /** A loupe on a top-left corner: the plain round corner dashed over it, and where each version starts to bend. */
    const corner = (key, r, rad, zoom, size, at, caption) => {
      const src = { x: r.x - 4, y: r.y - 4 };
      const l = d.loupe(key, src, { zoom, size, at, caption: '' });
      const a = l.map(r.x, r.y + rad);
      const b = l.map(r.x + rad, r.y);
      const R = rad * zoom;
      d.clip(l.rect, () => {
        d.path(`M${a.x} ${a.y}A${R} ${R} 0 0 1 ${b.x} ${b.y}`, { c: d.C.ghost, dash: '5 4', w: 1.5 });
        // Where the edge starts to bend: the plain corner at its radius, the smooth one further along.
        const top = l.map(r.x, r.y).y;
        const plain = l.map(r.x + rad, r.y).x;
        const soft = l.map(r.x + Math.min(rad * 1.6, r.width / 2), r.y).x;
        d.line(plain, top - 10, plain, top + 10, { c: on ? d.C.ghost : d.C.bad, w: 2 });
        d.line(soft, top - 10, soft, top + 10, { c: on ? d.C.ok : 'rgb(255 255 255 / .2)', w: 2 });
      });
      d.text(l.at.x + 10, l.at.y + l.rect.height - 16, caption, { fixed: true });
      return l;
    };
    if (deck) {
      const l = corner('panel', deck, ctx.radius[0], 9, { w: 330, h: 250 }, { x: 590, y: 150 }, "deck A's top-left corner, 9× bigger");
      ctx.at = l.rect;
      const top = l.map(deck.x, deck.y).y;
      const plain = l.map(deck.x + ctx.radius[0], deck.y).x;
      d.text(plain - 6, top - 22, on ? 'old bend started here' : 'the bend starts here, suddenly', { anchor: on ? 'end' : 'start', tone: on ? undefined : 'bad', fixed: true });
      if (on) d.text(l.map(deck.x + ctx.radius[0] * 1.6, deck.y).x + 6, top + 26, 'now it starts here, gently', { tone: 'ok', fixed: true });
    }
    if (sync) corner('button', sync, ctx.radius[1], 12, { w: 240, h: 180 }, { x: 590, y: 414 }, "Sync button's corner, 12×");
    void smooth;
  },
};
