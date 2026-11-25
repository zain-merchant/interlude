// #85 (Li10, C55): music folders showed a count only while selected.
//
// All tracks, playlists and History days always show how many tracks they
// hold; a music folder showed its count only while you were in it, so the
// sidebar's numbers came and went as you clicked around. With the flag on
// every folder shows its count. The counts come from the All tracks load the
// library already does (tracks whose path is inside the folder), and are
// refreshed when you open a folder, so no backend change is needed. To ship
// it from the backend instead, libraryFolders() could return { path, count }.
// Hooks: Library.svelte (folderCounts, inFolder, the folder rows).
export default {
  id: 'folder-counts',
  n: 85,
  title: 'Every music folder shows its count',
  group: 'Polish',
  notes: 'Each sidebar folder shows its track count, counted from the All tracks load (and refreshed when the folder is opened). Was: only the selected folder.',
};

/** Show me: All tracks selected; flipping shows folders without counts (before) and with (after). */
export const show = {
  about: 'In the sidebar, All tracks and your playlists showed how many tracks they hold, but music folders only did while you were in them. Now every folder shows its count.',
  before: 'House, Techno, Disco Edits and Warmup have no number beside them, unlike All tracks and the playlists, so you can\'t see how big each folder is.',
  after: 'Every folder shows how many tracks it holds, like everything else in the sidebar.',
  // The folder rows: the sidebar's items before "+ Add music folder", less All tracks.
  target: (app) => {
    const out = [];
    for (const e of app.$("[data-region='sidebar']")?.children ?? []) {
      if (e.classList.contains('add')) break;
      if (e.classList.contains('item')) out.push(e);
    }
    return out.slice(1);
  },
  badge: (app) => app.$("[data-region='sidebar'] .h")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const nav = app.$("[data-region='sidebar']")?.getBoundingClientRect();
    const house = app.$$("[data-region='sidebar'] .item")[1]?.getBoundingClientRect();
    if (nav && house) d.text(nav.right + 16, house.top + house.height / 2, before ? 'no counts on folders' : 'every folder has its count', { tone: before ? 'bad' : 'ok' });
  },
};
