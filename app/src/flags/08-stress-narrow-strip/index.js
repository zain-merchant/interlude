// #8: at the smallest window the deck's mode row overflowed.
//
// At 1024×760 (the window's minimum) each deck's mode row is 234px: four
// 52px columns. With real values it didn't fit:
// - Hot cues ("● 1 Set", 66px each) overlapped their neighbours by 6px
//   (14px at 960 wide), so "1 Set2 Set3 Set" ran together.
// - Stem names were cut off mid-word with no ellipsis: "Voca", "Melo",
//   "Drum".
// - A 1/16 loop needed 233px; at 960 wide (below the window's minimum,
//   202px) it pushed the deck's contents out of its panel.
// - The FX row needed 270px: the effect name and On/Off were squeezed
//   below their text, and "Flanger" spilled out of its button.
// Below 320px the row now drops what's repeated elsewhere: a set hot cue
// shows its colour and time (the colour is the slot, as on the waveform;
// its number stays in the label and tooltip; a time past an hour ends in an
// ellipsis), an empty one its number; the loop's side buttons tighten;
// stems stack their dot over the name; FX loses its separators and the
// menu chevron and tightens its spacing.
export default {
  id: 'stress-narrow-strip',
  n: 8,
  title: 'Mode row fits the smallest window',
  group: 'Stability',
  notes: 'Below a 320px mode row (windows under about 1,180px wide): hot cues show colour + time or just the number, stems stack dot over name, FX drops separators and the chevron. Wider decks are unchanged.',
};
