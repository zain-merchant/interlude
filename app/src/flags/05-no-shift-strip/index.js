// #5: the deck's mode row and beat-jump readout moved as values changed.
//
// Measured at 1440×900, deck A:
// - Setting a hot cue turned "Set" into "0:32": the cue's dot and number
//   moved 3px left.
// - Changing the loop size (4 → 16 → 1/16 beats) resized the loop button,
//   and with the row spaced evenly, both arrows moved 3–6px.
// - The beat-jump size in the transport ("4" → "1/16") resized the middle of
//   the jump control, moving its ‹ › hit areas by up to 4px.
// - Choosing another effect (Echo → Flanger) widened its button and pushed
//   everything after it 9px right; On/Off also changed width.
// Each value now has a slot sized for its longest form, so pressing a
// control never moves the one next to it. Hot cue and FX slots apply where
// the deck has room (320px and up); in the narrowest decks they'd overflow,
// so those keep their old sizing (see stress-narrow-strip for that width).
export default {
  id: 'no-shift-strip',
  n: 5,
  title: 'Cues, loop, FX and beat jump hold their places',
  group: 'Stability',
  notes: 'Hot cue times, loop and beat-jump sizes, the effect name and On/Off sit in fixed slots, so the controls beside them stay put.',
};

/** Show me: shrinks deck A's loop from 4 beats to 1/4 and ghosts the arrows with the flag off. */
export const show = {
  note: "Deck A's loop went from 4 beats to 1/4; dashed is where the arrows would be with the flag off.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    const D = "[data-region='deck0']";
    const size = () => {
      const s = app.$(`${D} .perf .big b`)?.textContent.trim() ?? '4';
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : a;
    };
    // To 4 beats, then down to 1/4.
    for (let i = 0; i < 10 && size() !== 4; i++) await app.click(`${D} button[aria-label='${size() < 4 ? 'Double loop' : 'Halve loop'}']`);
    for (let i = 0; i < 4; i++) await app.click(`${D} button[aria-label='Halve loop']`);
    ctx.parts = () => [...app.$$(`${D} .perf .tb.ar`), ...app.$$(`${D} .transport .jumps button`)];
    ctx.b = app.both('no-shift-strip', ctx.parts());
  },
  target: (app) => [app.$("[data-region='deck0'] .perf"), app.$("[data-region='deck0'] .transport .jumps")],
  aid(d, app, ctx) {
    const other = app.other('no-shift-strip', ctx.b);
    const off = app.isOn('no-shift-strip') ? 'off' : 'on';
    // Each row's pair of arrows, with one label under the pair.
    for (const [a, b, name] of [[0, 1, 'loop arrows'], [2, 3, 'jump arrows']]) {
      const els = [ctx.parts()[a], ctx.parts()[b]];
      if (!els[0] || !els[1]) continue;
      const live = els.map((e) => e.getBoundingClientRect());
      const was = [other[a], other[b]];
      const moved = live.map((r, i) => d.ghost(was[i], r, { label: false }));
      if (!moved.some(Boolean)) continue;
      const most = Math.max(...live.map((r, i) => Math.max(Math.abs(r.x - was[i].x), Math.abs(r.right - was[i].right))));
      const bottom = Math.max(live[0].bottom, live[1].bottom);
      d.text((live[0].left + live[1].right) / 2, bottom + 14, `${off}: ${name} move ${Math.round(most * 10) / 10}px`, { anchor: 'middle' });
    }
  },
};
