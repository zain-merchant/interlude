// #109 (owner's note): popovers that repeat a value the screen already shows.
//
// "Some popovers on the app don't need to show the value changing if the UI
// already shows it, so it's not redundant." Every popover that shows a value
// while you change it, or that names the value on hover, was checked
// against what's on screen beside the control.
//
// Changed (the value is right there, so the popover drops it):
// - Deck pitch fader (Fader.svelte `shown`, set in Deck.svelte): dragging,
//   arrow keys or the wheel no longer open a live "Deck A pitch +1.20%"
//   bubble, since the tempo % readout just above the fader moves with it
//   (and the big BPM beside it). Its hover tip keeps the name and
//   "double-click to reset" and drops the value; with #18's match mark the
//   tip keeps its note on the mark, without the value.
// - The tempo % button above it: its tip said "Tempo +1.20%, fader range
//   ±8%…" on a button that reads +1.20%; now "Fader range ±8%. Click to
//   change the range" (the range isn't always on the button).
// - FX length (FxUnit.svelte): "Delay time: 1/2 beat" over a control that
//   reads "1/2 beat"; now just its name ("Delay time").
//
// Kept (the value isn't shown anywhere else):
// - Every dial: Trim, High/Mid/Low EQ, Filter, Master, Cue mix, the FX
//   level and the sampler Level. Their rings show where they sit, not the
//   dB, percent or filter amount, so the live readout is the only place
//   you can read it.
// - Channel volume faders and the crossfader: the position only; the
//   meters show the signal, not the fader's setting, and "40% to A" isn't
//   written anywhere.
// - Loop and beat jump tips ("Loop 4 beats", "Jump back 4 beats"): they
//   say what a press will do, not a value being changed; the size changes
//   on the button itself with no popover.
// - Waveform zoom (the "12 s" pill shows it; its − and + tips never had
//   the value), key shift (the key button shows the shift; the menu has no
//   value), the deck BPM tip (it gives the track's own tempo, which the big
//   readout doesn't when the deck is pitched) and the record (no popover).
export default {
  id: 'quiet-readouts',
  n: 109,
  title: 'Popovers stop repeating values already on screen',
  group: 'Polish',
  notes:
    'Fader.svelte: `shown` turns off the live readout (drag, keys, wheel) and the value in the hover tip; Deck.svelte sets it on the pitch fader (the tempo % sits above it) and drops the value from the tempo % button\'s tip and the match-mark note; FxUnit.svelte: the length tip is just its name. Kept: dials, volume faders, crossfader (no other readout), loop/jump tips (they describe the press), zoom, key shift, BPM tip.',
};

/** Show me: deck A's pitch fader and the tempo % above it, flipping; tags say what the bubble and the tip show, with and without the value. */
export const show = {
  about: 'Moving the tempo fader popped up a bubble with the same percentage that the readout right above it already shows. Now the fader just moves the readout, and popovers only show values you can\'t see anywhere else.',
  before: 'Hover or drag the tempo fader and a bubble says "Deck A pitch +0.00%", the same figure written just above the fader.',
  after: 'The bubble keeps the fader\'s name and how to reset it; the percentage is read where it always is, above the fader. Dials keep their readouts, since nothing else shows their values.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    app.hideTips();
  },
  aid(d, app, ctx) {
    const f = app.$("[data-region='deck0'] .pitch-fader")?.getBoundingClientRect();
    const v = app.$("[data-region='deck0'] .val")?.getBoundingClientRect();
    if (!f || !v) return;
    const pct = app.$("[data-region='deck0'] .val")?.textContent?.trim() ?? '';
    const before = ctx.phase === 'before';
    d.text(f.right + 16, f.top + f.height / 2, before ? `dragging shows a bubble: "Pitch ${pct}", the same figure as above` : 'dragging shows no bubble: the readout above moves instead', { tone: before ? 'bad' : 'ok' });
    d.text(v.right + 16, v.top + v.height / 2, before ? `tip: "Tempo ${pct}, fader range …"` : 'tip: "Fader range ±8%. Click to change the range"', { tone: before ? 'bad' : 'ok' });
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch-fader"), app.$("[data-region='deck0'] .val")].filter(Boolean),
};
