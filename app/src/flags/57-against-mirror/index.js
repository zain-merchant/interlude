// #57 (against the design doc; addendum part 4): mirror more of the right
// deck.
//
// The doc's alignment rule has the two decks share one layout: "the mode
// tabs, the mode row and the transport share the deck's four columns", in
// one order on both decks, and the right deck's pitch column sits on its
// inner side, next to the mixer. The panel dropped a-K89 (the right deck
// mirrors its pitch column but keeps Cue, Play, Sync, jump left to right,
// so Cue is far from the mixer on one side only) and a-K92 (the right
// deck's pitch column pushes its title further from the mixer than the
// left deck's). The What setting tries either or both: the right deck's
// transport in mirror order (jump, Sync, Play, Cue), and/or its pitch
// column on the outer edge. CSS only (order and grid columns).
export default {
  id: 'against-mirror',
  n: 57,
  disabled: 'Against the doc\'s one shared order on both decks.',
  title: 'Mirror the right deck more',
  group: 'Layout',
  against: '"Alignment: the mode tabs, the mode row and the transport share the deck\'s four columns." (one shared order on both decks)',
  notes: 'Right deck: transport in mirror order (Cue next to the mixer), and/or the pitch column on its outer edge.',
  settings: {
    what: {
      type: 'choice',
      label: 'What',
      default: 'transport',
      options: [
        ['transport', 'Transport', 'The right deck\'s buttons run beat jump, Sync, Play, Cue, so Cue and Play sit next to the mixer on both decks, like two mirrored CDJs.'],
        ['pitch', 'Pitch column outside', 'The right deck\'s pitch fader moves to its outer edge, so both decks\' titles start the same distance from the mixer.'],
        ['both', 'Both', 'Both changes together: the right deck becomes a full mirror image of the left.'],
      ],
    },
  },
};

/** Show me: both decks loaded; flipping shows the shared order (before) and the mirrored right deck (after). */
export const show = {
  about: 'Against the design doc\'s one shared layout for both decks. Judges noted the right deck mirrors its pitch fader but not its buttons, so Cue sits next to the mixer on one deck only. Turn this on to judge mirroring the buttons, the pitch column, or both.',
  before: 'Both decks run Cue, Play, Sync, beat jump left to right, as the design doc intends, while the right deck\'s pitch fader is mirrored to the inside.',
  after: 'The right deck\'s buttons run the other way, so Cue and Play sit next to the mixer on both sides. The cost: your hand learns two orders instead of one.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: (app) => [app.$("[data-region='deck1']")],
  badge: (app) => app.$("[data-region='deck1'] .transport")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const t = app.$("[data-region='deck1'] .transport")?.getBoundingClientRect();
    if (!t) return;
    const before = ctx.phase === 'before';
    d.text(t.left + t.width / 2, t.top - 14, before ? 'the doc: one order on both decks' : 'against the doc: mirrored', { anchor: 'middle', tone: before ? undefined : 'ok' });
  },
};
