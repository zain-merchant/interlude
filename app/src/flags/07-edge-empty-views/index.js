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
