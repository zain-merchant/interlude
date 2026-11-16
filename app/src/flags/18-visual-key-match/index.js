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

/** Show me: two decks whose keys mix, and the library keys that mix with them. */
export const show = {
  note: 'Loaded a track on deck A and, on deck B, one whose key mixes with it. Both decks\' keys are underlined, and so is every library key that mixes with them (Camelot: same number, or one step with the same letter); each is labelled with its Camelot code. Off, nothing marks them. Underline colour under More.',
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
    for (const k of app.$$("[data-region='deck0'] .bpm .unit .key, [data-region='deck1'] .bpm .unit .key, [data-region='tracks'] .row .k.mix").slice(0, 24)) {
      const r = k.getBoundingClientRect();
      if (r.bottom < 0 || r.top > d.vh) continue;
      d.text(r.right + 4, r.top + r.height / 2, k.classList.contains('mix') ? 'mixes' : 'no match', { c: k.classList.contains('mix') ? d.C.ok : d.C.aid });
    }
  },
};
