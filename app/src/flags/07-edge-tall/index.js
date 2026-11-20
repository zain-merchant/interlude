// #7: on a tall screen the decks stretched into empty slabs.
//
// The waveforms are a fixed 136px and the library tops out at 560px, so
// every extra pixel of a tall window went to the decks. At 2560×1440 each
// deck was over 1,000px tall: the hot cues floated in the middle of a
// blank panel, the five channel dials spread 230px apart, and the pitch
// fader was a metre of travel. The decks now stop growing at a set height
// and the waveforms take the rest, which is where a DJ wants the room.
export default {
  id: 'edge-tall',
  n: 7,
  title: 'Tall windows grow the waveforms, not the decks',
  group: 'Stability',
  notes: 'The deck row stops at a maximum height; extra height goes to the waveform lanes. No change below about 1,000px of window height.',
  settings: {
    decks: { type: 'range', min: 360, max: 720, step: 20, default: 460, unit: 'px', label: 'Deck max height' },
  },
};

/** Show me: zooms the interface out to 80% so the window is tall enough, and marks the decks' cap. */
export const show = {
  note: "Zoomed out to 80% for a tall window: the decks stop at the line and the waveforms take the rest. Done restores the zoom.",
  async setup(app, ctx) {
    ctx.was = app.zoom(0.8);
    await app.wait(300);
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
  },
  target: (app) => [app.$('.waves'), app.deck(0)],
  aid(d, app) {
    const deck = app.deck(0)?.getBoundingClientRect();
    const waves = app.$('.waves')?.getBoundingClientRect();
    const deckB = app.deck(1)?.getBoundingClientRect();
    if (!deck || !waves) return;
    const cap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flag-edge-tall-decks')) || 460;
    // getBoundingClientRect is in zoomed px here; the cap is in CSS px.
    const k = deck.height / (app.deck(0).offsetHeight || deck.height);
    d.hguide(deck.top + cap * k, { x1: deck.left, x2: deckB?.right ?? deck.right, label: `deck cap, ${cap}px`, lx: deck.left + 8 });
    d.measure(waves.right - 24, waves.top, waves.right - 24, waves.bottom, { label: `waveforms ${Math.round(app.$('.waves').offsetHeight)}`, side: 'left' });
  },
};
