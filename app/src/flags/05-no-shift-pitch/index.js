// #5: the pitch column moved as the tempo changed.
//
// - The tempo readout over the pitch fader is centred, so it widened both
//   ways as it grew (+0.00% → −15.37%), and when the fader range changed
//   from ±8 a second line (±16) appeared under it, which lifted the
//   readout 7px.
// - Turning slip on added a row to the pitch column: the fader lost 32px
//   of travel and its cap jumped, and the nudge buttons moved down.
// The readout now keeps a box exactly as wide as "−00.00%" (3.9em),
// centred on the fader's column, with the number right-aligned in it and
// the range line reserved (a wider right-aligned box sat the % 7-8px off
// its fader: build list D8), and slip shares the key lock's row, so the
// fader never changes length.
export default {
  id: 'no-shift-pitch',
  n: 5,
  title: 'Tempo readout and pitch fader keep still',
  group: 'Stability',
  notes: 'The tempo % keeps one box (its range line reserved under it), and Slip shares Key lock\'s row instead of taking 32px of fader travel.',
};

/** Show me: widens deck A's pitch range and turns Slip on; flipping shows the pitch column shifting (before) and holding (after). */
export const show = {
  about: 'Changing the pitch range or turning Slip on shifted the tempo readout and shortened the pitch fader. Now the column keeps its shape.',
  before: 'Switch the pitch range to ±16 and turn Slip on: the tempo % hops up, the fader loses a chunk of its length and the nudge arrows drop, so nothing is quite where your hand left it.',
  after: "The readout keeps its place, Slip shares Key lock's row, and the fader stays full length, so nothing under your hand moves.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const D = "[data-region='deck0'] .pitch";
    // Back to ±8 and no slip, measured, then to ±16 and slip.
    for (let i = 0; i < 4 && !/plus or minus 8 percent/.test(app.$(`${D} .val`).getAttribute('aria-label')); i++) await app.click(`${D} .val`);
    if (app.$(`${D} .lock:not(.kl)`)) await app.key('KeyA', { target: document.body });
    await app.wait(80);
    ctx.parts = () => [app.$(`${D} .val`), app.$(`${D} .pitch-fader .fader`), app.$(`${D} .nudge`)];
    ctx.rest = app.both('no-shift-pitch', ctx.parts());
    await app.click(`${D} .val`);
    await app.key('KeyA', { target: document.body });
    await app.until(() => app.$(`${D} .lock:not(.kl)`), 1500, 'Slip to turn on');
  },
  target: "[data-region='deck0'] .pitch",
  badge: (app) => app.$("[data-region='deck0'] .pitch")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    const [val, fader, nudge] = ctx.parts().map((e) => e?.getBoundingClientRect());
    if (!val || !fader || !nudge) return;
    const said = [];
    const ghost = (r) => d.box(r, { c: d.C.ghost, dash: '4 3', w: 1.25 });
    // The readout's number: its top (it grows a line under it, and lifts).
    if (Math.abs(val.top - rest[0].top) > 0.5 || Math.abs(val.height - rest[0].height) > 0.5) (ghost(rest[0]), said.push('tempo % hopped up'));
    if (Math.abs(fader.height - rest[1].height) > 0.5) (ghost(rest[1]), said.push(`fader got ${Math.round(Math.abs(fader.height - rest[1].height))}px shorter`));
    if (Math.abs(nudge.top - rest[2].top) > 0.5) (ghost(rest[2]), said.push(`nudge arrows dropped ${Math.round(Math.abs(nudge.top - rest[2].top))}px`));
    // In the gap under the deck's tabs, clear of the controls.
    const modes = app.$("[data-region='deck0'] .modes")?.getBoundingClientRect();
    const y = modes ? modes.bottom + 18 : fader.y + fader.height * 0.62;
    if (said.length) d.text(fader.x - 14, y, said.join(', '), { anchor: 'end', tone: 'bad', free: true });
    else d.text(fader.x - 14, y, 'readout, fader and nudge stay put', { anchor: 'end', tone: 'ok', free: true });
  },
};
