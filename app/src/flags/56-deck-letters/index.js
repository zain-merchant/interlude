// #56 (against the design doc; addendum part 3): "A" and "B" on the decks.
//
// The doc rules out deck letters: "'A' and 'B' deck labels. Colour and
// position already identify the decks." The critique panel dropped six
// clusters asking for them (c-K87, b-K75, d-K69, a-K88, b-K77, a-K84; up to
// 15 judges each): the two deck whites are pale and close in lightness, so
// in the library, the mixer and on the crossfader ends the decks are told
// apart by a faint tint, and the copy says "deck A" while the screen never
// shows a letter. With this flag the letter is on screen: a tile in the
// deck's colour before each deck's title, and in place of each lane's
// colour bar (CSS here). The mixer channels and the library's loaded rows
// draw theirs on the same flag id (Mixer.svelte, Library.svelte). Off by
// default; it's here for the owner to judge.
export default {
  id: 'deck-letters',
  n: 56,
  disabled: 'The doc rules deck letters out; #88\'s left and right words are the adopted fix.',
  title: 'A and B letters on the decks',
  group: 'Type and colour',
  against: '"\'A\' and \'B\' deck labels. Colour and position already identify the decks."',
  notes: 'An "A" / "B" tile in the deck colour before each deck title, the letter in place of each lane bar; the mixer and library rows add theirs on the same flag.',
};

/** Show me: both decks loaded; flipping shows the decks unlettered (before) and lettered (after). */
export const show = {
  about: 'Against the design doc, which identifies the decks by colour and position only. Many judges found the two pale deck whites too alike, and the copy says "deck A" while no A is ever shown. Turn this on to judge it: each deck, lane, mixer channel and loaded library row shows its letter.',
  before: 'The decks are told apart by a cool and a warm white and by which side they are on, as the design doc intends. No letter anywhere, though the app\'s words say "deck A".',
  after: 'Each deck has an "A" or "B" before its title, and each waveform lane starts with its letter. The cost: more labels, and the left/right layout already says the same thing.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: (app) => [app.$("[data-region='deck0'] header"), app.$("[data-region='deck1'] header"), app.$('.waves .lane .who')],
  badge: (app) => app.$("[data-region='deck0'] header")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const h = app.$("[data-region='deck0'] header")?.getBoundingClientRect();
    if (!h) return;
    const before = ctx.phase === 'before';
    d.text(h.left, h.bottom + 16, before ? 'the doc: decks told apart by colour and side' : 'against the doc: lettered', { tone: before ? undefined : 'ok' });
  },
};
