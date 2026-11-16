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

/** Show me: loads a track, which brings up the "Loaded … Undo" toast; Replay loads another. */
export const show = {
  note: "A load brought up the toast: watch it arrive. Replay with the flag off and on: on, it rises and fades in; off, it blinks on.",
  async setup(app) {
    await app.loadTrack(0, 3);
    await app.until(() => app.$('.toastbox .toast'), 2000, 'the toast');
  },
  async replay(app) {
    app.$('.toastbox .toast') && (await app.key('Escape', { target: document.body }));
    await app.wait(200);
    await app.loadTrack(0, Math.floor(Math.random() * 8) + 2);
  },
  target: '.toastbox .toast',
};
