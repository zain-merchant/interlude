// #5: killing an EQ widened the mixer.
//
// Killing a band changed its dial's label from "Low" to "Low · kill". The
// wider label widened the channel's dial column, which pushed the fader,
// the master section and the rest of the mixer about 4px sideways, and back
// again on release. The label now stays the same text, and the kill shows
// in its colour plus a mark that takes no room (Knob.svelte keeps the
// " · kill" suffix off while this flag is on; the aria-pressed state and
// the tooltip still say it's killed). The record button also stops
// changing width as "Rec" becomes a running clock: it keeps the room of
// "0:00:00" from the start.
export default {
  id: 'no-shift',
  n: 5,
  title: 'Killing an EQ no longer nudges the mixer',
  group: 'Stability',
  notes: 'The kill shows as the label in red with a mark, not extra text, so the dial column keeps its width. Rec keeps a clock\'s width.',
  settings: {
    mark: {
      type: 'choice',
      label: 'Kill mark',
      options: [
        ['strike', 'Strike'],
        ['dot', 'Dot'],
        ['colour', 'Colour only'],
      ],
      default: 'strike',
    },
  },
};
