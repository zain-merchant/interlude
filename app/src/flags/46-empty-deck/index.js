// #46: an empty deck looks empty (batch D10).
//
// An empty deck drew its "—" BPM and two "0:00.0" times in full white,
// brighter than its own "Empty deck" title; the beat-jump size and the
// selected tab stayed at full strength while the controls around them
// dimmed; and "Drag a track here or press ⇧←" appeared four times across
// the lanes and decks. With the flag, on a deck with no track: the BPM
// dash and both times are --fg-4 (the doc's empty level), the selected
// tab and its underline go --fg-3, the beat-jump size dims with its
// arrows, and the lanes drop their hint (the deck header keeps it, once
// per deck). Pitch and Key lock stay live: they work without a track.
// With deck-polish's quieter tenths on, an empty time stays one grey. With
// deck-spare-height on, the hint moves from the subtitle into the empty
// overview well, centred (Deck.svelte puts it on the well as data-hint),
// and the subtitle keeps its room so loading a track moves nothing.
export default {
  id: 'empty-deck',
  n: 46,
  title: 'An empty deck looks empty',
  group: 'Polish',
  notes: 'With no track: BPM dash and times at --fg-4, the selected tab at --fg-3, the jump size dims with its arrows, and the load hint shows once per deck (not on the lanes too).',
};

/** Show me: deck B ejected; flipping shows bright zeros and four hints (before) and a quiet empty deck (after). */
export const show = {
  about: 'An empty deck showed its zeros in bright white, as if a track were loaded, and told you how to load a track four times over. Now it reads as empty, with the hint once per deck.',
  before: 'Nothing is loaded, yet the BPM dash and both 0:00.0 times are the brightest text on the deck, and "Drag a track here" appears on both lanes and both decks.',
  after: "The empty deck's numbers drop to the faint 'nothing here' grey, and the load hint appears once, on the deck itself. Pitch and Key lock stay ready, since they work without a track.",
  async setup(app) {
    if (!app.loaded(1)) return;
    await app.pause(1);
    const { ejectTrack } = await import('../../lib/engine.svelte.js');
    await ejectTrack(1);
    await app.until(() => !app.loaded(1), 2000, 'deck B to empty');
  },
  target: (app) => [app.$("[data-region='deck1']"), app.$("[data-region='waves']")],
  badge: (app) => app.$("[data-region='deck1'] .times")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const n = 1;
    if (app.loaded(n)) return;
    const t = app.$(`[data-region='deck${n}'] .times`)?.getBoundingClientRect();
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    if (!t || !w) return;
    const before = ctx.phase === 'before';
    d.text(t.left + t.width / 2, t.bottom + 16, before ? 'empty, but the zeros are the brightest thing here' : 'empty: the zeros are quiet', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
    d.text(w.left + w.width / 2, w.bottom + 16, before ? 'the load hint, again, on each lane' : 'lanes keep just their deck bar', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
