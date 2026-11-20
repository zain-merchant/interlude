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
export default {
  id: 'edge-banner',
  n: 7,
  title: 'Banners float instead of squeezing the decks',
  group: 'Stability',
  notes: 'A lost audio device, a restored library or an update shows its banner over the top of the window, as designed, instead of as an extra row that shrinks the decks.',
};

/** Show me: unplugs the simulated audio device, which raises the banner, and ghosts the decks with the flag off. */
export const show = {
  note: 'The audio device is unplugged and its banner is up; dashed is where the decks would be with the flag off.',
  async setup(app, ctx) {
    app.mock.lose();
    await app.until(() => app.$('.banner'), 3000, 'the banner');
    await app.wait(100);
    ctx.parts = () => [app.deck(0), app.$('.mixer'), app.deck(1)];
    ctx.b = app.both('edge-banner', ctx.parts());
  },
  cleanup(app) {
    app.mock?.restore();
  },
  target: '.banner',
  aid(d, app, ctx) {
    const other = app.other('edge-banner', ctx.b);
    const off = app.isOn('edge-banner') ? 'off:' : 'on:';
    // One label, on deck A: the three move alike.
    ctx.parts().forEach((el, i) => el && d.ghost(other[i], el.getBoundingClientRect(), { label: i ? false : `${off} decks`, side: 'below' }));
  },
};
