// #17: the headphone cue button didn't line up with anything.
//
// Under each channel fader sits the fader and its level meter, with the
// headphone (cue) button below them. The button was centred on the pair as
// a whole, so it sat 4.5px off the fader's axis and nowhere near the meter:
// aligned to neither. This puts it under the fader, which is the line the
// eye follows down the channel, or (the other choice) spans the fader and
// meter together so its edges meet theirs.
export default {
  id: 'headphone-align',
  n: 17,
  title: 'Headphone button lined up with the fader',
  group: 'Layout',
  notes: 'Fader: the button is the fader\'s width and centred on its slot. Strip: it spans fader and meter, edge to edge.',
  settings: {
    to: {
      type: 'choice',
      options: [
        ['fader', 'Fader'],
        ['strip', 'Fader and meter'],
      ],
      default: 'fader',
      label: 'Align to',
    },
  },
};
