// #1: Apple-style continuous corners (squircles) wherever there's a radius.
//
// Every rounded rect (panels, buttons, fields, rows, popovers, menus, the
// toast) gets a smoothed corner whose curvature eases in from the edge, like
// iOS and macOS, instead of a circular arc that starts abruptly. Circles and
// capsules stay as they are.
//
// It uses CSS `corner-shape: superellipse(k)` (style.css), with the
// Smoothing setting mapped onto k from 1 (round) to 2 (squircle). The
// radius stays the same, only the curve changes, and borders and shadows
// follow the curve, so nothing is cropped. squircles.js marks which elements
// are rounded rects (started from App.svelte).
//
// Safari / WebKit, which the app ships in (Tauri's WKWebView), has no
// corner-shape as of macOS 26.4: there this flag shows nothing, the corners
// stay plain border-radius. Chrome 139 and later draw it. An earlier
// version clipped each element to the shape instead, which worked in WebKit
// but cut into inset borders at high smoothing.
export default {
  id: 'squircles',
  n: 1,
  title: 'Squircle corners',
  group: 'Shape',
  notes:
    'Continuous-curvature corners on every rounded rect (CSS corner-shape: superellipse); circles and capsules unchanged. The radius stays the same and borders are never cropped. Needs Chrome 139+: Safari / the app\'s WKWebView (macOS 26.4) has no corner-shape yet and shows plain round corners.',
  settings: {
    // A plain number (0 to 100) rather than a %, so the CSS can do maths with it.
    smoothing: { type: 'range', min: 0, max: 100, step: 5, default: 60, unit: '', label: 'Smoothing %' },
  },
};

/** Show me: loupes on a panel corner and a button corner. */
export const show = {
  note: "Loupes (6×) on deck A's corner and the Sync button's: the radius stays the same, the curve eases in from the edges instead of starting abruptly, and the border follows it. Tune Smoothing under More. Needs Chrome 139+; in Safari and the app's WKWebView (no corner-shape) the corners stay round.",
  target: (app) => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")],
  aid(d, app) {
    if (!CSS.supports('corner-shape', 'superellipse(2)')) {
      const r = app.deck(0)?.getBoundingClientRect();
      if (r) d.text(r.x + 8, r.y - 10, 'This browser has no corner-shape: the flag changes nothing here (Safari / WKWebView too)', { c: d.C.bad });
      return;
    }
    const deck = app.deck(0)?.getBoundingClientRect();
    const sync = app.$("[data-region='deck0'] .btn.sync")?.getBoundingClientRect();
    if (deck) d.loupe('panel', { x: deck.x - 4, y: deck.y - 4 }, { zoom: 6, size: { w: 216, h: 120 }, at: { x: 16, y: 10 }, caption: 'deck A corner, 6×' });
    if (sync) d.loupe('button', { x: sync.x - 3, y: sync.y - 3 }, { zoom: 6, size: { w: 216, h: 120 }, at: { x: 244, y: 10 }, caption: 'Sync corner, 6×' });
  },
};
