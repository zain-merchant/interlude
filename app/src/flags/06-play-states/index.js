// #6: the play button looks the same playing or paused.
//
// .btn.play is the one solid control. Now it is the same white block in
// every state: only the glyph swaps (play or pause), an empty deck dims it
// to a grey block that still reads as a button, and holding Cue to preview
// shows the pause glyph, as if the deck were playing for good.
//
// With this flag (the Playing setting picks the polarity; owner's call 1
// in the build list):
// - Lit (the default): playing is solid in the deck's own white (ice or
//   cream) with a dark glyph, like a CDJ's play lamp; paused and ready is
//   an outline in --fg-2 with a white glyph.
// - Tint, Outline, Pressed in: paused stays the solid white block (the
//   call to act) and playing steps back from solid.
// - Cueing (Cue held, previewing from the cue point): a cue-amber ring
//   and a play glyph, since pressing Play then keeps the track playing.
//   Deck.svelte tracks whether the on-screen Cue button is held (pointer
//   or Space/Enter on it) and sets data-cueing on Play. The engine doesn't
//   report a cue preview, so the Cue key shortcut and a controller's Cue
//   don't show it.
// - Disabled (no track): an empty outline with a faint glyph.
export default {
  id: 'play-states',
  n: 6,
  title: 'The play button shows which deck is playing',
  group: 'Controls',
  notes:
    'Lit (default): playing is solid in the deck\'s white, paused is an outline. Other variants keep paused solid white and step playing back (deck tint, outline, pressed in). Cue preview shows an amber ring and a play glyph; an empty deck an empty outline. Paused hover no longer jumps to pure white.',
  settings: {
    playing: {
      type: 'choice',
      label: 'Playing',
      default: 'lit',
      options: [
        ['lit', 'Lit while playing', "The playing deck's button is solid in its own white and a paused one is an outline, like the play lamp on a CDJ: the deck that's running is the bright one."],
        ['tint', 'Deck tint', 'Paused stays solid white; playing steps back to a soft tint in the deck colour. The deck waiting for you is the bright one.'],
        ['outline', 'Outline', 'Paused stays solid white; playing becomes a bright white outline.'],
        ['sunk', 'Pressed in', 'Paused stays solid white; playing looks latched down into a dark well, glyph in the deck colour.'],
      ],
    },
  },
};

/** Show me: deck A playing, deck B paused; flipping shows the two play buttons alike (before) and told apart (after). */
export const show = {
  about: "The play button looked the same playing or paused, so you couldn't tell at a glance which deck was running. Now the playing deck's button is lit in its own white and a paused one is an outline (other looks in its options).",
  before: 'Deck A is playing and deck B is paused, but both play buttons are the same solid white block: you have to listen, or look for the moving waveform.',
  after: "Deck A's button is lit solid in its own ice white while it plays; deck B's, paused and ready, is an outline. The deck that's running is the bright one, like the play lamp on a CDJ.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
  },
  target: (app) => [app.playButton(0), app.playButton(1)],
  badge: (app) => app.playButton(0)?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    for (const n of [0, 1]) {
      const b = app.playButton(n);
      if (!b) continue;
      const r = b.getBoundingClientRect();
      const playing = b.classList.contains('on');
      const lit = document.documentElement.getAttribute('data-flag-play-states-playing') === 'lit';
      const label = before
        ? `deck ${'AB'[n]} ${playing ? 'playing' : 'paused'}: the same white block`
        : playing
          ? lit ? `deck ${'AB'[n]} playing: lit in its colour` : `deck ${'AB'[n]} playing: steps back, in its colour`
          : lit ? `deck ${'AB'[n]} paused: an outline, ready` : `deck ${'AB'[n]} paused: solid, ready to press`;
      d.text(r.x + r.width / 2, r.bottom + 16, label, { anchor: 'middle', tone: before && playing ? 'bad' : before ? undefined : 'ok' });
    }
  },
};
