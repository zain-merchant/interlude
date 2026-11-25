// #7: on a tall screen the decks stretched into empty slabs.
//
// The waveforms are a fixed 136px and the library tops out at 560px, so
// every extra pixel of a tall window went to the decks. At 2560×1440 each
// deck was over 1,000px tall: the hot cues floated in the middle of a
// blank panel, the five channel dials spread 230px apart, and the pitch
// fader was a metre of travel.
//
// Owner's decision (critique panel L1): the decks and the waveforms stay
// the size they were designed at (360px and 136px, from the 1440×900
// layout) and the library takes the rest, with no 560px cap, so a tall
// window shows more tracks. A short window gives way in order: the library
// down to 240px, then the waveforms down to 96px, then the decks down to
// 340px; below the app's minimum the page scrolls. The sampler's strip
// comes out of the library, so the decks never jump when it opens. The
// sizes are worked out in App.svelte (rows) and set as --waves / --decks;
// #21 panel-sizes lets you drag them. (The earlier version of this flag
// gave the extra height to the waveforms; its "Deck max height" setting
// is gone.)
export default {
  id: 'edge-tall',
  n: 7,
  title: 'Tall windows give the extra room to the library',
  group: 'Stability',
  notes: 'Waveforms 136px and decks 360px, as designed; the library takes the rest (no 560px cap). Short windows: library to 240, then waveforms to 96, then decks to 340. The sampler shortens the library, not the decks. App.svelte works out the rows.',
};

/** Show me: zooms the interface out to 80% to stand in for a tall screen; flipping shows the decks stretching (before) and the waveforms growing instead (after). */
export const show = {
  about: 'On a tall screen the extra height stretched the decks into big empty panels while the track list stayed short. Now the decks and waveforms keep their designed size and the track list gets the room.',
  before: 'On a tall window every spare pixel goes to the decks: their buttons float in empty space, and the track list, where you look for the next song, stays a short strip.',
  after: 'The decks and waveforms stay the size they were designed at, and the track list gets the extra room, so you see more tracks at once.',
  async setup(app, ctx) {
    // #21 shares the size model; off for the show, so Before is today's app.
    ctx.sizes = app.isOn('panel-sizes');
    if (ctx.sizes) app.setFlag('panel-sizes', false);
    // Zoomed out, the window is taller in the app's own pixels: a tall screen.
    ctx.was = app.zoom(0.8);
    await app.wait(300);
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
    if (ctx.sizes) app.setFlag('panel-sizes', true);
  },
  target: (app) => [app.$('.waves'), app.deck(0), app.$('section.library')],
  badge: (app) => app.$('section.library')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const deck = app.deck(0)?.getBoundingClientRect();
    const waves = app.$('.waves')?.getBoundingClientRect();
    const lib = app.$('section.library')?.getBoundingClientRect();
    if (!deck || !waves || !lib) return;
    const before = ctx.phase === 'before';
    // Heights in the app's own pixels (the window is zoomed out).
    const k = deck.height / (app.deck(0).offsetHeight || deck.height);
    const px = (h) => `${Math.round(h / k)}px`;
    const x = deck.left + 6;
    d.measure(x, waves.top + 4, x, waves.bottom - 4, { label: `waveforms ${px(waves.height)}`, side: 'right' });
    d.measure(x, deck.top + 4, x, deck.bottom - 4, { label: `decks ${px(deck.height)}`, side: 'right' });
    d.measure(x, lib.top + 4, x, lib.bottom - 4, { label: `track list ${px(lib.height)}`, side: 'right' });
    d.text(deck.left + 140, deck.top + deck.height * 0.62, before ? 'the decks stretch into empty space' : 'decks at their designed size', { tone: before ? 'bad' : 'ok' });
    d.text(lib.left + 260, lib.top + 40, before ? 'the track list stays short' : 'the track list gets the room: more tracks in view', { tone: before ? 'bad' : 'ok' });
  },
};
