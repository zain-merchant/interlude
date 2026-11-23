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
  title: 'Worst-case test data (reloads the page)',
  byDefault: false, // test data, not a fix: off unless asked for
  group: 'Stability',
  notes:
    'Dev only: the simulated library and decks serve worst-case content. Worst case: long and unicode titles, RTL, emoji, missing artists, BPM 0 / 45 / 999, no key, failed analysis, a 2-hour mix, 1,284 tracks still analyzing, long playlist and folder names, a recording clock near an hour. Reload the page after switching.',
  settings: {
    set: {
      type: 'choice',
      label: 'Data',
      options: [
        ['worst', 'Worst case', 'Long titles, odd keys and huge counts everywhere, to see what breaks.'],
        ['empty', 'Empty', 'No tracks at all: the first-run screen.'],
        ['one', 'One', 'A single track, to check singular words and lonely rows.'],
        ['huge', '10,000', 'Ten thousand tracks, to check the list and counts at a big collection.'],
      ],
      default: 'worst',
    },
  },
};

/** Show me: the worst-case library (the page reloads to swap the data in), with a few of its awkward items pointed out. */
export const show = {
  about: 'A test tool, not a fix: fills the demo library with awkward real-world data (very long titles, missing artists, odd tempos, a 2-hour mix) so problems show up.',
  after: 'The demo library now holds the kind of data real DJs have: very long titles, other alphabets, missing artists, tempos that are wrong, tracks still being analysed. Browse it and load a few to see what breaks. Other sets (empty, one track, 10,000) are in its settings, then Again.',
  reload: true,
  target: (app) => [app.$('section.library .bar .count')],
  aid(d, app) {
    const rows = app.rows();
    const find = (fn) => rows.find(fn);
    const cell = (row, sel) => row?.querySelector(sel)?.getBoundingClientRect();
    const tag = (r, s) => r && r.top > 0 && r.bottom < d.vh && d.text(r.right + 8, r.top + r.height / 2, s);
    const count = app.textRect(app.$('section.library .bar .count'));
    if (count) d.text(count.x, count.bottom + 16, 'over a thousand tracks, still being analysed');
    const long = find((r) => (r.querySelector('.t')?.textContent.length ?? 0) > 70);
    if (long) {
      const r = cell(long, '.t');
      if (r) d.text(r.left + 200, r.bottom + 14, 'a title too long to fit', { fixed: true });
    }
    const noArtist = find((r) => r.querySelector('.t')?.textContent.includes('IMG_'));
    if (noArtist) tag(app.textRect(noArtist.querySelector('.t')), 'a file name as the title, no artist');
    const arabic = find((r) => /[؀-ۿ]/.test(r.textContent));
    if (arabic) tag(app.textRect(arabic.querySelector('.t')), 'right-to-left text');
    const odd = find((r) => /\b999\b/.test(r.textContent));
    const bpm = odd && [...odd.querySelectorAll('.n.num')][0];
    const set = find((r) => r.textContent.includes('Printworks'));
    const time = set && [...set.querySelectorAll('.n.num')][1];
    if (time) {
      const r = time.getBoundingClientRect();
      if (r.top > 0 && r.bottom < d.vh) d.text(r.right + 8, r.top + r.height / 2, 'a two-hour mix');
    }
    if (bpm) d.text(bpm.getBoundingClientRect().x - 8, bpm.getBoundingClientRect().top + 8, 'a tempo that can\'t be right', { anchor: 'end' });
  },
};
