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

/** Show me: starts a loop on deck A, which lights the Loop tab's dot, and ghosts the tab's word. */
export const show = {
  note: "A loop is running on deck A, so its Loop tab shows a dot. Dashed blue is where the word \"Loop\" sat before the dot came on; green held still, red moved. Turn the flag off and on: off, the word slides 5px left. Replay turns the loop off and on.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const loopTab = () => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop'));
    ctx.word = () => app.textRect(loopTab());
    if (loopTab().querySelector('i')) await app.key('KeyR', { target: document.body });
    await app.wait(80);
    ctx.rest = ctx.word();
    await app.key('KeyR', { target: document.body });
    await app.until(() => loopTab().querySelector('i'), 1500, 'the loop dot');
    ctx.tab = loopTab;
  },
  async replay(app) {
    await app.key('KeyR', { target: document.body });
    await app.wait(500);
    await app.key('KeyR', { target: document.body });
  },
  target: (app) => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop')),
  aid(d, app, ctx) {
    d.ghost(ctx.rest, ctx.word(), { label: 'Loop', below: true });
  },
};
