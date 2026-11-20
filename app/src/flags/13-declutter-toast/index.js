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
//
// Later (critique panel, Li2): the corner toast ran 4px past the list's
// right edge (right: 24px against a 28px list inset); it now sits flush
// with the list's corner. Hovering it holds it (C20): the timer stops while
// the pointer is on it and resumes when it leaves (lib/undo.svelte.js,
// App.svelte). Owner's call 7, (b) by default: it docks in the library's
// toolbar, between the search field and Sampler, over the track count, so it
// never covers a row (the corner sat over Key and Time). At the smallest
// window that gap is about 250px for a 275px message, so a long message is
// cut short with an ellipsis and Undo stays whole (screen readers still
// hear it in full); only under 160px of room does it use the corner.
export default {
  id: 'declutter-toast',
  n: 13,
  title: 'Load messages stay on one line and off the titles',
  group: 'Stability',
  notes: 'Toasts size to their text (one line) and, by default, dock in the library toolbar over the track count, never over rows (or bottom right, flush with the list\'s corner). Hovering a toast holds it until the pointer leaves.',
  settings: {
    place: {
      type: 'choice',
      label: 'Place',
      options: [
        ['toolbar', 'In the toolbar', "Takes the track count's place beside the search field, so it never covers a row; on a small window a long title is cut short, with Undo always whole."],
        ['corner', 'Bottom right', "Sits on the list's bottom-right corner: the whole message always shows, but it covers the ends of the last rows (Key, Time, Folder) for a few seconds."],
        ['centre', 'Bottom centre', "Where it was: over the middle of the list, on the titles you're browsing."],
      ],
      default: 'toolbar',
    },
  },
};

/** Show me: loads a long title so the toast is wide; flipping shows it over the track titles (before) and tucked in the corner (after). */
export const show = {
  about: 'After every load, the "Loaded … Undo" message sat over the track titles you were browsing, and long titles made it wrap. Now it sits on one line in the library\'s toolbar, beside the search field, where it never covers a track, and it waits while your pointer is on it.',
  before: 'Load a track and its message pops up in the middle of the library, on top of the titles you are reading to pick the next track, and stays there for six seconds.',
  after: 'The message sits in the toolbar beside the search field, in place of the track count, on one line, so every row stays in view. Point at it and it stays until you move away, so you have time to press Undo.',
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
    d.text(t.right, t.y - 19, before ? 'covers the track list' : (app.$('.toastbox .toast[data-docked]') ? 'in the toolbar, clear of every row' : 'out of the way, in the corner'), { anchor: 'end', tone: before ? 'bad' : 'ok' });
  },
};
