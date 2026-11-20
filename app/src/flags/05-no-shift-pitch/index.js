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
// its fader: build list D8). Key lock is always 44px, level with Cue and
// Play. While Slip is on for either deck, both decks' pitch columns gain a
// 24px row for it between the nudge and Key lock (empty on the deck without
// Slip), so the decks mirror and nothing changes size when you toggle Slip
// on the second deck. The engine has one Slip state per deck, set by the
// Settings checkbox or its key, so turning it on from both-off (either way)
// does take 32px from both faders. Deck.svelte draws the empty row
// (.slip-room) on the other deck.
export default {
  id: 'no-shift-pitch',
  n: 5,
  title: 'Tempo readout and pitch fader keep still',
  group: 'Stability',
  notes: 'The tempo % keeps one box (its range line reserved under it). Key lock stays 44px; while Slip is on for either deck, both decks get a 24px Slip row above Key lock, so they mirror.',
};

/** Show me: widens deck A's pitch range and turns Slip on; flipping shows the pitch column shifting and Key lock shrinking (before) and both decks keeping one shape (after). */
export const show = {
  about: 'Changing the pitch range or turning Slip on moved the tempo readout and squeezed Key lock into a small pill. Now the readout stays put, Key lock keeps its full size, and the two decks keep the same shape.',
  before: 'Switch the pitch range to ±16 and turn Slip on: the tempo % hops up, Key lock shrinks to a thin pill under Slip, and only this deck\'s fader gets shorter, so the two decks no longer mirror.',
  after: 'The readout keeps its place and Key lock stays a full-size button level with Cue and Play. Slip gets its own row on both decks at once (empty on the other deck), so the decks still mirror.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    const D = "[data-region='deck0'] .pitch";
    for (let i = 0; i < 4 && !/plus or minus 8 percent/.test(app.$(`${D} .val`).getAttribute('aria-label')); i++) await app.click(`${D} .val`);
    if (app.$(`${D} .lock:not(.kl)`)) await app.key('KeyA', { target: document.body });
    await app.wait(80);
    ctx.parts = () => [app.$(`${D} .val`), app.$(`${D} .kl`), app.$("[data-region='deck0'] .pitch-fader .fader"), app.$("[data-region='deck1'] .pitch-fader .fader")];
    ctx.rest = app.both('no-shift-pitch', ctx.parts());
    await app.click(`${D} .val`);
    await app.key('KeyA', { target: document.body });
    await app.until(() => app.$(`${D} .lock:not(.kl)`), 1500, 'Slip to turn on');
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch"), app.$("[data-region='deck1'] .pitch")],
  badge: (app) => app.$("[data-region='deck0'] .pitch")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    const [val, kl, fa, fb] = ctx.parts().map((e) => e?.getBoundingClientRect());
    if (!val || !kl || !fa || !fb) return;
    const said = [];
    const ghost = (r) => d.box(r, { c: d.C.ghost, dash: '4 3', w: 1.25 });
    if (Math.abs(val.top - rest[0].top) > 0.5) (ghost(rest[0]), said.push('tempo % hopped up'));
    if (kl.height < 40) said.push(`Key lock shrank to ${Math.round(kl.height)}px`);
    if (Math.abs(fa.height - fb.height) > 0.5) said.push('the decks no longer mirror');
    const modes = app.$("[data-region='deck0'] .modes")?.getBoundingClientRect();
    const y = modes ? modes.bottom + 18 : fa.y + fa.height * 0.62;
    if (said.length) d.text(fa.x - 14, y, said.join(', '), { anchor: 'end', tone: 'bad', free: true });
    else d.text(fa.x - 14, y, 'readout stays put, Key lock full size, decks mirror', { anchor: 'end', tone: 'ok', free: true });
  },
};
