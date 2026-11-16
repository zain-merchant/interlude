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
  title: 'Mode row fits the smallest window',
  group: 'Stability',
  notes: 'Below a 320px mode row (windows under about 1,180px wide): hot cues show colour + time or just the number, stems stack dot over name, FX drops separators and the chevron. Wider decks are unchanged.',
};

/** Show me: zooms the interface in until deck A's mode row is under 320px, with hot cues set. */
export const show = {
  note: "Only applies when a deck's mode row is under 320px (windows under about 1,180px wide), so this zoomed the interface in (⌘=) until it is, and set two hot cues on deck A. The bar measures the row. On: set cues show colour + time, empty ones their number, nothing overlaps; off: \"1 Set2 Set\" runs together. Try the Stems and FX tabs too. Done puts the zoom back.",
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
    ctx.was = app.zoom(1);
    for (const z of [1.1, 1.25, 1.5, 1.75]) {
      if (app.$(`${D} .mp`).offsetWidth < 320) break;
      app.zoom(z);
      await app.wait(150);
    }
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
  },
  target: "[data-region='deck0'] .mp",
  aid(d, app) {
    const mp = app.$("[data-region='deck0'] .mp");
    const r = mp?.getBoundingClientRect();
    if (!r) return;
    const w = mp.offsetWidth;
    d.measure(r.left, r.top - 8, r.right, r.top - 8, { above: true, c: w < 320 ? d.C.ok : d.C.bad, label: `mode row ${w}px (applies under 320)` });
  },
};
