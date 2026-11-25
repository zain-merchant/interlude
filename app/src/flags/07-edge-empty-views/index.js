// #7: an empty playlist said the library was empty.
//
// Opening a playlist with no tracks in it (every new playlist starts that
// way) showed the empty-library message: "No tracks yet." and an "Add a
// music folder" button, which is the wrong fix. A folder with no music
// files in it did the same. They now say what's empty, in two short lines:
// "This playlist is empty." (--fg-2) and, 4px under it, "Drag tracks onto
// its name in the sidebar." (--fg-3); a folder says "No music in this
// folder." / "Add music files to it in Finder." (Library.svelte).
export default {
  id: 'edge-empty-views',
  n: 7,
  title: 'Empty playlists and folders say so',
  group: 'Stability',
  notes: 'An empty playlist reads "This playlist is empty." / "Drag tracks onto its name in the sidebar." (two lines, --fg-2 then --fg-3, 4px apart) instead of offering to add a music folder; a folder with no music says so the same way.',
};

/** Show me: makes (or reuses) an empty playlist and opens it; flipping shows the wrong message (before) and the right one (after). */
export const show = {
  about: 'An empty playlist said the whole library was empty and offered to add a music folder. Now it says the playlist is empty and how to fill it.',
  before: 'Open a new, empty playlist and it says "No tracks yet" with an "Add a music folder" button, as if your library were gone. That button won\'t put anything in the playlist.',
  after: 'It says "This playlist is empty." and, under it, to drag tracks onto its name in the sidebar, which is how you actually fill it.',
  async setup(app) {
    // A playlist this made before (still empty: no count beside it), or a new one.
    const find = () => app.$$("[data-region='sidebar'] .item").find((b) => /^New playlist/.test(b.querySelector('span')?.textContent.trim() ?? '') && !Number(b.querySelector('small')?.textContent));
    if (!find()) {
      const add = app.$$("[data-region='sidebar'] .add").find((b) => /New playlist/.test(b.textContent));
      await app.click(add);
      await app.wait(200);
      const input = app.$("[data-region='sidebar'] input");
      if (input) await app.key('Enter', { target: input });
      await app.wait(150);
    }
    const item = await app.until(find, 2000, 'the new playlist');
    await app.click(item);
    await app.until(() => app.$("[data-region='tracks'] .empty, section.library .empty"), 2000, 'the empty view');
  },
  target: 'section.library .empty',
  badge: (app) => {
    const r = app.textRect(app.$('section.library .empty'));
    return r && new DOMRect(r.x - 10, r.y - 8, r.width, r.height);
  },
  aid(d, app, ctx) {
    const e = app.$('section.library .empty');
    const r = e && (app.textRect(e) ?? e.getBoundingClientRect());
    if (!r) return;
    const before = ctx.phase === 'before';
    d.box(new DOMRect(r.x - 10, r.y - 8, r.width + 20, r.height + 16), { c: before ? d.C.bad : d.C.ok, w: 1.5, rx: 8 });
    d.text(r.x + r.width / 2, r.bottom + 24, before ? 'talks about the whole library, offers the wrong fix' : 'says what is empty, and how to fill it', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
