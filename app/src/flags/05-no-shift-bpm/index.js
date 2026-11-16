// #5: typing a BPM moved the deck.
//
// Double-clicking the BPM swaps it for a text field to type the tempo in.
// The field was 4.2em wide and taller than the number's line, so the BPM
// block grew 42px wider (the title lost that much) and 11px taller, which
// pushed the key line, the overview, the times, the mode row and the
// transport down by 11px until the edit ended. The field now takes the
// number's exact box.
export default {
  id: 'no-shift-bpm',
  n: 5,
  title: 'Typing a BPM keeps the deck still',
  group: 'Stability',
  notes: 'The BPM field opened by double-click has the same box as the number it replaces, so the deck below no longer drops 11px.',
};
