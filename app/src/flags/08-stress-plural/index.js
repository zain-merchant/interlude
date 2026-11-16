// #8: "1 tracks".
//
// The library's count always said "tracks", so a playlist or search with
// one result read "1 tracks" (found with the stress-data "One" set). It now
// says "1 track" (Library.svelte). The deck's beat counts, FX lengths and
// toasts already handle one.
export default {
  id: 'stress-plural',
  n: 8,
  title: '"1 track", not "1 tracks"',
  group: 'Stability',
  notes: 'The library count reads "1 track" for a single result.',
};
