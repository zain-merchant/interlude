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

/** The box of `word`'s own letters inside el (no spaces, no arrow). */
function wordRect(el, word) {
  if (!el) return null;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode;
    const i = n.textContent.indexOf(word);
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + word.length);
    return r.getBoundingClientRect();
  }
  return null;
}

/** Show me: sorts the library by BPM; flipping shows the heading jumping left (before) and staying over its numbers (after). */
export const show = {
  about: "Sorting by BPM or Time pushed the column's heading sideways to make room for the arrow. Now the heading stays over its numbers.",
  before: 'Click "BPM" to sort by it: an arrow appears after the word and shoves it to the left, off its column, and back when you sort by something else.',
  after: 'The arrow goes in front of the word instead, so "BPM" stays right above its numbers.',
  async setup(app, ctx) {
    const title = app.$("button.sort[aria-label^='Sort by title']");
    const bpm = () => app.$("button.sort[aria-label^='Sort by bpm']");
    // Sort by title first (the app's default), measure the word, then sort by BPM.
    for (let i = 0; i < 3 && !title.classList.contains('on'); i++) await app.click(title);
    ctx.word = () => wordRect(bpm(), 'BPM');
    // The word's own box, not the whole button.
    const was = app.isOn('no-shift-sort');
    const at = (on) => (app.setFlag('no-shift-sort', on), DOMRect.fromRect(ctx.word()));
    ctx.rest = { on: at(true), off: at(false) };
    app.setFlag('no-shift-sort', was);
    await app.click(bpm());
  },
  async replay(app) {
    await app.click("button.sort[aria-label^='Sort by title']");
    await app.wait(500);
    await app.click("button.sort[aria-label^='Sort by bpm']");
  },
  target: "button.sort[aria-label^='Sort by bpm']",
  badge: (app) => app.$("button.sort[aria-label^='Sort by bpm']")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    d.moved(rest, ctx.word(), { what: '"BPM"', side: 'left', still: '"BPM" stays over its column' });
  },
};
