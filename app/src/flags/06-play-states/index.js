// #6: the play button looks the same playing or paused.
//
// .btn.play is the one solid control. Now it is the same white block in
// every state: only the glyph swaps (play or pause), an empty deck dims it
// to a grey block that still reads as a button, and holding Cue to preview
// shows the pause glyph, as if the deck were playing for good.
//
// With this flag:
// - Paused (ready): the solid white block, as now. It is the call to act.
// - Playing: it steps back from solid (the variant picks how), so a
//   glance at both decks says which one is running.
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
    'Paused stays solid white; playing steps back (deck tint, outline, or pressed in); cue preview shows an amber ring and a play glyph; an empty deck shows an empty outline.',
  settings: {
    playing: {
      type: 'choice',
      label: 'Playing',
      default: 'tint',
      options: [
        ['tint', 'Deck tint'],
        ['outline', 'Outline'],
        ['sunk', 'Pressed in'],
      ],
    },
  },
};

/** Show me: deck A playing, deck B paused; flipping shows the two play buttons alike (before) and told apart (after). */
export const show = {
  about: 'The play button looked the same playing or paused, so you couldn\'t tell at a glance which deck was running. Now a playing deck\'s button steps back into its colour.',
  before: 'Deck A is playing and deck B is paused, but both play buttons are the same solid white block: you have to listen, or look for the moving waveform.',
  after: 'The paused button stays solid white, ready to press; the playing one turns into a quieter button in its deck\'s colour. One glance tells you which deck is running.',
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
      const label = playing
        ? before ? `deck ${'AB'[n]} playing: the same white block` : `deck ${'AB'[n]} playing: steps back, in its colour`
        : before ? `deck ${'AB'[n]} paused: the same white block` : `deck ${'AB'[n]} paused: solid, ready to press`;
      d.text(r.x + r.width / 2, r.bottom + 16, label, { anchor: 'middle', tone: before && playing ? 'bad' : before ? undefined : 'ok' });
    }
  },
};
