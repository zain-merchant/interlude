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

/** Show me: the two-hour live set from the worst-case data, on deck A and in the library, each time tagged with how it reads off. */
export const show = {
  note: 'The 2-hour set is loaded: its times read in hours; each tag is how it reads with the flag off.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app, ctx) {
    await app.loadTrack(0, 'Printworks');
    const ov = app.$("[data-region='deck0'] .overview");
    const r = ov.getBoundingClientRect();
    await app.click(ov, { clientX: r.x + r.width * 0.8, clientY: r.y + r.height / 2 });
    await app.search('Printworks');
    ctx.els = () => [app.$("[data-region='deck0'] .times .rm"), app.rows().find((x) => x.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]];
    // The same times as they read with the flag off, and on.
    const read = () => ctx.els().map((e) => e?.textContent.match(/[−-]?\d+(:\d\d)+(\.\d)?/)?.[0] ?? '');
    ctx.text = { on: app.isOn('stress-hours') ? read() : app.without('stress-hours', read), off: app.without('stress-hours', read) };
  },
  target: (app) => [app.$("[data-region='deck0'] .times"), app.rows().find((r) => r.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]],
  aid(d, app, ctx) {
    const other = app.isOn('stress-hours') ? ctx.text.off : ctx.text.on;
    const word = app.isOn('stress-hours') ? 'off' : 'on';
    ctx.els().forEach((e, i) => {
      const r = e?.getBoundingClientRect();
      if (!r || !other[i]) return;
      d.text(r.right, r.bottom + 14, `${word}: ${other[i]}`, { anchor: 'end' });
    });
  },
};
