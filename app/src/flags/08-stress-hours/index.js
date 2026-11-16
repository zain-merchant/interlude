// #8: times past an hour read as minutes.
//
// Times were always minutes and seconds, so a two-hour recorded mix showed
// "134:33" in the library's Time column, "107:38.4" and "−26:54.6" on the
// deck, and a hot cue set an hour in read "64:10". Past an hour they now
// read as hours, minutes and seconds (2:14:33, 1:47:38.4, 1:04:10), like
// the recording clock already does. Shorter tracks read as before. The
// format is in time.js; Library.svelte, Deck.svelte and Performance.svelte
// use it while the flag is on.
export default {
  id: 'stress-hours',
  n: 8,
  title: 'Times past an hour show hours',
  group: 'Stability',
  notes: 'Library Time, deck elapsed/remaining and hot cue times read h:mm:ss past an hour (a recorded mix, a long live set) instead of 134:33.',
};

/** Show me: the two-hour live set from the worst-case data, on deck A and in the library. */
export const show = {
  note: 'Turned on Worst-case data (the page reloaded for it) and loaded the 2h14m "Live at Printworks" set on deck A, 80% in. Compare its Time in the library and the deck\'s elapsed and remaining: off, they read 134:33, 107:38.4 and −26:54.6; on, 2:14:33, 1:47:38.4 and −26:54.6.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app) {
    await app.loadTrack(0, 'Printworks');
    const ov = app.$("[data-region='deck0'] .overview");
    const r = ov.getBoundingClientRect();
    await app.click(ov, { clientX: r.x + r.width * 0.8, clientY: r.y + r.height / 2 });
    await app.search('Printworks');
  },
  target: (app) => [app.$("[data-region='deck0'] .times"), app.rows().find((r) => r.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]],
  aid(d, app) {
    const t = app.$("[data-region='deck0'] .times");
    const el = app.$('.el', t)?.getBoundingClientRect();
    const rm = app.$('.rm', t)?.getBoundingClientRect();
    if (el) d.text(el.x, el.bottom + 10, 'elapsed');
    if (rm) d.text(rm.right, rm.bottom + 10, 'remaining', { anchor: 'end' });
    const cell = app.rows().find((r) => r.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]?.getBoundingClientRect();
    if (cell) d.text(cell.right, cell.y - 9, 'Time', { anchor: 'end' });
  },
};
