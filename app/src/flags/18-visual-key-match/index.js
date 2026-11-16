// #18 (visual): which keys mix.
//
// The decks show their keys ("Bm 10A", "C♯m 12A") and the library has a
// Key column, but whether two keys mix was left to the DJ to work out on
// the Camelot wheel. With the flag on, a deck's key turns full strength
// and underlined when it mixes with the other deck's (as each sounds now,
// with tempo shift and key lock), and the library does the same for every
// track whose key mixes with the playing deck (or the loaded decks while
// nothing plays). "Mixes" is the usual rule: the same Camelot number, or
// one step round the wheel with the same letter. Hooks: key.js (keysMix),
// Deck.svelte, Library.svelte.
export default {
  id: 'visual-key-match',
  n: 18,
  title: 'Mark keys that mix',
  group: 'Polish',
  notes: 'The deck key is underlined when it mixes with the other deck, and so are library keys that mix with the playing deck (Camelot: same number, or ±1 with the same letter).',
  settings: {
    colour: { type: 'choice', options: [['fg', 'Grey'], ['go', 'Green'], ['deck', 'Deck colour']], default: 'fg', label: 'Underline colour' },
  },
};
