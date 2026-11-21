// #65 (mixer): fader scales mirror on the right-hand side (M5).
//
// Scale marks always sat right of the slot, so deck B's pitch column and
// channel B were shifted copies of the left side, not mirror images, and
// on channel B the marks faced away from its meter. With the flag on the
// marks (and the longer default tick) of deck B's pitch fader and channel
// B's fader sit on the left of the slot. Flag 18's tempo-match mark, on
// the side away from the ticks, flips with them. CSS only, no prop needed.
export default {
  id: 'mirror-scales',
  n: 65,
  title: 'Right-hand fader scales mirror the left',
  group: 'Layout',
  notes: "style.css: margin-left on .mark / .tick of deck B's pitch fader and .fwrap.mirror's fader; with #18 on, deck B's .match moves to the right.",
};

/** Show me: both channel faders and both pitch faders, with each fader's slot line and the side its marks are on. */
export const show = {
  about: 'On the right-hand side, the fader marks sat on the same side as on the left, so the two halves of the screen were copies rather than mirror images. Now the right-hand faders carry their marks on the inside, mirroring the left.',
  before: "Deck B's pitch fader and channel B's fader have their marks on the right of the slot, like deck A's: the screen isn't symmetrical, and channel B's marks face away from its meter.",
  after: "The right-hand faders carry their marks on the left of the slot, so each side mirrors the other and every channel's marks sit between its fader and meter.",
  setup() {},
  target: (app) => [app.$('.mixer .fwrap'), app.$('.mixer .fwrap.mirror'), app.$("[data-region='deck0'] .pitch-fader"), app.$("[data-region='deck1'] .pitch-fader")],
  aid(d, app, ctx) {
    const after = ctx.phase === 'after';
    const faders = [app.$('.mixer .fwrap .fader'), app.$('.mixer .fwrap.mirror .fader'), app.$("[data-region='deck0'] .pitch-fader .fader"), app.$("[data-region='deck1'] .pitch-fader .fader")];
    faders.forEach((f, i) => {
      const r = f?.getBoundingClientRect();
      const m = f?.querySelector('.mark')?.getBoundingClientRect();
      if (!r || !m) return;
      const axis = r.left + r.width / 2;
      d.vguide(axis, { y1: r.top, y2: r.bottom, c: d.C.ghost, dash: '4 3' });
      const right = m.left > axis;
      const ok = i % 2 === 0 ? right : !right;
      if (i % 2 === 1) {
        // The marks are 5px dashes a few pixels from the slot: magnified, the side they sit on reads at once.
        const z = 4;
        const vw = 40;
        const vh = 56;
        const l = d.loupe(`fader${i}`, { x: axis - vw / 2, y: r.top + r.height / 2 - vh / 2 }, { zoom: z, size: { w: vw * z, h: vh * z }, near: r, caption: '' });
        d.text(l.rect.x + l.rect.width / 2, l.rect.bottom + 16, right ? 'marks on the right, like the left side' : 'marks mirrored: on the inside', { anchor: 'middle', tone: ok ? 'ok' : 'bad', fixed: true });
      }
    });
    void after;
  },
};
