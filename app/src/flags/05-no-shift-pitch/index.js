// #5: the pitch column moved as the tempo changed.
//
// - The tempo readout over the pitch fader is centred, so it widened both
//   ways as it grew (+0.00% → −15.37%), and when the fader range changed
//   from ±8 a second line (±16) appeared under it, which lifted the
//   readout 7px.
// - Turning slip on added a row to the pitch column: the fader lost 32px
//   of travel and its cap jumped, and the nudge buttons moved down.
// The readout now keeps a box for "−00.00%" with the number right-aligned
// and the range line reserved, and slip shares the key lock's row, so the
// fader never changes length.
export default {
  id: 'no-shift-pitch',
  n: 5,
  title: 'Tempo readout and pitch fader keep still',
  group: 'Stability',
  notes: 'The tempo % keeps one box (its range line reserved under it), and Slip shares Key lock\'s row instead of taking 32px of fader travel.',
};
