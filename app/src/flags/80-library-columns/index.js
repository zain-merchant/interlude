// #80 (Li3, C33; backlog c-K32): the track list's columns were spread badly.
//
// Title and Artist were fractions of the width (2.4fr and 1.6fr), so on a
// wide window a short title sat 300px from its BPM and the numbers were
// packed together at the far right. Title now stops growing at 360px and
// Artist at 240px (each still shrinks with the window as before), the
// numbers get 24px between them, and Folder takes whatever is left. BPM is
// drawn at full strength, since it's what you sort and pick by; Key stays
// grey because #18 lifts the keys that mix to full strength.
// Library.svelte columns at :866; #15 (spacing) sets the same property with
// its 24px marker column, which this keeps when both are on.
export default {
  id: 'library-columns',
  n: 80,
  title: 'Track list columns sized to what they hold',
  group: 'Layout',
  notes: 'Title caps at 360px and Artist at 240px (proportional below that), BPM, Key and Time get 24px between them, Folder takes the rest. BPM is --fg. Columns use % so no fr appears inside min().',
};

/** Show me: the list at full width; guides at each column's start, flipping. */
export const show = {
  about: 'On a wide window, short titles sat far from their BPM and key, with the numbers squeezed together at the right edge. Now the title and artist columns stop at a sensible width and the numbers get room.',
  before: 'Your eye has to jump across a wide empty gap from a track\'s title to its BPM, while BPM, key and length are crammed together.',
  after: 'Title and artist sit close to the numbers, the numbers have even space between them, and the folder takes the spare room on the right. BPM is brighter, since it\'s what you pick by.',
  async setup(app) {
    await app.clearSearch();
  },
  target: "[data-region='tracks']",
  badge: (app) => app.$('section.library .head')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const head = app.$('section.library .head')?.getBoundingClientRect();
    const list = app.$("[data-region='tracks']")?.getBoundingClientRect();
    if (!head || !list) return;
    // The second visible row: from the title to the numbers.
    const row = app.rows().find((r) => r.getBoundingClientRect().top > list.top + 20);
    if (!row) return;
    const cells = [...row.children];
    const title = app.textRect(cells[1]);
    const bpm = app.textRect(cells[3]);
    const key = app.textRect(cells[4]);
    if (title && bpm) d.measure(title.left, title.bottom + 10, bpm.left - 2, title.bottom + 10, { label: `${Math.round(bpm.left - title.left)}px from the title to its BPM`, side: 'below', tone: before ? 'bad' : 'ok' });
    if (bpm && key) d.measure(bpm.right, bpm.top - 6, key.left, bpm.top - 6, { side: 'above' });
  },
};
