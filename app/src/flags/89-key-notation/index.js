// #89 (Li13, C49; Later tier): the decks write keys in Camelot, the library
// doesn't.
//
// A deck shows its key as "Bm 10A" (the musical name and the Camelot code),
// but the library's Key column only shows "Bm", so matching the two meant
// translating in your head. With the flag on, the Key column follows a
// notation picked here: both (as the decks, one size and one grey), or
// Camelot only. (Musical only is the state with the flag off.)
// In the shipped version this is a Display setting (Display › Key) that the
// decks read too; the panel's choice stands in for it. The decks follow the
// same choice (Deck.svelte: Camelot shows only "8B", both as before). Sorting by Key already
// follows the Camelot wheel. Hooks: Library.svelte (notation, the Key cell);
// #80 reads --lib-key for the wider column.
export default {
  id: 'key-notation',
  n: 89,
  title: 'The library writes keys the way the decks do',
  group: 'Type and colour',
  notes: 'Key column notation: both ("Bm 10A", one size and colour) or Camelot only. Column widens to 72px (88 under #80) for both. The decks follow the same choice (Deck.svelte). Ships as Display › Key.',
  settings: {
    show: {
      type: 'choice',
      label: 'Key notation',
      default: 'both',
      options: [
        ['both', 'Both', 'The key and its Camelot code ("Bm 10A"), exactly as the decks show them, so the list and the decks match.'],
        ['camelot', 'Camelot', 'Only the code ("10A"): the quickest to match by number round the wheel, for DJs who mix by Camelot.'],
      ],
    },
  },
};

/** Show me: a track on a deck; flipping shows "Bm" in the list next to "Bm 10A" on the deck (before) and the same notation in both (after). */
export const show = {
  about: 'The decks showed a key as "Bm 10A", but the track list only said "Bm", so you had to translate between them. Now the list writes keys the same way the decks do.',
  before: 'The deck says "C 8B", the list says "C": the Camelot code you mix by is missing from the list.',
  after: 'The list says "C 8B" too, so you can match the next track to the deck at a glance. The notation is a choice: both, or Camelot only.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.clearSearch();
    app.$("[data-region='tracks']").scrollTop = 0;
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit .key"), app.$$('section.library .head .sort').find((b) => b.textContent.trim().startsWith('Key'))],
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const keys = app.$$("[data-region='tracks'] .row .k").map((k) => k.getBoundingClientRect()).filter((r) => r.top > 0 && r.bottom < d.vh);
    const at = keys[1];
    if (at) d.text(at.right + 16, at.top + at.height / 2, before ? 'the list: no Camelot code' : 'the list: same notation as the deck', { tone: before ? 'bad' : 'ok' });
  },
};
