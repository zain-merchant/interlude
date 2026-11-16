// #8: worst-case data for the simulated engine (dev only).
//
// Following Emil Kowalski's break-ui skill: the browser build's demo
// library was chosen, without anyone meaning to, to look good (short
// titles, every BPM and key found, 48 tracks). With this flag on, the
// simulated engine (lib/mock.js) serves the realistic worst case instead,
// through the same calls the demo data uses. The data is in data.js.
//
// The mock is built once when the app starts, so reload the page after
// turning this on or changing the set.
export default {
  id: 'stress-data',
  n: 8,
  title: 'Worst-case data (reload after changing)',
  group: 'Stability',
  notes:
    'Dev only: the simulated library and decks serve worst-case content. Worst case: long and unicode titles, RTL, emoji, missing artists, BPM 0 / 45 / 999, no key, failed analysis, a 2-hour mix, 1,284 tracks still analyzing, long playlist and folder names, a recording clock near an hour. Reload the page after switching.',
  settings: {
    set: {
      type: 'choice',
      label: 'Data',
      options: [
        ['worst', 'Worst case'],
        ['empty', 'Empty'],
        ['one', 'One'],
        ['huge', '10,000'],
      ],
      default: 'worst',
    },
  },
};
