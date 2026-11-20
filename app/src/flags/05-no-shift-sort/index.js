// #5: sorting a number column moved its heading.
//
// The BPM and Time headings are right-aligned over their numbers. Sorting
// by one added an arrow after the word, which pushed the word 14px left;
// sorting by another column moved it back. The arrow now goes before the
// word in those columns, so the word stays over its numbers.
export default {
  id: 'no-shift-sort',
  n: 5,
  title: 'Sorting keeps the BPM and Time headings in place',
  group: 'Stability',
  notes: 'In right-aligned columns the sort arrow sits to the left of the heading, so the heading no longer jumps 14px.',
};

/** Show me: sorts the library by BPM and ghosts where the heading's word would be with the flag off. */
export const show = {
  note: 'Sorted by BPM; dashed is where the word "BPM" would be with the flag off.',
  async setup(app, ctx) {
    const title = app.$("button.sort[aria-label^='Sort by title']");
    // Sort by title first (the app's default), then by BPM.
    for (let i = 0; i < 3 && !title.classList.contains('on'); i++) await app.click(title);
    await app.click("button.sort[aria-label^='Sort by bpm']");
    ctx.word = () => app.textRect(app.$("button.sort[aria-label^='Sort by bpm']"));
    ctx.b = { on: [ctx.word()], off: [app.without('no-shift-sort', () => ctx.word())] };
  },
  async replay(app) {
    await app.click("button.sort[aria-label^='Sort by title']");
    await app.wait(500);
    await app.click("button.sort[aria-label^='Sort by bpm']");
  },
  target: "button.sort[aria-label^='Sort by bpm']",
  aid(d, app, ctx) {
    d.ghost(app.other('no-shift-sort', ctx.b)[0], ctx.word(), { label: app.isOn('no-shift-sort') ? 'off:' : 'on:', side: 'below' });
  },
};
