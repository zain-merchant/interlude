// #52: no flat slab before 0:00 on the lanes (batch D19, audit C3).
//
// Left of a track's start, the scrolling lane drew a full flat band: the
// first bin repeated. sample() clamped its range into the track before
// checking it, so a window wholly before the start read bin 0. With the
// flag it tests the range first and returns silence (null) outside the
// track, so before 0:00 the lane is empty, as it is past the end.
// Hooks: waveform-2d.js (sample, the ribbon's tile key), Waveform.svelte.
export default {
  id: 'lane-start',
  n: 52,
  title: 'Nothing drawn before the track starts',
  group: 'Polish',
  notes: 'The scrolling lanes no longer draw a flat band left of 0:00 (sample() checks the range before clamping it).',
};

/** Show me: both decks at their start; flipping shows a flat band left of the play head (before) and an empty lane (after). */
export const show = {
  about: 'At the start of a track, the waveform lane drew a flat solid band before 0:00, as if there were sound there. Now the lane is empty until the track begins.',
  before: 'With a track at its very start, the left half of the lane (before 0:00) shows a flat band that looks like a long held note.',
  after: 'Before 0:00 the lane is empty, so where the track begins is plain to see.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.pause(0);
    await app.pause(1);
    await app.seek(0, 0.005);
    await app.seek(1, 0.005);
  },
  target: (app) => [app.$("[data-region='waves']")],
  badge: (app) => {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    return w && new DOMRect(w.left, w.top, w.width / 2, w.height);
  },
  aid(d, app, ctx) {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    if (!w) return;
    const before = ctx.phase === 'before';
    d.text(w.left + w.width / 4, w.bottom + 18, before ? 'before 0:00: a flat band where there is no sound' : 'before 0:00: empty', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
