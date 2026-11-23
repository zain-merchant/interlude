// #21 (critique panel L2, owner's decision): a grip on every panel edge,
// and one designed size per panel.
//
// Only the edge above the library could be dragged, and its grip was
// invisible until you happened to hover the gap (C63). The rest of the
// layout was fixed, so opening the sampler squeezed the decks by 52px:
// every deck control jumped up and the mixer's dials crowded until their
// labels touched (C26, C47). On a laptop the library was tiny, and the
// waveforms and Settings couldn't be given more room.
//
// Now the waveforms' bottom edge and the decks' bottom edge (the library's
// handle) each get the library's grip, hidden at
// rest and drawn at --fg-3 on hover, drag or focus (round 2: grey pills at
// rest read as scrollbar thumbs). The sidebar's edge has
// no pill (beside a scrolling list it read as a scrollbar): an 8px strip on
// the divider shows the resize cursor, and the divider lights from top to
// bottom on hover, drag or focus. Each panel has one designed size, taken from the 1440×900 layout,
// which is its default, its snap point and its double-click reset:
//   waveforms   136px  flexible  96 to half the window  gentle 6px snap
//   decks       360px  fixed     340 to 400             firm 16px detent
//   library     the rest (a short window keeps 240 for it; a drag can
//               take it to 160), gentle snap where the waveforms
//               are at 136
//   sidebar     200px  flexible  160 to 320             gentle 6px snap
// Which neighbour gives way (owner's call 10, (a)): the decks move as one
// block; the waveforms' handle sizes the waveforms and the library gives
// way; the library's handle sizes the library and the waveforms give way;
// only ⌥-dragging either deck edge changes the decks. (Since the merge of
// upstream main the sampler is a row inside the library, so it has no edge
// of its own and never moves the decks.)
// Keys on every grip: arrows ±24px, ⇧ ±96px, Home and End for min and max.
// A double-click settles back on the site's snappy spring (301ms; none
// under reduced motion); a drag follows the pointer with no easing.
//
// Sizes are kept in one key, oss-dj.panelSizes = { waves, decks, sidebar }; the library is the remainder. The old oss-dj.libraryHeight is
// read once to seed it. It's left in place while this is a flag so turning
// the flag off loses nothing; drop it when shipping. The size model is
// shared with #7 (App.svelte: rows, PANEL); this flag adds the grips, the
// memory and the sidebar. It marks the library's handle "dragging" itself,
// as upstream's own handle now does.
export default {
  id: 'panel-sizes',
  n: 21,
  title: 'A grip on every panel edge, and designed sizes',
  group: 'Layout',
  notes:
    'Grips on the waveforms and library edges (hidden at rest, --fg-3 on hover, drag or focus); the sidebar divider lights on hover. Designed sizes: waveforms 136, decks 360 (⌥-drag, 340 to 400), sidebar 200; library the rest. Double-click resets with the site spring; sizes kept in oss-dj.panelSizes. (The sampler\'s grip went when upstream moved the sampler into the library.)',
};

/** Show me: flipping shows one hidden handle (before) and a grip on every panel edge (after). Replay drags the waveforms' edge and lets it spring back. */
export const show = {
  about: "Only the library's edge could be dragged, and you couldn't see where to grab it. Now the waveforms' edge and the sidebar can be dragged too, every grip lights when you reach for it, and each panel springs back to its designed size.",
  before: "There's one hidden handle, above the library. The waveforms and the sidebar are stuck at their size.",
  after: "Point at the gap under the waveforms or above the library and a grip lights up (the sidebar's divider lights the same way); drag it, or double-click to spring back to the designed size. The decks keep their size unless you ⌥-drag.",
  period: 2000,
  async setup(app, ctx) {
    // #7 shares the size model; off for the show, so Before is today's app.
    ctx.tall = app.isOn('edge-tall');
    if (ctx.tall) app.setFlag('edge-tall', false);
  },
  cleanup(app, ctx) {
    if (ctx.tall) app.setFlag('edge-tall', true);
  },
  target: (app) => [app.$('.app > .grip'), app.$('.app > .split'), app.$('.below > .grip.side')].filter(Boolean),
  badge: (app) => app.$('.mixer')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    if (ctx.phase === 'before') return;
    // The grips, each with a small tag.
    const grips = [
      [app.$('.app > .grip'), 'waveforms'],
      [app.$('.app > .split'), 'library'],
      [app.$('.below > .grip.side'), 'sidebar (lights on hover)'],
    ];
    for (const [el, what] of grips) {
      const r = el?.querySelector('i')?.getBoundingClientRect();
      if (!r) continue;
      d.circle(r.x + r.width / 2, r.y + r.height / 2, 22, { c: d.C.ink, w: 1.5 });
      d.text(r.right + 26, r.y + r.height / 2, `grip: ${what}`, { tone: 'ok' });
    }
  },
  /** Drags the waveforms' edge 80px down, holds, and lets it spring back with a double-click. */
  async replay(app) {
    const g = app.$('.app > .grip');
    if (!g) return;
    g.setPointerCapture = () => {};
    const r = g.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const at = (y, b = 1) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: b, pointerId: 1, isPrimary: true, pointerType: 'mouse' });
    g.dispatchEvent(new PointerEvent('pointerdown', at(y0)));
    for (let i = 1; i <= 16; i++) {
      await app.wait(25);
      g.dispatchEvent(new PointerEvent('pointermove', at(y0 + (80 * i) / 16)));
    }
    g.dispatchEvent(new PointerEvent('pointerup', at(y0 + 80, 0)));
    await app.wait(700);
    g.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y0 + 80 }));
    delete g.setPointerCapture;
  },
};
