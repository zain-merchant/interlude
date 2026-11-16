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

/** Show me: disconnects the simulated audio device, which raises the banner, and ghosts the decks. */
export const show = {
  note: 'The simulated audio device is unplugged (__mockAudio.lose()), so the "disconnected" banner is up. Dashed blue is where deck A, the mixer and the library stood before; green held still, red moved. Turn the flag off and on: off, the banner becomes a row of the layout and the decks lose 48px. Done or another Show me plugs it back in.',
  async setup(app, ctx) {
    ctx.parts = () => [app.deck(0), app.$('.mixer'), app.$('section.library')];
    ctx.names = ['deck A', 'mixer', 'library'];
    ctx.rest = app.snap(ctx.parts());
    app.mock.lose();
    await app.until(() => app.$('.banner'), 3000, 'the banner');
  },
  cleanup(app) {
    app.mock?.restore();
  },
  target: '.banner',
  aid(d, app, ctx) {
    ctx.parts().forEach((el, i) => el && d.ghost(ctx.rest[i], el.getBoundingClientRect(), { label: ctx.names[i] }));
  },
};
