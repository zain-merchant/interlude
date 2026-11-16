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

/** Show me: the worst-case library (the page reloads to swap the data in). */
export const show = {
  note: 'The page reloaded with the worst-case library: long, unicode, RTL and emoji titles, missing artists, BPM 0 / 45 / 999, no keys, failed analysis, a 2-hour set, 1,284 tracks still analysing. Read down the list and load a few onto the decks; the other Stability flags fix what breaks. Pick another set (Empty, One, 10,000) under More, then Again. Turn it off and reload to get the demo back.',
  reload: true,
  target: (app) => [app.$("[data-region='tracks']"), app.$('section.library .bar .count')],
  aid(d, app) {
    const count = app.$('section.library .bar .count');
    const r = count?.getBoundingClientRect();
    if (r) d.text(r.x, r.bottom + 10, `set: ${document.documentElement.getAttribute('data-flag-stress-data-set')}`);
  },
};
