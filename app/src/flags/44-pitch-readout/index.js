// #44: the tempo % and the key at a readable size (batch D7, audit C12).
//
// "+0.00%", the number you watch while beat-matching by hand, was 11px,
// and the key ("C 8B") sat at 11px on the "BPM" caption line, so "BPM"
// read as labelling the key. The pitch fader showed no direction. With
// the flag:
// - The tempo % is 13px tabular (--t-sm), --fg-2 at zero and --fg off
//   zero (Deck.svelte's .off).
// - The key is its own word at 13px --fg-2 (Camelot --fg-3; a shifted key
//   stays --fg), and "BPM" stays an 11px --fg-3 caption 8px after it.
// - A small "−" at the top of the pitch fader and "+" at the bottom, 11px
//   --fg-4 (up is slower, like a turntable).
// Flag 05's no-shift-pitch box is sized in em, so it grows with the 13px
// readout and still fits the 56px column.
export default {
  id: 'pitch-readout',
  n: 44,
  title: 'Tempo % and key big enough to read',
  group: 'Type and colour',
  notes: 'Tempo % at 13px (dim at zero), the key as its own 13px word apart from the "BPM" caption, and − / + at the ends of the pitch fader.',
};

/** Show me: deck A nudged off zero; flipping shows the 11px readouts (before) and the 13px ones (after), magnified. */
export const show = {
  about: 'The tempo % over the pitch fader, which you watch while matching beats by hand, and the key under the BPM were the smallest text on the deck. Now both are body size, and the fader shows which end is faster.',
  before: 'The tempo reads "+0.00%" in tiny type, and the key is squeezed onto the "BPM" caption line, so "BPM" looks like it labels the key.',
  after: 'The tempo % and the key are a size up and easy to read, "BPM" is a caption on its own, and − / + at the ends of the fader say which way is slower and faster.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch"), app.$("[data-region='deck0'] .bpm")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const b = app.$("[data-region='deck0'] .bpm")?.getBoundingClientRect();
    const p = app.$("[data-region='deck0'] .pitch")?.getBoundingClientRect();
    if (!b || !p) return;
    const z = 2;
    const x0 = b.left - 8, y0 = b.top - 6;
    const w = p.right - x0 + 8;
    const l = d.loupe('readouts', { x: x0, y: y0 }, { zoom: z, size: { w: w * z, h: 70 * z }, near: b, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'tempo % and key: 11px, the key on the BPM caption' : 'tempo % and key: 13px; BPM a caption of its own', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
