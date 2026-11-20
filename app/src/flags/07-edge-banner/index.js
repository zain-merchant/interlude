// #7: a banner squeezed the whole app.
//
// The banners (audio device lost, library restored, update ready) are meant
// to float over the top of the window. But App.svelte gives every child of
// .app `position: relative` (to lift it over the backdrop), and that rule
// is more specific than the banner's own `position: absolute`. So a banner
// became an extra row of the app's grid: it sat under the library, and the
// decks lost its height (48px at 1440×900), squashing the mixer's dials
// together; at the smallest window the page started to scroll. The toast
// holder and the screen-reader live region were extra rows too (1px).
//
// Later (critique panel E12, then the per-fix review): floating at top:
// 10px it sat over deck A's play head; pinned inside deck A's lane it read
// as "deck A is broken". It now sits centred at the foot of the window,
// over the library panel's bottom edge, on one line, never over the
// waveforms or the decks. No dismiss: it's a live fault and clears itself.
export default {
  id: 'edge-banner',
  n: 7,
  title: 'Banners float instead of squeezing the decks',
  group: 'Stability',
  notes: 'A lost audio device, a restored library or an update shows its banner over the top of the window, as designed, instead of as an extra row that shrinks the decks. It sits centred at the foot of the window, over the library, never over the decks or waveforms.',
};

/** Show me: unplugs the simulated audio device, which raises its banner; flipping shows the decks squashed (before) and untouched (after). */
export const show = {
  about: 'A warning banner (audio device lost, update ready) squeezed the whole app to make room for itself. Now it floats over the top and the decks keep their size.',
  before: 'Unplug the audio device and its banner takes a row of the layout: the decks lose about 48px of height and the mixer\'s dials crowd together, right when you need them.',
  after: 'The banner floats at the foot of the window, over the library, and the decks, mixer and waveforms stay exactly as they were.',
  async setup(app, ctx) {
    ctx.parts = () => [app.deck(0), app.$('.mixer'), app.deck(1)];
    // The decks as they are with no banner.
    ctx.rest = app.both('edge-banner', ctx.parts());
    app.mock.lose();
    await app.until(() => app.$('.banner'), 3000, 'the banner');
    await app.wait(100);
  },
  cleanup(app) {
    app.mock?.restore();
  },
  target: '.banner',
  badge: (app) => app.deck(0)?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    const live = ctx.parts().map((e) => e?.getBoundingClientRect());
    const [a, m, b] = live;
    if (!a || !b || !m || !rest[0]) return;
    const lost = Math.round(rest[0].bottom - a.bottom);
    const x = m.x + m.width / 2;
    if (Math.abs(lost) > 0.5) {
      // Dashed: where the decks' bottom edge is with no banner; the gap is what they lost.
      d.line(rest[0].x, rest[0].bottom, rest[2].right, rest[0].bottom, { c: d.C.ghost, dash: '5 4', w: 1.5 });
      d.arrow(x, rest[0].bottom, x, a.bottom + 2, { c: d.C.bad });
      d.text(x, (a.bottom + rest[0].bottom) / 2, `decks squashed ${lost}px shorter (dashed: their bottom without the banner)`, { anchor: 'middle', tone: 'bad', free: true });
    } else {
      d.text(x, a.bottom + 16, 'decks and mixer keep their full size', { anchor: 'middle', tone: 'ok', free: true });
    }
  },
};
