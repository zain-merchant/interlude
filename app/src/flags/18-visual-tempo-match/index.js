// #18 (visual): where the tempos match.
//
// To match tempos by hand you read both BPMs ("129.00", "118.00"), work out
// the difference and move the pitch fader until the numbers agree. With the
// flag on, each deck's pitch fader carries a small mark, in the other
// deck's colour, beside the slot at the position where this deck would play
// at the other deck's tempo. Move the cap onto the mark and the tempos
// match; the gap between cap and mark is the tempo difference. When the
// other tempo is beyond the fader's range, the mark sits hollow at the end.
// Hooks: Fader.svelte (match prop), Deck.svelte.
export default {
  id: 'visual-tempo-match',
  n: 18,
  title: 'Tempo match mark on the pitch fader',
  group: 'Polish',
  notes: 'A mark beside each pitch fader, in the other deck\'s colour, where this deck would match the other\'s tempo. Hollow at the end when out of range.',
};
