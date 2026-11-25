// #8: at the smallest window the deck's mode row overflowed.
//
// At 1024×760 (the window's minimum) each deck's mode row is 234px: four
// 52px columns. With real values it didn't fit:
// - Hot cues ("● 1 Set", 66px each) overlapped their neighbours by 6px
//   (14px at 960 wide), so "1 Set2 Set3 Set" ran together.
// - Stem names were cut off mid-word with no ellipsis: "Voca", "Melo",
//   "Drum".
// - A 1/16 loop needed 233px; at 960 wide (below the window's minimum,
//   202px) it pushed the deck's contents out of its panel.
// - The FX row needed 270px: the effect name and On/Off were squeezed
//   below their text, and "Flanger" spilled out of its button.
// Below 320px the row now drops what's repeated elsewhere: a set hot cue
// shows its colour and time (the colour is the slot, as on the waveform;
// its number stays in the label and tooltip; a time past an hour ends in an
// ellipsis), an empty one its number; the loop's side buttons tighten;
// stems stack their dot over the name; FX loses its separators and the
// menu chevron and tightens its spacing.
export default {
  id: 'stress-narrow-strip',
  n: 8,
  title: 'Deck buttons fit the smallest window',
  group: 'Stability',
  notes: 'Below a 320px mode row (windows under about 1,180px wide): hot cues show colour + time or just the number, stems stack dot over name, FX drops separators and the chevron. Wider decks are unchanged.',
};

/** Show me: zooms the interface in until deck A's mode row is under 320px, with two hot cues set; flipping shows them running together (before) and fitting (after). */
export const show = {
  about: 'In the smallest window the hot cue, stem and effect buttons ran into each other ("1 Set2 Set3 Set") or got cut off. Now they drop what\'s shown elsewhere and fit.',
  before: 'With the window as small as it goes, the hot cue buttons overlap: their numbers and times run together and you can\'t tell which cue is which.',
  after: 'Each cue shows just its colour and time (or its number when empty), so all four fit side by side and stay readable.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const D = "[data-region='deck0']";
    for (const n of [1, 2]) {
      const b = app.$(`${D} button[aria-label='Set hot cue ${n}']`);
      if (b) {
        await app.click(b);
        await app.click(`${D} button[aria-label='Jump forward ${app.$(`${D} .transport .jumps .num`)?.textContent.trim() ?? 4} beats']`).catch(() => {});
      }
    }
    // Zoomed in so the window is as wide as the smallest one the app allows
    // (1024px in its own pixels), where the row is 234px.
    ctx.was = app.zoom(Math.max(1, innerWidth / 1024));
    await app.wait(200);
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
  },
  target: "[data-region='deck0'] .perf",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const mp = app.$("[data-region='deck0'] .perf")?.getBoundingClientRect();
    if (!mp) return;
    const before = ctx.phase === 'before';
    // The cue row, twice as big, beside it.
    const l = d.loupe('cues', { x: mp.x - 6, y: mp.y + mp.height / 2 - 22 }, { zoom: 2, size: { w: Math.min(760, (mp.width + 12) * 2), h: 88 }, near: mp, caption: '' });
    ctx.at = l.rect;
    d.text(l.at.x + 10, l.at.y + l.rect.height - 14, before ? 'hot cues run into each other' : 'each hot cue fits its own slot', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
