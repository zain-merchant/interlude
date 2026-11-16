// #7: an empty playlist said the library was empty.
//
// Opening a playlist with no tracks in it (every new playlist starts that
// way) showed the empty-library message: "No tracks yet." and an "Add a
// music folder" button, which is the wrong fix. A folder with no music
// files in it did the same. They now say what's empty and, for a playlist,
// how to fill it (Library.svelte).
export default {
  id: 'edge-empty-views',
  n: 7,
  title: 'Empty playlists and folders say so',
  group: 'Stability',
  notes: 'An empty playlist reads "This playlist is empty. Drag tracks onto its name to add them." instead of offering to add a music folder.',
};

/** Show me: makes (or reuses) an empty playlist and opens it. */
export const show = {
  note: "An empty playlist is open: read its message. Off, it says \"No tracks yet\" and offers to add a music folder.",
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
  target: "section.library .empty",
  aid(d, app) {
    const r = app.$('section.library .empty')?.getBoundingClientRect();
    if (r) d.text(r.x + r.width / 2, r.y - 12, 'what an empty playlist says', { anchor: 'middle' });
  },
};
