// #18 (visual): the track is running out.
//
// The remaining time ("−0:24.3") looked the same at five minutes and at
// five seconds, so a track could end on you mid-mix. With the flag on,
// while a deck plays its last seconds the remaining time turns the warning
// colour, and in the last ten seconds it pulses slowly (not under reduced
// motion). Hook: Deck.svelte (class:ending on the remaining time).
export default {
  id: 'visual-ending',
  n: 18,
  title: 'Warn when a track is ending',
  group: 'Polish',
  notes: 'While playing, the remaining time turns the warning colour in the last seconds, and pulses in the last ten.',
  settings: {
    secs: { type: 'range', min: 10, max: 60, step: 5, default: 30, label: 'Warn from (s)' },
    pulse: { type: 'choice', options: [['on', 'Pulse'], ['off', 'Steady']], default: 'on', label: 'Last ten seconds' },
  },
};
