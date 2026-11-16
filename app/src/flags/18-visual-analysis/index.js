// #18 (visual): analysis progress.
//
// While the library is being analysed the bar says "analyzing, 36 to go",
// a number that only counts down: there's no sense of how far along it
// is. With the flag on, a hairline under the note fills from left to right
// as tracks are analysed, and the note goes when it's done, as before.
// Hook: Library.svelte (a CSS variable on the note).
export default {
  id: 'visual-analysis',
  n: 18,
  title: 'Analysis progress under the library count',
  group: 'Polish',
  notes: 'A hairline under "analyzing, N to go" fills as the library is analysed.',
};
