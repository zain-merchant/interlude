// #12 (polish): dialogs open on a strong ease-out.
//
// The import and report dialogs rise in over 200 ms on the browser's
// built-in ease-out, which is soft at the start: the first frames, the
// ones you watch most closely, barely move, so the dialog feels late.
// With the flag on they use a strong ease-out (cubic-bezier(0.23, 1,
// 0.32, 1)), which covers most of the distance at once and settles, and
// start from scale 0.97 rather than 0.99 so the motion reads. CSS only.
export default {
  id: 'polish-dialog',
  n: 12,
  title: 'Dialogs open on a strong ease-out',
  group: 'Polish',
  notes: 'Import and Report dialogs: strong ease-out curve instead of the built-in one, from scale 0.97.',
  settings: {
    ms: { type: 'range', min: 120, max: 320, step: 20, default: 220, unit: 'ms', label: 'Duration' },
  },
};

/** Show me: opens the Report dialog; Replay closes and opens it again. */
export const show = {
  note: 'The Report a problem dialog just opened: watch its entrance. Press Replay to see it again, then turn the flag off and Replay to compare: on, it covers most of the way at once and settles (strong ease-out from 97%); off, it creeps in. Duration under More.',
  async setup(app) {
    await app.openReport();
  },
  async replay(app) {
    await app.key('Escape', { target: document.body });
    await app.wait(250);
    await app.openReport();
  },
  target: ".card[aria-labelledby='report-title']",
};
