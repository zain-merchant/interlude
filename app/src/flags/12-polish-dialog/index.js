// #12 (polish): dialogs open on a strong ease-out.
//
// The import and report dialogs rise in over 200 ms on the browser's
// built-in ease-out, which is soft at the start: the first frames, the
// ones you watch most closely, barely move, so the dialog feels late.
// With the flag on they use a strong ease-out (cubic-bezier(0.23, 1,
// 0.32, 1)), which covers most of the distance at once and settles, and
// start from scale 0.97 rather than 0.99 so the motion reads. CSS only.
//
// Later (critique panel): the card faded from 0 for its whole entrance, so
// the mixer and list showed through its words for the first frames (Mo1);
// it's now opaque within 80ms while it rises. And the 72% black, blurred
// scrim hid the decks' times and waveforms, which hurts most when you
// report a problem mid-set (E8, C58): the scrim is now 50% with no blur
// over the decks, and the blur stays over the library only (App.svelte
// passes the library's top as --flag-polish-dialog-lib).
export default {
  id: 'polish-dialog',
  n: 12,
  title: 'Dialogs arrive quickly',
  group: 'Polish',
  notes: 'Import and Report dialogs: strong ease-out curve instead of the built-in one, from scale 0.97, opaque within 80ms. A lighter scrim with no blur over the decks.',
  settings: {
    ms: { type: 'range', min: 120, max: 320, step: 20, default: 220, unit: 'ms', label: 'Duration (ease-out)' },
    curve: {
      type: 'choice',
      label: 'Feel',
      default: 'ease',
      options: [
        ['ease', 'Ease-out', 'Covers most of the way at once and settles, over the time above.'],
        ['spring', 'Site spring', 'The website\'s snappy spring (301ms), so dialogs feel like the site.'],
      ],
    },
    scrim: {
      type: 'choice',
      label: 'Behind it',
      default: 'library',
      options: [
        ['library', 'Decks clear', 'Half-dark with no blur over the decks, so you can still read the times and waveforms; the library behind stays blurred.'],
        ['none', 'No blur', 'Half-dark everywhere and nothing blurred: the simplest, but the busy track list shows through more.'],
        ['before', 'As it was', 'Dark and blurred over everything, decks included: the dialog stands out most, but the playing decks are hidden.'],
      ],
    },
  },
};

/** Show me: the Report dialog opens again and again, slowed down, flag off then on; a chart of how far it has come. */
export const show = {
  about: 'Dialogs drifted in slowly, see-through at first, and the dark blur behind them hid the playing decks. Now they arrive at once, solid, and the decks stay readable behind them.',
  before: 'The dialog creeps in, see-through for its first moments, and a heavy dark blur covers everything, so you lose the time left on a playing deck while you type.',
  after: 'It covers most of the way straight away and is solid almost at once. Behind it the decks are only dimmed, not blurred, so the times and waveforms stay readable.',
  motion: true,
  period: 2000,
  async setup(app) {
    await app.openReport();
  },
  // Each flip opens it again, so its entrance plays with the flag that way.
  async each(app) {
    await app.key('Escape', { target: app.$(".card[aria-labelledby='report-title']") ?? document.body });
    await app.wait(120);
    await app.openReport();
  },
  async replay(app) {
    await show.each(app);
  },
  target: ".card[aria-labelledby='report-title']",
  aid(d, app, ctx) {
    const card = app.$(".card[aria-labelledby='report-title']");
    if (!card) return;
    const r = card.getBoundingClientRect();
    // The rise, not the 80ms fade: the longest of the card's animations.
    const a = card.getAnimations().reduce((m, x) => (Number(x.effect?.getTiming?.().duration) > Number(m?.effect?.getTiming?.().duration ?? 0) ? x : m), null);
    const t = a ? Number(a.currentTime ?? 0) / Number(a.effect.getComputedTiming().endTime || 1) : 1;
    d.motion(r, {
      title: 'How far in it is, over time',
      curves: { before: [0, 0, 0.58, 1], after: [0.23, 1, 0.32, 1] },
      phase: ctx.phase,
      now: a && a.playState === 'running' ? t : 1,
      legend: [
        { tone: 'bad', text: 'Before: slow start' },
        { tone: 'ok', text: 'After: most of the way at once' },
      ],
    });
  },
};
