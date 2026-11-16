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

/** Show me: loads the longest title in view so the toast is wide, and ghosts where it would sit with the flag off. */
export const show = {
  note: 'Loaded the longest title in view onto deck A, so the "Loaded … on deck A" toast is up. Dashed blue is where it sits with the flag off: at most half the window wide (long titles wrap) and over the library\'s titles. On, it sizes to its text and, with "Bottom right" under More, sits over the Time and Folder columns instead.',
  async setup(app, ctx) {
    await show.replay(app, ctx);
  },
  async replay(app, ctx) {
    const rows = app.rows().filter((r) => !r.textContent.includes(', on deck'));
    const longest = rows.reduce((a, r) => ((r.querySelector('.t')?.textContent.length ?? 0) > (a?.querySelector('.t')?.textContent.length ?? 0) ? r : a), null);
    await app.loadTrack(0, app.rows().indexOf(longest));
    const toast = await app.until(() => app.$('.toastbox .toast'), 2000, 'the toast');
    ctx.off = app.rectsWithout('declutter-toast', [toast])[0];
  },
  target: '.toastbox .toast',
  aid(d, app, ctx) {
    const t = app.$('.toastbox .toast');
    if (!t) return;
    d.box(ctx.off, { c: d.C.ghost, dash: '3 3', label: 'flag off' });
    const r = t.getBoundingClientRect();
    d.text(r.x, r.y - 9, app.isOn('declutter-toast') ? 'flag on' : 'flag off');
    const title = app.$("button.sort[aria-label^='Sort by title']")?.getBoundingClientRect();
    if (title) d.box(new DOMRect(title.x, title.y, title.width, (app.$("[data-region='tracks']")?.getBoundingClientRect().bottom ?? title.bottom) - title.y), { c: d.C.aid, dash: '1 4', label: 'titles column' });
  },
};
