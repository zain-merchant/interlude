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
//
// Library (batch Li1): an underline reads as a link, and nothing said what
// it meant. A library key that mixes now says so in its tooltip, naming the
// deck by position ("B minor (10A)  Mixes with the left deck (C, 8B)"), the
// Key heading's tooltip explains the mark ("Underlined: mixes with what's
// playing"), and under the deck-colour option (now the default) a library
// key's underline takes the colour of the one deck it goes with (grey when
// it goes with both).
export default {
  id: 'visual-key-match',
  n: 18,
  title: 'Underline keys that go together',
  group: 'Polish',
  notes: 'The deck key is underlined when it mixes with the other deck, and so are library keys that mix with the playing deck (Camelot: same number, or ±1 with the same letter).',
  settings: {
    colour: {
      type: 'choice',
      label: 'Underline colour',
      default: 'deck',
      options: [
        ['deck', 'Deck colour', 'The underline takes the colour of the deck the key goes with (ice for the left, cream for the right), so you see which deck it suits.'],
        ['fg', 'Grey', 'A quiet grey underline: the same mark whichever deck it goes with.'],
        ['go', 'Green', 'A green underline: loudest, but green reads as "go" or "in sync", and the app keeps colour for the decks.'],
      ],
    },
  },
};

/** Show me: two decks whose keys mix; flipping shows the keys plain (before) and the ones that mix underlined (after). */
export const show = {
  about: 'To know whether two tracks would sound right together you had to work out their keys yourself. Now keys that go together are underlined, on the decks and in the library, and pointing at one says which deck it goes with.',
  before: 'The decks and the library show each track\'s key ("Bm 10A"), but whether two of them sound good mixed is left to you to work out.',
  after: 'When the two decks\' keys go together, both are underlined, and so is every library track whose key goes with what\'s playing: a shortlist for the next track. The underline takes the colour of the deck it suits, and its tooltip says "Mixes with the left deck".',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    // With the flag on, library keys that mix are marked; load one on B.
    await app.until(() => app.$("[data-region='tracks'] .row .k.mix"), 2000, 'a key that mixes');
    const loadedA = app.deck(0).querySelector('.name')?.textContent.trim();
    // Rather a track in a neighbouring key than the same one: it shows the rule better.
    const keyA = app.rows().find((r) => r.textContent.includes(loadedA))?.querySelector('.k')?.textContent.trim();
    const mixes = app.rows().filter((r) => r.querySelector('.k.mix') && !r.textContent.includes(loadedA));
    const row = mixes.find((r) => r.querySelector('.k')?.textContent.trim() !== keyA) ?? mixes[0];
    await app.loadTrack(1, app.rows().indexOf(row));
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit .key"), app.$("[data-region='deck1'] .bpm .unit .key")],
  badge: (app) => app.$$('button.sort').find((b) => b.textContent.trim().startsWith('Key'))?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    for (const n of [0, 1]) {
      const k = app.$(`[data-region='deck${n}'] .bpm .unit .key`)?.getBoundingClientRect();
      if (k) d.text(k.x + k.width / 2, k.bottom + 16, before ? 'do these two mix?' : 'these two mix', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
    }
    // The library's Key column.
    const inView = (r) => r.top > 0 && r.bottom < d.vh;
    const keys = app.$$("[data-region='tracks'] .row .k").map((k) => k.getBoundingClientRect()).filter(inView);
    const marked = app.$$("[data-region='tracks'] .row .k.mix").map((k) => k.getBoundingClientRect()).filter(inView);
    const at = before ? keys[0] : marked[0];
    if (at) d.text(at.right + 10, at.top + at.height / 2, before ? "which of these go with what's loaded? work it out" : "underlined: goes with what's loaded", { tone: before ? 'bad' : 'ok' });
  },
};
