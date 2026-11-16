// #16: the selected last row of the library was cut off at the list's foot.
//
// The track list was exactly as tall as its rows, so the last row sat flush
// against the list's rounded bottom edge, which clipped its corners and its
// selection hairline; selecting it with the keyboard scrolled it to exactly
// that edge. This leaves room under the last row, and scrolls a row clear
// of the edge by the same amount (Library.svelte, select()).
export default {
  id: 'library-end',
  n: 16,
  title: 'Room under the last library row',
  group: 'Layout',
  notes: 'The last row no longer touches the list\'s rounded foot; keyboard selection scrolls it clear by the same gap.',
  settings: {
    gap: { type: 'range', min: 0, max: 16, step: 1, default: 6, unit: 'px', label: 'Gap' },
  },
};
