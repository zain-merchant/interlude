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

/** Show me: deck A's BPM field open; flipping shows the deck dropping (before) and staying put (after). */
export const show = {
  about: 'Typing a new tempo made the whole deck jump down. Now nothing moves while you type.',
  before: 'Double-click the BPM to type a tempo: the box grows, and the waveform and everything under it drop down until you finish.',
  after: "The box is exactly the number's size, so the deck stays where it was while you type.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const D = "[data-region='deck0']";
    ctx.parts = () => [app.$(`${D} .bpm`), app.$(`${D} .overview`)];
    // Where they sit before you start typing.
    ctx.rest = app.snap(ctx.parts());
    await show.each(app, ctx);
  },
  // Flipping the flag can close the field: open it again each time.
  async each(app, ctx) {
    void ctx;
    const D = "[data-region='deck0']";
    if (app.$(`${D} .bpm input, ${D} .bpm .edit`)) return;
    await app.dblclick(`${D} .bpm .big`);
    await app.until(() => app.$(`${D} .bpm input, ${D} .bpm .edit`), 1500, 'the BPM field');
  },
  target: "[data-region='deck0'] .bpm",
  badge: (app) => app.$("[data-region='deck0'] .bpm")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    if (!app.$("[data-region='deck0'] .bpm input, [data-region='deck0'] .bpm .edit")) return;
    const [bpm, wave] = ctx.parts().map((e) => e?.getBoundingClientRect());
    d.moved(ctx.rest[1], wave, { what: 'waveform and everything below', side: 'below', still: 'waveform and everything below stay put' });
    d.moved(ctx.rest[0], bpm, { what: 'tempo box', side: 'left', quiet: true });
  },
};
