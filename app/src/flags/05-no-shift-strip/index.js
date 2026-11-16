// #5: the deck's mode row and beat-jump readout moved as values changed.
//
// Measured at 1440×900, deck A:
// - Setting a hot cue turned "Set" into "0:32": the cue's dot and number
//   moved 3px left.
// - Changing the loop size (4 → 16 → 1/16 beats) resized the loop button,
//   and with the row spaced evenly, both arrows moved 3–6px.
// - The beat-jump size in the transport ("4" → "1/16") resized the middle of
//   the jump control, moving its ‹ › hit areas by up to 4px.
// - Choosing another effect (Echo → Flanger) widened its button and pushed
//   everything after it 9px right; On/Off also changed width.
// Each value now has a slot sized for its longest form, so pressing a
// control never moves the one next to it. Hot cue and FX slots apply where
// the deck has room (320px and up); in the narrowest decks they'd overflow,
// so those keep their old sizing (see stress-narrow-strip for that width).
export default {
  id: 'no-shift-strip',
  n: 5,
  title: 'Cues, loop, FX and beat jump hold their places',
  group: 'Stability',
  notes: 'Hot cue times, loop and beat-jump sizes, the effect name and On/Off sit in fixed slots, so the controls beside them stay put.',
};
