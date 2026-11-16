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

/** Show me: shrinks deck A's loop from 4 beats to 1/4 and ghosts the arrows beside it. */
export const show = {
  note: "Deck A's Loop tab is open and its size went from 4 beats to 1/4 (the beat-jump size in the transport follows it). Dashed blue is where the loop's and the beat jump's ‹ › were at 4; green held still, red moved. Turn the flag off and on. Hot cue times (Cues tab) and the effect name (FX tab) get the same fixed slots.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    const D = "[data-region='deck0']";
    const size = () => {
      const s = app.$(`${D} .perf .big b`)?.textContent.trim() ?? '4';
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : a;
    };
    // Back to 4 beats.
    for (let i = 0; i < 10 && size() !== 4; i++) await app.click(`${D} button[aria-label='${size() < 4 ? 'Double loop' : 'Halve loop'}']`);
    ctx.parts = () => [...app.$$(`${D} .perf .tb.ar`), app.$(`${D} .perf .big`), ...app.$$(`${D} .transport .jumps button`)];
    ctx.names = ['loop ‹', 'loop ›', 'loop size', 'jump ‹', 'jump ›'];
    ctx.rest = app.snap(ctx.parts());
    for (let i = 0; i < 4; i++) await app.click(`${D} button[aria-label='Halve loop']`);
  },
  target: (app) => [app.$("[data-region='deck0'] .perf"), app.$("[data-region='deck0'] .transport .jumps")],
  aid(d, app, ctx) {
    ctx.parts().forEach((el, i) => el && d.ghost(ctx.rest[i], el.getBoundingClientRect(), { label: ctx.names[i], below: i % 2 === 1 }));
  },
};
