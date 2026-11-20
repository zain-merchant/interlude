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
  title: 'Squircle corners',
  group: 'Shape',
  notes:
    'Figma-style smoothed corners on every rounded rect; circles and capsules unchanged. Smoothing changes the curve, not the corner\'s size (0% is the plain radius). Native corner-shape in Chrome 139+; in WebKit (Safari, the app) a clip with the ring redrawn along the curve, so borders are never cropped.',
  settings: {
    // A plain number (0 to 100) rather than a %.
    smoothing: { type: 'range', min: 0, max: 100, step: 5, default: 60, unit: '', label: 'Smoothing %' },
  },
};

/** Show me: loupes on deck A's corner and Sync's, with today's round corner dashed over each. */
export const show = {
  note: 'Corners ease into their curve; in each loupe the dashed arc is today\'s round corner.',
  setup(app, ctx) {
    const els = () => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")];
    // The plain radius each corner has with the flag off.
    ctx.radius = app.without('squircles', () => els().map((e) => (e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0 : 0)));
    ctx.els = els;
  },
  target: (app) => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")],
  aid(d, app, ctx) {
    const [deck, sync] = ctx.els().map((e) => e?.getBoundingClientRect());
    /** A loupe on a top-left corner with the plain arc of radius r over it. */
    const corner = (key, r, rad, zoom, size, caption) => {
      const src = { x: r.x - 3, y: r.y - 3 };
      const l = d.loupe(key, src, { zoom, size, near: new DOMRect(r.x, r.y, size.w / zoom, size.h / zoom), caption });
      const a = l.map(r.x, r.y + rad);
      const b = l.map(r.x + rad, r.y);
      const R = rad * zoom;
      d.clip(l.rect, () => d.path(`M${a.x} ${a.y}A${R} ${R} 0 0 1 ${b.x} ${b.y}`, { c: d.C.ghost, dash: '5 4', w: 1.5 }));
    };
    if (deck) corner('panel', deck, ctx.radius[0], 6, { w: 210, h: 170 }, 'deck A, 6×');
    if (sync) corner('button', sync, ctx.radius[1], 8, { w: 170, h: 130 }, 'Sync, 8×');
  },
};
