// #13: the toast wrapped and sat on the rows being browsed.
//
// Toasts ("Loaded … on deck B" with Undo, errors, "Recording saved") are
// pinned at left: 50% with a centring transform, which gives them only half
// the window before they wrap: a long title made a two- or three-line block
// at the smallest window. And they sit at the bottom centre, over the
// library's titles, right where the DJ is picking the next track, for
// several seconds after every load. The toast now keeps to one line where
// the window allows, and can sit in the bottom-right corner, over the
// library's least-read columns (Time, Folder).
export default {
  id: 'declutter-toast',
  n: 13,
  title: 'Toasts stay on one line and off the titles',
  group: 'Stability',
  notes: 'Toasts size to their text (one line up to the window width) and, by default, sit bottom right instead of over the library\'s titles.',
  settings: {
    place: {
      type: 'choice',
      label: 'Place',
      options: [
        ['corner', 'Bottom right'],
        ['centre', 'Bottom centre'],
      ],
      default: 'corner',
    },
  },
};

/** Show me: loads the longest title in view so the toast is wide, and ghosts where it sits with the flag off. */
export const show = {
  note: 'The longest title loaded, so the toast is wide; dashed is where it sits with the flag off, over the titles.',
  async setup(app, ctx) {
    await show.replay(app, ctx);
  },
  async replay(app, ctx) {
    const rows = app.rows().filter((r) => !r.textContent.includes(', on deck'));
    const longest = rows.reduce((a, r) => ((r.querySelector('.t')?.textContent.length ?? 0) > (a?.querySelector('.t')?.textContent.length ?? 0) ? r : a), null);
    await app.loadTrack(0, app.rows().indexOf(longest));
    const toast = await app.until(() => app.$('.toastbox .toast'), 2000, 'the toast');
    await app.wait(400);
    ctx.b = app.both('declutter-toast', [toast]);
  },
  target: '.toastbox .toast',
  aid(d, app, ctx) {
    const t = app.$('.toastbox .toast');
    if (!t || !ctx.b) return;
    const other = app.other('declutter-toast', ctx.b)[0];
    const r = t.getBoundingClientRect();
    // Just the outline and a word: it moves and resizes, so no distances.
    d.box(other, { c: d.C.ghost, dash: '4 3', w: 1.25 });
    d.text(other.x, other.y - 13, app.isOn('declutter-toast') ? 'flag off' : 'flag on');
    d.protect(r);
  },
};
