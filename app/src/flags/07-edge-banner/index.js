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
