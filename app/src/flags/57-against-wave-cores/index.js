// #57 (against the design doc; addendum part 4): calmer waveform cores.
//
// The doc sets the deck's waveform bands: ice "#4d6580, #c9dcf2 and
// #f4f8fc", cream "#806548, #f0dcc0 and #fcf7ef". The panel dropped b-K78
// and a-K91: the near-white high band, blended additively over the others,
// makes long stretches of the upcoming waveform brighter than the BPM and
// time readouts. With this flag the high band is a little under each
// deck's own white (--a-high #a7bad2, --b-high #d2bc9d), so the cores glow
// less. The waveforms read the new colours when the flag flips
// (Waveform.svelte).
export default {
  id: 'against-wave-cores',
  n: 57,
  title: 'Calmer waveform cores',
  group: 'Type and colour',
  against: '"Deck 1 is ice white, #c9dcf2. Its waveform bands are #4d6580, #c9dcf2 and #f4f8fc." (and cream likewise)',
  notes: 'The waveforms\' high band drops from near-white to a little under the deck colour (--a-high, --b-high), so the cores are less bright.',
};

/** Show me: both decks loaded; flipping shows the near-white cores (before) and calmer ones (after). */
export const show = {
  about: 'Against the design doc\'s waveform colours. Judges found the near-white centre of the waveforms brighter than the numbers you need to read. Turn this on to judge calmer cores.',
  before: 'The centre of each waveform is near-white, as the design doc sets it: the brightest thing on screen over long stretches.',
  after: 'The centres are a little darker than each deck\'s white, so the waveforms glow less and the readouts stand out more. The cost: less sparkle on the loud parts.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.seek(0, 0.3);
    await app.seek(1, 0.3);
  },
  target: (app) => [app.$("[data-region='waves']")],
  badge: (app) => {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    return w && new DOMRect(w.left + 24, w.top, 160, w.height);
  },
  aid(d, app, ctx) {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    if (!w) return;
    const before = ctx.phase === 'before';
    d.text(w.left + w.width / 2, w.bottom + 16, before ? 'the doc: near-white cores' : 'against the doc: calmer cores', { anchor: 'middle', tone: before ? undefined : 'ok' });
  },
};
