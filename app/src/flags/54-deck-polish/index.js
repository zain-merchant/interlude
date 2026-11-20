// #54: small deck fixes from the panel's backlog.
//
// - b-K50: the white play head (1.5px) sat on the near-white waveform
//   core; it gets a 1px rgb(0 0 0 / 0.5) keyline either side, on the lanes
//   and the overview (waveform-2d.js draw()).
// - b-K62: hot cue numbers were weight 500, heavier than every other
//   numeral on the deck; now 400.
// - d-K64: the hot cue's number-to-time gap is 6px (the tabular "1" has
//   wide side bearings, so 8px read wider than the dot's gap).
// - b-K67: the tenths of a second are a step quieter than the minutes and
//   seconds (Deck.svelte splits the time when it's on).
// - Times round to tenths before minutes and seconds are split, so 59.96 s
//   reads 1:00.0, never 0:60.0 (on the deck and in hot cue tooltips).
// - The deck title's baseline meets the BPM numerals' baseline.
// - e-K45: the deck header's right-click menu was one lone command; it
//   gets Eject (off while playing).
// - e-K47, e-K69, e-K70: the BPM menu puts "Set BPM…" first (a click
//   that lands on the first item no longer halves the tempo), says the
//   grid step ("Move grid 10 ms earlier"), and spells "playhead".
// - Arrow keys on the deck's mode tabs moved the selection but left focus
//   on the old tab (reported by the layout builder); it now waits a tick
//   and focuses the newly selected tab.
// Not done, per the backlog's own advice: b-K56 (lane corners: "leave"),
// b-K72 (deck B's veiled colour: "leave"), e-K46 (menus open at the
// pointer: platform convention). Lever B3 (a phase meter, a-K31/b-K41)
// and b-K69 (more in the lane header, App.svelte) are feature work for
// the owner, not polish.
export default {
  id: 'deck-polish',
  n: 54,
  title: 'Deck details: play head, cue numbers, tenths, menus',
  group: 'Polish',
  notes: 'Keylined play head; hot cue numbers at weight 400 and 6px from their time; quieter tenths; Eject in the deck header menu; BPM menu: Set BPM first, "10 ms" steps, "playhead"; arrow keys on the mode tabs keep focus on the selected tab.',
};

/** Show me: deck A playing with a hot cue set; flipping shows the time and cue row as they were (before) and polished (after), magnified. */
export const show = {
  about: 'A handful of small deck details: the play head now has a dark edge so it shows against the bright waveform, hot cue numbers match the other numbers, the tenths of a second are quieter, and the right-click menus are tidier.',
  before: 'The white play head blends into the bright middle of the waveform, the hot cue numbers are bolder than every other number on the deck, and the flickering tenths digit is as loud as the minutes.',
  after: 'The play head has a thin dark edge so it stands out, the cue numbers match the rest, and the tenths step back so the time reads at a glance. Right-click the BPM or the title for the tidier menus.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const D = "[data-region='deck0']";
    await app.seek(0, 0.2);
    if (app.$(`${D} button[aria-label='Set hot cue 1']`)) await app.click(`${D} button[aria-label='Set hot cue 1']`);
    await app.seek(0, 0.25);
    await app.play(0);
  },
  target: (app) => [app.$("[data-region='deck0'] .times"), app.$("[data-region='deck0'] .perf .row")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const t = app.$("[data-region='deck0'] .times")?.getBoundingClientRect();
    const row = app.$("[data-region='deck0'] .perf .tc")?.getBoundingClientRect();
    if (!t || !row) return;
    const z = 2;
    const l = d.loupe('times', { x: t.left - 8, y: t.top - 6 }, { zoom: z, size: { w: Math.min(800, (t.width + 16) * z), h: (row.bottom - t.top + 12) * z }, near: t, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'tenths as loud as minutes; cue number bolder than the rest' : 'tenths step back; cue number matches', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
