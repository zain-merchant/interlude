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

/** Show me: loupes on a panel corner and a button corner. */
export const show = {
  note: "Loupes on deck A's and Sync's corners: same corner size, a smoother curve, the border following it. Drag Smoothing under More (0% is today's corner).",
  target: (app) => [app.deck(0), app.$("[data-region='deck0'] .btn.sync")],
  aid(d, app) {
    const deck = app.deck(0)?.getBoundingClientRect();
    const sync = app.$("[data-region='deck0'] .btn.sync")?.getBoundingClientRect();
    const how = CSS.supports('corner-shape', 'superellipse(2)') ? 'corner-shape' : 'clip + redrawn ring';
    if (deck) d.loupe('panel', { x: deck.x - 4, y: deck.y - 4 }, { zoom: 6, size: { w: 216, h: 120 }, at: { x: 16, y: 10 }, caption: `deck A corner, 6× (${how})` });
    if (sync) d.loupe('button', { x: sync.x - 3, y: sync.y - 3 }, { zoom: 6, size: { w: 216, h: 120 }, at: { x: 244, y: 10 }, caption: 'Sync corner, 6×' });
  },
};
