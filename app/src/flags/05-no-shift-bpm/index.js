// #5: typing a BPM moved the deck.
//
// Double-clicking the BPM swaps it for a text field to type the tempo in.
// The field was 4.2em wide and taller than the number's line, so the BPM
// block grew 42px wider (the title lost that much) and 11px taller, which
// pushed the key line, the overview, the times, the mode row and the
// transport down by 11px until the edit ended. The field now takes the
// number's exact box.
export default {
  id: 'no-shift-bpm',
  n: 5,
  title: 'Typing a BPM keeps the deck still',
  group: 'Stability',
  notes: 'The BPM field opened by double-click has the same box as the number it replaces, so the deck below no longer drops 11px.',
};

/** Show me: opens deck A's BPM field and ghosts where the deck's rows stood. */
export const show = {
  note: "Deck A's BPM is open for typing (double-click it to open, Esc to close). Dashed blue is where the title, the overview, the times, the tabs and the transport stood before; green held still, red moved. Turn the flag off and on: off, the field is 42px wider and 11px taller and the deck drops.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const D = "[data-region='deck0']";
    ctx.parts = () => [app.$(`${D} .title`), app.$(`${D} .bpm`), app.$(`${D} .overview`), app.$(`${D} .times`), app.$(`${D} .modes`), app.$(`${D} .transport`)];
    ctx.names = ['title', 'BPM', 'overview', 'times', 'tabs', 'transport'];
    ctx.rest = app.snap(ctx.parts());
    await app.dblclick(`${D} .bpm .big`);
    await app.until(() => app.$(`${D} .bpm input, ${D} .bpm .edit`), 1500, 'the BPM field');
  },
  target: "[data-region='deck0'] .bpm",
  async replay(app, ctx) {
    const D = "[data-region='deck0']";
    await app.key('Escape', { target: app.$(`${D} .bpm input`) ?? document.body });
    await app.wait(500);
    await app.dblclick(`${D} .bpm .big`);
  },
  aid(d, app, ctx) {
    ctx.parts().forEach((el, i) => el && d.ghost(ctx.rest[i], el.getBoundingClientRect(), { label: ctx.names[i], below: i === 1 }));
  },
};
