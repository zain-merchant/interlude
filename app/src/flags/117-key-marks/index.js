// #117 (UI audit flag; a proposal, on by default for now so it can be judged):
// the marks on keys.
//
// ⌘ ⇧ ⌥ ⌃ and the rest aren't in Special Gothic, so text took them from
// Lucida Grande, and the keys in Settings and on an empty deck were drawings.
// On a Mac they're now the system font's own, everywhere: San Francisco, asked
// for by name (system-ui) and never shipped. Its capitals are 705 to Special
// Gothic's 711, so the size is the text's; in a key its weight is 600, whose
// stems (128) are nearest the letter's (134). Off the Mac a shortcut is words.
// `letters` is whether the letter in a key is San Francisco too.
export default {
  id: 'key-marks',
  n: 117,
  title: 'Shift, Command and the rest are the Mac’s own',
  group: 'Type and colour',
  byDefault: true, // while it's being judged
  settings: {
    letters: {
      type: 'choice',
      label: 'The letter beside a mark',
      default: 'gothic',
      recommended: 'gothic',
      options: [
        ['gothic', 'Special Gothic', 'The app’s own face, as everywhere else.'],
        ['sf', 'San Francisco', 'A shortcut is all one face: the mark’s.'],
      ],
    },
  },
  notes: 'marks.js splits a text into runs and has the words used off the Mac; Marks.svelte draws them. Hooks: Library (the search hint), ContextMenu, Tooltip, Settings (help text), and Keys.svelte and Search.svelte (116).',
};

/** Show me: the search hint. */
export const show = {
  about: 'The Shift, Command, Option and Control marks came from another font. Now they are the Mac’s own, everywhere the app writes a shortcut.',
  before: 'The ⌘ in ⌘F is Lucida Grande’s.',
  after: 'It’s San Francisco’s, as in the Mac’s own menus.',
  target: 'section.library .bar .search kbd',
};
