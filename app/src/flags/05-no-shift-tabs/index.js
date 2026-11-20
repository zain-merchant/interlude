// #5: a deck's mode tab moved its label when its dot came on.
//
// When a loop, an effect or a muted stem is on, its tab (Loop, FX, Stems)
// shows a small dot after the label. The dot added 10px to the centred
// label, so the word slid 5px left as the loop started and back when it
// ended. The dot now hangs after the word without taking any room.
export default {
  id: 'no-shift-tabs',
  n: 5,
  title: 'Mode tabs keep still when their dot lights',
  group: 'Stability',
  notes: 'Loop / FX / Stems labels no longer slide 5px when a loop, effect or muted stem turns their dot on.',
};

/** Show me: starts a loop on deck A, which lights the Loop tab's dot, and ghosts the word with the flag off. */
export const show = {
  note: "A loop lit the Loop tab's dot; dashed is where the word would be with the flag off.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const loopTab = () => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop'));
    if (!loopTab().querySelector('i')) await app.key('KeyR', { target: document.body });
    await app.until(() => loopTab().querySelector('i'), 1500, 'the loop dot');
    ctx.word = () => app.textRect(loopTab());
    ctx.b = { on: [ctx.word()], off: [app.without('no-shift-tabs', () => ctx.word())] };
  },
  async replay(app) {
    await app.key('KeyR', { target: document.body });
    await app.wait(500);
    await app.key('KeyR', { target: document.body });
  },
  target: (app) => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop')),
  aid(d, app, ctx) {
    d.ghost(app.other('no-shift-tabs', ctx.b)[0], ctx.word(), { label: app.isOn('no-shift-tabs') ? 'off:' : 'on:', side: 'below' });
  },
};
