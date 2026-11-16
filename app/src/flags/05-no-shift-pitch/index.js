// #5: the pitch column moved as the tempo changed.
//
// - The tempo readout over the pitch fader is centred, so it widened both
//   ways as it grew (+0.00% → −15.37%), and when the fader range changed
//   from ±8 a second line (±16) appeared under it, which lifted the
//   readout 7px.
// - Turning slip on added a row to the pitch column: the fader lost 32px
//   of travel and its cap jumped, and the nudge buttons moved down.
// The readout now keeps a box for "−00.00%" with the number right-aligned
// and the range line reserved, and slip shares the key lock's row, so the
// fader never changes length.
export default {
  id: 'no-shift-pitch',
  n: 5,
  title: 'Tempo readout and pitch fader keep still',
  group: 'Stability',
  notes: 'The tempo % keeps one box (its range line reserved under it), and Slip shares Key lock\'s row instead of taking 32px of fader travel.',
};

/** Show me: widens deck A's pitch range and turns Slip on, with ghosts of the pitch column. */
export const show = {
  note: "Pitch range ±16 and Slip on: ghosts show the readout, fader and nudge held still (Slip shares Key lock's row). Toggle: off, the readout lifts and the fader loses 32px.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const D = "[data-region='deck0'] .pitch";
    ctx.parts = () => [app.$(`${D} .val`), app.$(`${D} .pitch-fader .fader`), app.$(`${D} .nudge`), app.$(`${D} .kl`)];
    ctx.names = ['tempo readout', 'pitch fader', 'nudge', 'Key lock'];
    // Back to ±8 and no slip, then measure.
    for (let i = 0; i < 4 && !/plus or minus 8 percent/.test(app.$(`${D} .val`).getAttribute('aria-label')); i++) await app.click(`${D} .val`);
    if (app.$(`${D} .lock:not(.kl)`)) await app.key('KeyA', { target: document.body });
    await app.wait(80);
    ctx.rest = app.snap(ctx.parts());
    // Where they stand with the flag off, too: the ghost compares like with like.
    ctx.restOff = app.without('no-shift-pitch', () => app.snap(ctx.parts()));
    await app.click(`${D} .val`);
    await app.key('KeyA', { target: document.body });
    await app.until(() => app.$(`${D} .lock:not(.kl)`), 1500, 'Slip to turn on');
  },
  target: "[data-region='deck0'] .pitch",
  aid(d, app, ctx) {
    // Labels sit left of the column, each level with its part.
    const col = app.$("[data-region='deck0'] .pitch")?.getBoundingClientRect();
    ctx.parts().forEach((el, i) => {
      if (!el) return;
      const live = el.getBoundingClientRect();
      d.ghost((app.isOn('no-shift-pitch') ? ctx.rest : ctx.restOff)[i], live, { label: ctx.names[i], labelAt: { x: (col?.left ?? live.left) - 200, y: live.top + live.height / 2 } });
    });
  },
};
