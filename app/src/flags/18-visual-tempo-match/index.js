// #18 (visual): where the tempos match.
//
// To match tempos by hand you read both BPMs ("129.00", "118.00"), work out
// the difference and move the pitch fader until the numbers agree. With the
// flag on, each deck's pitch fader carries a small mark, in the other
// deck's colour, beside the slot at the position where this deck would play
// at the other deck's tempo. Move the cap onto the mark and the tempos
// match; the gap between cap and mark is the tempo difference. When the
// other tempo is beyond the fader's range, the mark sits at that end of
// the travel at half strength. When the tempos match (within 0.05 BPM),
// the handle's centre line takes the other deck's colour (Deck.svelte sets
// .matched on the fader's wrapper).
// The mark is 10×3px, 2px clear of the slot, and the fader's tooltip says
// what it is ("the mark is where it matches the other deck (119.00)").
// Hooks: Fader.svelte (match prop), Deck.svelte (match, and the tooltip
// through Fader's note).
export default {
  id: 'visual-tempo-match',
  n: 18,
  title: 'A mark on the pitch slider shows where tempos match',
  group: 'Polish',
  notes: 'A mark beside each pitch fader, in the other deck\'s colour, where this deck would match the other\'s tempo. Pinned at the end at half strength when out of range; the handle\'s line takes the other deck\'s colour when matched. The fader\'s tooltip explains it.',
};

/** Show me: two decks at different tempos; flipping shows the pitch fader bare (before) and with its match mark (after), magnified. */
export const show = {
  about: 'Matching two tempos by hand meant reading both numbers and nudging the pitch slider until they agreed. Now a small mark beside the slider shows where to stop.',
  before: 'Deck A plays at one tempo, deck B at another. To match them you compare the two numbers and move deck A\'s pitch slider by trial and error.',
  after: 'A small mark in deck B\'s colour sits beside deck A\'s pitch slider: move the handle onto it and the tempos match. The gap between them is how far apart they are.',
  async setup(app, ctx) {
    // Two tempos a few percent apart, so the mark sits within the slider's range.
    const bpm = (r) => Number(r.querySelectorAll('.n.num')[0]?.textContent);
    const rows = app.rows();
    const a = rows.findIndex((r) => bpm(r) >= 116 && bpm(r) <= 120);
    const b = rows.findIndex((r) => bpm(r) - bpm(rows[a]) >= 3 && bpm(r) - bpm(rows[a]) <= 6);
    await app.loadTrack(0, a < 0 ? 1 : a);
    await app.loadTrack(1, b < 0 ? 0 : b);
    // The part of the slider to magnify: from the handle to the mark (taken with the flag on).
    const cap = app.$("[data-region='deck0'] .pitch-fader .cap")?.getBoundingClientRect();
    const m = app.$("[data-region='deck0'] .pitch-fader .match")?.getBoundingClientRect() ?? cap;
    const f = app.$("[data-region='deck0'] .pitch-fader")?.getBoundingClientRect();
    if (cap && f) {
      const y0 = Math.min(cap.top, m.top) - 18;
      const y1 = Math.max(cap.bottom, m.bottom) + 18;
      ctx.view = new DOMRect(f.left - 8, y0, f.width + 16, y1 - y0);
    }
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch-fader")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const f = app.$("[data-region='deck0'] .pitch-fader")?.getBoundingClientRect();
    const cap = app.$("[data-region='deck0'] .pitch-fader .cap")?.getBoundingClientRect();
    if (!f || !cap || !ctx.view) return;
    const z = 3;
    const v = ctx.view;
    const l = d.loupe('fader', { x: v.x, y: v.y }, { zoom: z, size: { w: v.width * z, h: v.height * z }, near: f, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    const m = app.$("[data-region='deck0'] .pitch-fader .match")?.getBoundingClientRect();
    const c = l.map(cap.left, cap.top + cap.height / 2);
    if (before || !m) {
      d.text(l.at.x + l.rect.width + 8, c.y, 'where should the handle go to match B? guess', { tone: 'bad', fixed: true });
      return;
    }
    const mm = l.map(m.left, m.top + m.height / 2);
    d.clip(l.rect, () => d.arrow(c.x - 6, c.y, mm.x - 6, mm.y, { c: d.C.ink }));
    d.text(l.at.x + l.rect.width + 8, mm.y, "the mark: put the handle here to match deck B's tempo", { tone: 'ok', fixed: true });
    d.text(l.at.x + l.rect.width + 8, c.y, 'handle now', { fixed: true });
  },
};
