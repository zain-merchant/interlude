// #1: Apple-style continuous corners (squircles) wherever there's a radius.
//
// Every rounded rect (panels, buttons, fields, rows, popovers, menus, the
// toast) gets a smoothed corner whose curvature eases in from the edge, like
// iOS and macOS, instead of a circular arc that starts abruptly. Circles and
// capsules stay as they are.
//
// WebKit, which the app ships in, has no `corner-shape` yet, so squircles.js
// clips each element to the smoothed shape (started from App.svelte). Only
// the thin slivers between the round and the smoothed corner are cut, so
// drop shadows and focus rings outside the box are kept.
export default {
  id: 'squircles',
  n: 1,
  title: 'Squircle corners',
  group: 'Shape',
  notes:
    'Continuous-curvature corners on every rounded rect; circles and capsules unchanged. WebKit has no corner-shape, so this clips each element (shadows and focus rings outside the box are kept). Inset hairlines follow the round corner underneath, so at high smoothing they thin slightly where the curves part.',
  settings: {
    smoothing: { type: 'range', min: 0, max: 100, step: 5, default: 60, unit: '%', label: 'Smoothing' },
    method: {
      type: 'choice',
      options: [
        ['clip', 'Clip'],
        ['native', 'corner-shape (untested)'],
      ],
      default: 'clip',
      label: 'Method',
    },
  },
};
