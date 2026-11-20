// #90: library polish from the critique's backlog (addendum part 2).
//
// - a-K51 / c-K50: "+ Add music folder" and "+ New playlist" were rows with
//   a typed "+", a step dimmer than the items above, so they read as notes
//   rather than actions. The plus is now a drawn 12px icon at --fg-3; the
//   label is --fg-2 like the items (recommended, a-K51) or stays --fg-3
//   (c-K50), a choice below.
// - c-K83: nothing on screen said how to load the selected track. Its
//   tooltip now says "Double-click to load, or ⇧← / ⇧→".
// Looked at and left alone, per the checkers: a-K64 (the count repeats the
// sidebar's 48, but it follows the search), c-K69 (count position), d-K63
// (search ring vs count gap), e-K73 (the separator before Delete is the
// macOS convention), c-K54 (selection fill strength: #4's choice). e-K68
// ("Add to playlist ▸" submenu) needs submenus in menu.svelte.js, not done.
// Done in other library flags: c-K32 (#80, BPM at full strength), c-K36
// (#86, the empty playlist names the track menu too).
// Hooks: Library.svelte (the .add buttons' plus, the row tooltip).
export default {
  id: 'library-polish',
  n: 90,
  title: 'Library details',
  group: 'Polish',
  notes: 'Sidebar add actions get a drawn plus (label --fg-2 or --fg-3, a choice); the selected row\'s tooltip says how to load it.',
  settings: {
    add: {
      type: 'choice',
      label: 'Add actions',
      default: 'action',
      options: [
        ['action', 'Like the items', 'The label is as bright as the folders and playlists above it, with a quieter plus, so it reads as something you can click.'],
        ['quiet', 'Quieter', 'The label stays a step dimmer than the items, so the lists stand out and the actions sit back until you look for them.'],
      ],
    },
  },
};

/** Show me: a loupe on the sidebar's add actions, flipping typed plus and drawn plus. */
export const show = {
  about: '"+ Add music folder" and "+ New playlist" were dim text with a typed plus, easy to read as a note rather than a button. Now the plus is a proper icon and the label is as clear as the items above. The selected track\'s tooltip also says how to load it.',
  before: 'The add actions are dimmer than everything around them, with a "+" typed in front, so they read like captions.',
  after: 'A drawn plus and a label as bright as the folders above: clearly something you can click.',
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
    d.text(l.rect.x, l.rect.bottom + 16, before ? 'dim, with a typed "+"' : 'a drawn plus, a clear label', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
