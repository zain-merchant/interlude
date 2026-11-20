// #18 (visual): which keys mix.
//
// The decks show their keys ("Bm 10A", "C♯m 12A") and the library has a
// Key column, but whether two keys mix was left to the DJ to work out on
// the Camelot wheel. With the flag on, a deck's key turns full strength
// and underlined when it mixes with the other deck's (as each sounds now,
// with tempo shift and key lock), and the library does the same for every
// track whose key mixes with the playing deck (or the loaded decks while
// nothing plays). "Mixes" is the usual rule: the same Camelot number, or
// one step round the wheel with the same letter. Hooks: key.js (keysMix),
// Deck.svelte, Library.svelte.
export default {
  id: 'visual-key-match',
  n: 18,
  title: 'Mark keys that mix',
  group: 'Polish',
  notes: 'The deck key is underlined when it mixes with the other deck, and so are library keys that mix with the playing deck (Camelot: same number, or ±1 with the same letter).',
  settings: {
    colour: { type: 'choice', options: [['fg', 'Grey'], ['go', 'Green'], ['deck', 'Deck colour']], default: 'fg', label: 'Underline colour' },
  },
};

/** Show me: two decks whose keys mix; the marks are the change, tagged once each. */
export const show = {
  note: "The two decks' keys mix, so both are underlined, and so are the library keys that mix with the playing deck.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    // With the flag on, library keys that mix are marked; load one on B.
    await app.until(() => app.$("[data-region='tracks'] .row .k.mix"), 2000, 'a key that mixes');
    const loadedA = app.deck(0).querySelector('.name')?.textContent.trim();
    const row = app.rows().find((r) => r.querySelector('.k.mix') && !r.textContent.includes(loadedA));
    await app.loadTrack(1, app.rows().indexOf(row));
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit .key"), app.$("[data-region='deck1'] .bpm .unit .key"), ...app.$$("[data-region='tracks'] .row .k.mix").slice(0, 4)],
  aid(d, app) {
    for (const n of [0, 1]) {
      const k = app.$(`[data-region='deck${n}'] .bpm .unit .key`)?.getBoundingClientRect();
      if (k) d.text(k.x + k.width / 2, k.bottom + 14, 'mixes', { anchor: 'middle', tone: 'ok' });
    }
    // The library's marked keys: one tag by the first in view.
    const first = app.$$("[data-region='tracks'] .row .k.mix").map((k) => k.getBoundingClientRect()).find((r) => r.top > 0 && r.bottom < d.vh);
    if (first) d.text(first.right + 8, first.top + first.height / 2, 'mixes with the playing deck', { tone: 'ok' });
  },
};
