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

/** Show me: the two-hour live set on deck A and in the library; flipping shows its times as minutes only (before) and in hours (after). */
export const show = {
  about: 'Times over an hour read as minutes, like "134:33", which you had to work out. Now they read in hours: "2:14:33".',
  before: 'A two-hour live set reads "134:33" in the library and "107:38" on the deck: minutes only, so you have to do the sum to know how long it is.',
  after: 'Past an hour the times read in hours, minutes and seconds ("2:14:33"), like a clock, so a long set reads at a glance. Shorter tracks are unchanged.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app, ctx) {
    await app.loadTrack(0, 'Printworks');
    // Past the first hour, so the time played reads in hours too.
    await app.seek(0, 0.8);
    await app.search('Printworks');
    ctx.els = () => [app.$("[data-region='deck0'] .hub .el"), app.$("[data-region='deck0'] .hub .rm"), app.rows().find((x) => x.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]];
  },
  target: (app) => [app.$("[data-region='deck0'] .hub"), app.rows().find((r) => r.textContent.includes('Printworks'))?.querySelectorAll('.n.num')[1]],
  badge: (app) => app.$("[data-region='deck0'] .hub")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const say = (s) => {
      const m = s.match(/(\d+):(\d\d)(?::(\d\d))?/);
      if (!m) return '';
      const [h, min] = m[3] ? [Number(m[1]), Number(m[2])] : [Math.floor(Number(m[1]) / 60), Number(m[1]) % 60];
      if (!h) return '';
      return before ? `${m[3] ? '' : Number(m[1]) + ' minutes: '}that's ${h} h ${min} min` : `${h} h ${min} min, read straight off`;
    };
    ctx.els().forEach((e, i) => {
      const r = app.textRect(e) ?? e?.getBoundingClientRect();
      const s = say(e?.textContent ?? '');
      if (!r || !s) return;
      const tone = before ? 'bad' : 'ok';
      d.box(new DOMRect(r.x - 4, r.y - 3, r.width + 8, r.height + 6), { c: before ? d.C.bad : d.C.ok, w: 1.5, rx: 4 });
      if (i === 0) d.text(r.right + 12, r.top + r.height / 2, s, { tone, free: true });
      else d.text(r.right + 4, r.bottom + 16, s, { anchor: 'end', tone });
    });
  },
};
