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

/** Show me: sorts the library by BPM and ghosts where the heading's word stood. */
export const show = {
  note: 'The library is now sorted by BPM. Dashed blue is where the word "BPM" stood before; green held still, red moved. Turn the flag off and on: off, the arrow pushes the word 14px left. Click Time to try the other right-aligned column.',
  async setup(app, ctx) {
    const title = app.$("button.sort[aria-label^='Sort by title']");
    // Sort by title first (the app's default), so BPM starts unsorted.
    for (let i = 0; i < 3 && !title.classList.contains('on'); i++) await app.click(title);
    ctx.word = () => app.textRect(app.$("button.sort[aria-label^='Sort by bpm']"));
    ctx.rest = ctx.word();
    await app.click("button.sort[aria-label^='Sort by bpm']");
  },
  async replay(app) {
    await app.click("button.sort[aria-label^='Sort by title']");
    await app.wait(500);
    await app.click("button.sort[aria-label^='Sort by bpm']");
  },
  target: "button.sort[aria-label^='Sort by bpm']",
  aid(d, app, ctx) {
    d.ghost(ctx.rest, ctx.word(), { label: 'BPM heading', below: true });
  },
};
