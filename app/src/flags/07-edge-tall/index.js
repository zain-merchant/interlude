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

/** Show me: zooms the interface out to 80% to stand in for a tall screen; flipping shows the decks stretching (before) and the waveforms growing instead (after). */
export const show = {
  about: 'On a tall screen the decks stretched into big empty panels while the waveforms stayed thin. Now the decks stop at a sensible height and the waveforms get the extra room.',
  before: 'On a tall window every spare pixel goes to the decks: their buttons float in empty space, while the waveforms you actually watch stay a thin strip.',
  after: 'The decks stop growing at a set height and the waveforms take the rest, so you get bigger, more readable waveforms instead of empty panels.',
  async setup(app, ctx) {
    // Zoomed out, the window is taller in the app's own pixels: a tall screen.
    ctx.was = app.zoom(0.8);
    await app.wait(300);
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
  },
  target: (app) => [app.$('.waves'), app.deck(0)],
  badge: (app) => app.$('.waves')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const deck = app.deck(0)?.getBoundingClientRect();
    const waves = app.$('.waves')?.getBoundingClientRect();
    if (!deck || !waves) return;
    const before = ctx.phase === 'before';
    // Heights in the app's own pixels (the window is zoomed out).
    const k = deck.height / (app.deck(0).offsetHeight || deck.height);
    const px = (h) => `${Math.round(h / k)}px`;
    const x = deck.left + 6;
    d.measure(x, waves.top + 4, x, waves.bottom - 4, { label: `waveforms ${px(waves.height)} tall`, side: 'right' });
    d.measure(x, deck.top + 4, x, deck.bottom - 4, { label: `decks ${px(deck.height)} tall`, side: 'right' });
    d.text(deck.left + 24, deck.top + deck.height * 0.62, before ? 'decks stretch into empty space; waveforms stay thin' : 'decks stop at a set height; the waveforms get the room', { tone: before ? 'bad' : 'ok' });
  },
};
