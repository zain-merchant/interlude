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
  title: 'Play button states',
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

/** Show me: deck A playing, deck B paused, each play button tagged with its state. */
export const show = {
  note: 'Deck A plays, deck B is paused: compare the two play buttons, and try Playing.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
  },
  target: (app) => [app.playButton(0), app.playButton(1)],
  aid(d, app) {
    for (const n of [0, 1]) {
      const b = app.playButton(n);
      if (!b) continue;
      const r = b.getBoundingClientRect();
      const state = b.getAttribute('aria-disabled') === 'true' ? 'empty deck' : b.hasAttribute('data-cueing') ? 'cueing' : b.classList.contains('on') ? 'playing' : 'paused';
      d.text(r.x + r.width / 2, r.bottom + 14, state, { anchor: 'middle', fixed: true });
    }
  },
};
