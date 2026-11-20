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
  title: 'Load messages stay on one line and off the titles',
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

/** Show me: loads a long title so the toast is wide; flipping shows it over the track titles (before) and tucked in the corner (after). */
export const show = {
  about: 'After every load, the "Loaded … Undo" message sat over the track titles you were browsing, and long titles made it wrap. Now it stays on one line in the bottom-right corner.',
  before: 'Load a track and its message pops up in the middle of the library, on top of the titles you are reading to pick the next track, and stays there for six seconds.',
  after: 'The message sits in the bottom-right corner, over the Time and Folder columns you rarely read, on one line, so the titles stay in view.',
  period: 2200,
  async setup(app, ctx) {
    // The two longest titles in view, loaded in turn, so each flip brings a fresh toast.
    const rows = app.rows().filter((r) => !r.textContent.includes(', on deck'));
    const len = (r) => r.querySelector('.t')?.textContent.trim().length ?? 0;
    ctx.titles = [...rows].sort((a, b) => len(b) - len(a)).slice(0, 2).map((r) => r.querySelector('.t').textContent.trim());
    ctx.turn = 0;
    await show.each(app, ctx);
  },
  async each(app, ctx) {
    const t = ctx.titles[ctx.turn++ % ctx.titles.length];
    await app.loadTrack(0, t);
    await app.clearSearch();
    await app.until(() => app.$('.toastbox .toast'), 2000, 'the toast');
    await app.wait(250);
  },
  target: '.toastbox .toast',
  badge: (app) => app.$('.toastbox .toast')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const t = app.$('.toastbox .toast')?.getBoundingClientRect();
    if (!t) return;
    const before = ctx.phase === 'before';
    d.protect(t);
    d.text(t.right, t.y - 19, before ? 'covers the track list' : 'out of the way, in the corner', { anchor: 'end', tone: before ? 'bad' : 'ok' });
  },
};
