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

/** Show me: opens deck A's BPM field and ghosts where things would be with the flag off. */
export const show = {
  note: "Deck A's BPM field is open; dashed is where it and the rows below would be with the flag off. Flipping the flag closes the field: press Replay.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const D = "[data-region='deck0']";
    await app.dblclick(`${D} .bpm .big`);
    await app.until(() => app.$(`${D} .bpm input, ${D} .bpm .edit`), 1500, 'the BPM field');
    ctx.parts = () => [app.$(`${D} .bpm`), app.$(`${D} .overview`)];
    ctx.names = ['BPM', 'rows below'];
    ctx.b = app.both('no-shift-bpm', ctx.parts());
  },
  target: "[data-region='deck0'] .bpm",
  async replay(app, ctx) {
    const D = "[data-region='deck0']";
    await app.key('Escape', { target: app.$(`${D} .bpm input`) ?? document.body });
    await app.wait(500);
    await app.dblclick(`${D} .bpm .big`);
    await app.until(() => app.$(`${D} .bpm input, ${D} .bpm .edit`), 1500, 'the BPM field');
    ctx.b = app.both('no-shift-bpm', ctx.parts());
  },
  aid(d, app, ctx) {
    // Only while the field is open: the ghosts are of that state.
    if (!app.$("[data-region='deck0'] .bpm input, [data-region='deck0'] .bpm .edit")) return;
    const other = app.other('no-shift-bpm', ctx.b);
    const off = app.isOn('no-shift-bpm') ? 'off:' : 'on:';
    ctx.parts().forEach((el, i) => el && d.ghost(other[i], el.getBoundingClientRect(), { label: `${off} ${ctx.names[i]}`, side: i ? 'below' : 'above' }));
  },
};
