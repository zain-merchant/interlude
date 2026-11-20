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
// App.svelte). "In the toolbar" (owner's call 7) docks it between the
// search field and Sampler, over the track count, when it fits; at the
// smallest window a load message is wider than that gap (about 110px of
// room for a 275px message), so it falls back to the corner, which is why
// the corner stays the recommended pick.
export default {
  id: 'declutter-toast',
  n: 13,
  title: 'Load messages stay on one line and off the titles',
  group: 'Stability',
  notes: 'Toasts size to their text (one line up to the window width) and, by default, sit bottom right, flush with the track list\'s corner, instead of over the library\'s titles. Hovering a toast holds it until the pointer leaves.',
  settings: {
    place: {
      type: 'choice',
      label: 'Place',
      options: [
        ['corner', 'Bottom right', "Sits on the list's bottom-right corner, over Time and Folder, the columns you read least."],
        ['toolbar', 'In the toolbar', 'Takes the track count\'s place beside the search field, so it never covers a row; when a message is too long for that gap (often, on a small window) it uses the corner.'],
        ['centre', 'Bottom centre', "Where it was: over the middle of the list, on the titles you're browsing."],
      ],
      default: 'corner',
    },
  },
};

/** Show me: loads a long title so the toast is wide; flipping shows it over the track titles (before) and tucked in the corner (after). */
export const show = {
  about: 'After every load, the "Loaded … Undo" message sat over the track titles you were browsing, and long titles made it wrap. Now it stays on one line, tucked into the list\'s bottom-right corner, and it waits while your pointer is on it.',
  before: 'Load a track and its message pops up in the middle of the library, on top of the titles you are reading to pick the next track, and stays there for six seconds.',
  after: 'The message sits in the list\'s bottom-right corner, lined up with its edge, over the Time and Folder columns you rarely read, on one line, so the titles stay in view. Point at it and it stays until you move away, so you have time to press Undo.',
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
