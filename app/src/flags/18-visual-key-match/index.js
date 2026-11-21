// #18 (visual): which library tracks mix with what's loaded.
//
// The library has a Key column, but whether a track's key would mix with
// what's on the decks was left to the DJ to work out on the Camelot wheel.
// With the flag on, every library key that mixes with the playing deck (or
// the loaded decks while nothing plays) is drawn at full strength over one
// quiet grey line, under the key and its Camelot code together. "Mixes" is
// the usual rule: the same Camelot number, or one step round the wheel
// with the same letter, as each deck sounds now (tempo shift, key lock).
// A row that is itself on a deck isn't marked: it would only "mix with
// itself". Pointing at a marked key says which deck it goes with ("Mixes
// with the left deck (C, 8B)"), and the Key heading explains the line.
//
// The line is one box shadow under the key (no text-decoration per span,
// which left a seam between the key and its code), in --fg-3, so it can't
// be read as a link or as a deck colour (ice and cream mean "on that deck"
// in #82). The decks themselves carry no mark (the per-fix review dropped
// the deck half). Hooks: key.js (keysMix), Library.svelte.
export default {
  id: 'visual-key-match',
  n: 18,
  title: 'Mark library keys that mix with what\'s loaded',
  group: 'Polish',
  notes: 'Library keys that mix with the playing (or loaded) decks: --fg over one 1px --fg-3 line under key and code (box-shadow, no seam); not on rows that are themselves loaded. Tooltip names the deck; Key heading tooltip explains it.',
};

/** Show me: a track on the left deck; flipping shows the Key column plain (before) and the keys that mix marked (after). */
export const show = {
  about: 'To find a next track that would sound right with what\'s playing, you had to work out keys on the Camelot wheel yourself. Now every track in the list whose key goes with what\'s loaded has a quiet line under its key.',
  before: 'The list shows each track\'s key, but which of them go with the track on the deck is left for you to work out.',
  after: 'Keys that go with what\'s loaded are brighter, with a thin grey line under the key and its code: a shortlist for the next track. Point at one and it says which deck it goes with.',
  async setup(app) {
    await app.clearSearch();
    app.$("[data-region='tracks']").scrollTop = 0;
    // A shortlist of one is easy to miss: put the tracks on the decks (of
    // the first few rows) whose keys mark the most rows in view. Nothing
    // plays, so keys that go with either loaded deck are marked.
    const marked = () => app.$$("[data-region='tracks'] .row .k.mix").filter((k) => k.getBoundingClientRect().bottom < innerHeight).length;
    const pick = async (deck, rows) => {
      let best = { row: rows[0], n: -1 };
      for (const row of rows) {
        await app.loadTrack(deck, row);
        app.$("[data-region='tracks']").scrollTop = 0;
        await app.wait(60);
        const n = marked();
        if (n > best.n) best = { row, n };
        if (n >= 4) break;
      }
      if (marked() < best.n) await app.loadTrack(deck, best.row);
      app.$("[data-region='tracks']").scrollTop = 0;
      return best;
    };
    const a = await pick(0, [1, 0, 2, 3, 4, 5]);
    if (a.n < 4) await pick(1, [4, 5, 6, 7, 3, 2].filter((r) => r !== a.row));
    await app.until(() => app.$("[data-region='tracks'] .row .k.mix"), 2000, 'a key that mixes');
  },
  target: (app) => app.$$("[data-region='tracks'] .row .k.mix").slice(0, 6),
  badge: (app) => app.$$('button.sort').find((b) => b.textContent.trim().startsWith('Key'))?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const inView = (r) => r.top > 0 && r.bottom < d.vh;
    const keys = app.$$("[data-region='tracks'] .row .k").map((k) => k.getBoundingClientRect()).filter(inView);
    const marked = app.$$("[data-region='tracks'] .row .k.mix").map((k) => k.getBoundingClientRect()).filter(inView);
    const at = before ? keys[0] : marked[0];
    if (at) d.text(at.right + 24, at.top + at.height / 2, before ? "which of these go with what's loaded? work it out" : "marked: goes with what's loaded", { tone: before ? 'bad' : 'ok' });
  },
};
