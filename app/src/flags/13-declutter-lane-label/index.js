// #13: a long title ran over the play head.
//
// Each waveform lane names its track at the top left, in one line with no
// limit. The play head is the lane's centre line, so a long title (a
// remaster with its mix name and label, a live set) ran across the play
// head and over the waveform it was labelling, and on lane A towards the
// zoom control. The label now stops short of the centre with an ellipsis;
// the full title is on the deck and in the library.
export default {
  id: 'declutter-lane-label',
  n: 13,
  title: 'Lane labels stop before the play head',
  group: 'Stability',
  notes: 'The track name over each waveform lane ends with an ellipsis before the centre line instead of running across it.',
};
