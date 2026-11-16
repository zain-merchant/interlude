// #12 (polish): the toast arrives instead of appearing.
//
// "Loaded Night Shift on deck A · Undo" blinked into place at the bottom of
// the window. Toasts are occasional, so a short entrance helps the eye find
// it without slowing anything down: it rises 8px and fades in over a
// strong ease-out. Leaving stays instant (that would need a hook). CSS only.
export default {
  id: 'polish-toast',
  n: 12,
  title: 'Toast rises in',
  group: 'Polish',
  notes: 'The undo toast rises 8px and fades in with a strong ease-out instead of blinking on.',
  settings: {
    ms: { type: 'range', min: 100, max: 400, step: 20, default: 220, unit: 'ms', label: 'Entrance' },
  },
};
