// #117 (UI audit flag; a proposal, on by default for now so it can be judged):
// the marks on keys.
//
// ⇧ ⌘ ⌥ ⌃ ↩ ⌫ ⇥ aren't in Special Gothic, so menus, tooltips, the search
// hint, the toast and Settings' text took them from Lucida Grande, and the
// keys in Settings and on an empty deck were drawings of another weight
// again. This is one set for all of them, a small font in three weights, so
// each takes the weight and size of the letters beside it.
//   matched   Special Gothic's own stroke, height and square ends, with its
//             own arrows
//   round     round ends, a lighter stroke, its own arrows
// The Mac's own menus are the system's and keep its marks.
// make-font.mjs.txt draws them (opentype.js 1.3.4).
export default {
  id: 'key-marks',
  n: 117,
  title: 'Shift, Command and the rest match the type',
  group: 'Type and colour',
  byDefault: true, // while it's being judged
  settings: {
    set: {
      type: 'choice',
      label: 'Marks',
      default: 'matched',
      recommended: 'matched',
      options: [
        ['matched', 'Matched', 'Special Gothic’s stroke, height and square ends.'],
        ['round', 'Round', 'Round ends and a lighter stroke, nearer the Mac’s.'],
      ],
    },
  },
  notes: 'Two small fonts in front of --font, limited to these characters by unicode-range. Hook: Keys.svelte (116) sets its caps as text while this is on.',
};

/** Show me: the search hint. */
export const show = {
  about: 'The Shift, Command, Option and Control marks came from another font. Now they’re drawn to match the letters beside them, everywhere the app draws a shortcut.',
  before: 'The ⌘ in ⌘F is thinner and rounder than the F, from a different font.',
  after: 'Both have the same stroke and the same height.',
  target: 'section.library .bar .search kbd',
};
