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
//   the tonal tile every resting button has (flag 09's surface), white
//   glyph, no outline (an outline means Cue armed); empty, the same tile
//   at the 40% disabled strength.
// - Tint, Outline (experiments): paused stays the solid white block and
//   playing steps back from solid.
// - Cueing (Cue held, previewing from the cue point): Play keeps its paused
//   look with a play glyph, since pressing Play then keeps the track
//   playing (round 2: its old amber ring put the press's feedback on Play
//   instead of the held Cue, d-K02).
//   Deck.svelte tracks whether the on-screen Cue button is held (pointer
//   or Space/Enter on it) and sets data-cueing on Play. The engine doesn't
//   report a cue preview, so the Cue key shortcut and a controller's Cue
//   don't show it.
// - Disabled (no track): with Lit, the tonal tile at 40%; with the
//   experiments, an empty outline with a faint glyph.
export default {
  id: 'play-states',
  n: 6,
  title: 'The play button shows which deck is playing',
  group: 'Controls',
  notes:
    'Lit (default): playing is solid in the deck\'s white, paused is a tonal tile (no outline). The experiments keep paused solid white and step playing back (deck tint, outline). While Cue is held (preview), Play keeps its paused look with a play glyph; an empty deck dims the tile (an empty outline in the experiments). Paused hover no longer jumps to pure white.',
  settings: {
    playing: {
      type: 'choice',
      label: 'Playing',
      default: 'lit',
      options: [
        ['lit', 'Lit while playing', "The playing deck's button is solid in its own white and a paused one is a quiet tile like Sync, like the play lamp on a CDJ: the deck that's running is the bright one."],
        ['tint', 'Deck tint', 'An experiment, not recommended: paused stays solid white and playing steps back to a soft tint in the deck colour, so the deck waiting for you is the bright one.'],
        ['outline', 'Outline', 'An experiment, not recommended: paused stays solid white and playing becomes a bright white outline, which competes with Cue\'s armed outline.'],
      ],
    },
  },
};

/** Show me: deck A playing, deck B paused; flipping shows the two play buttons alike (before) and told apart (after). */
export const show = {
  about: "The play button looked the same playing or paused, so you couldn't tell at a glance which deck was running. Now the playing deck's button is lit in its own white and a paused one is a quiet tile like Sync.",
  before: 'Deck A is playing and deck B is paused, but both play buttons are the same solid white block: you have to listen, or look for the moving waveform.',
  after: "Deck A's button is lit solid in its own ice white while it plays; deck B's, paused and ready, is a quiet grey tile like Sync beside it. The deck that's running is the bright one, like the play lamp on a CDJ.",
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
          : lit ? `deck ${'AB'[n]} paused: a quiet tile, ready` : `deck ${'AB'[n]} paused: solid, ready to press`;
      d.text(r.x + r.width / 2, r.bottom + 16, label, { anchor: 'middle', tone: before && playing ? 'bad' : before ? undefined : 'ok' });
    }
  },
};
