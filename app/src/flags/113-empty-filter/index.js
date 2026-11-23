// #113 (UI audit flag; an opt-in trial): nothing in the filter.
//
// When the BPM filter leaves no tracks, the list shows your tempos and the
// range you asked for, which explains the empty list. `kind` is whether the
// range can be dragged there:
//   drawn  a picture: ink marks, no handles
//   live   two handles that set the real filter; the list answers as you
//          drag, and the control stays up until you let go (it would
//          otherwise vanish under the pointer as soon as a track matched)
export default {
  id: 'empty-filter',
  n: 113,
  title: 'An empty BPM filter shows your tempos',
  group: 'Shell',
  byDefault: false,
  settings: {
    kind: {
      type: 'choice',
      label: 'The range',
      default: 'drawn',
      recommended: 'drawn',
      options: [
        ['drawn', 'Drawn', "A picture of your tempos and the range. Clear filter is the way out, and the toolbar's Filter changes it."],
        ['live', 'Draggable', 'Two handles that set the filter.'],
      ],
    },
  },
  notes: 'EmptyFilter.svelte. Hook: Library.svelte, before the empty branches, for a BPM filter alone (no search, Fits or keys).',
};
