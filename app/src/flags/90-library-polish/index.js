// #90: library polish from the critique's backlog (addendum part 2).
//
// - a-K51 / c-K50: "+ Add music folder" and "+ New playlist" were rows with
//   a typed "+", a step dimmer than the items above, so they read as notes
//   rather than actions. The plus is now a drawn 12px icon at --fg-3; the
//   label stays --fg-3, a step below the items (c-K50; the per-fix review
//   picked it over --fg-2, so a new playlist and "+ New playlist" read
//   clearly apart).
// - c-K83: nothing on screen said how to load the selected track. Its
//   tooltip now says "Double-click to load, or ⇧← / ⇧→".
// Looked at and left alone, per the checkers: a-K64 (the count repeats the
// sidebar's 48, but it follows the search), c-K69 (count position), d-K63
// (search ring vs count gap), e-K73 (the separator before Delete is the
// macOS convention), c-K54 (selection fill strength: #4's choice). e-K68
// ("Add to playlist ▸" submenu) needs submenus in menu.svelte.js, not done.
// Done in other library flags: c-K32 (#80, BPM at full strength). c-K36
// (the empty playlist names only dragging) was dropped by the per-fix
// review: #7's two short lines name dragging onto it in the sidebar.
// Hooks: Library.svelte (the .add buttons' plus, the row tooltip).
export default {
  id: 'library-polish',
  n: 90,
  title: 'Library details',
  group: 'Polish',
  notes: 'Sidebar add actions get a drawn 12px plus (label stays --fg-3); the selected row\'s tooltip says how to load it.',
};

/** Show me: a loupe on the sidebar's add actions, flipping typed plus and drawn plus. */
export const show = {
  about: '"+ Add music folder" and "+ New playlist" were dim text with a typed plus, easy to read as a note rather than a button. Now the plus is a proper icon, so they read as buttons, while staying a step quieter than your folders and playlists. The selected track\'s tooltip also says how to load it.',
  before: 'The add actions have a "+" typed in front, so they read like captions rather than buttons.',
  after: 'A drawn plus makes them buttons, and they stay a step quieter than the folders and playlists, so a new playlist and "+ New playlist" never look alike.',
  target: (app) => app.$$("[data-region='sidebar'] .add").slice(0, 2),
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const add = app.$("[data-region='sidebar'] .add")?.getBoundingClientRect();
    if (!add) return;
    const zoom = 3;
    const size = { w: (add.width + 16) * zoom, h: (add.height + 72) * zoom };
    const l = d.loupe('add', { x: add.x - 8, y: add.y - 52 }, { zoom, size, at: { x: add.right + 40, y: Math.max(8, add.top - size.h / 2) }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x, l.rect.bottom + 16, before ? 'a typed "+": reads as a caption' : 'a drawn plus: a button, a step below the items', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
