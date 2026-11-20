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
// Now the waveforms' bottom edge, the decks' bottom edge (the library's
// handle) and the sampler's top edge each get the library's grip, drawn at
// --fg-4 at rest and --fg-3 on hover, drag or focus. The sidebar's edge has
// no pill (beside a scrolling list it read as a scrollbar): an 8px strip on
// the divider shows the resize cursor, and the divider lights from top to
// bottom on hover, drag or focus. Each panel has one designed size, taken from the 1440×900 layout,
// which is its default, its snap point and its double-click reset:
//   waveforms   136px  flexible  96 to half the window  gentle 6px snap
//   decks       360px  fixed     340 to 400             firm 16px detent
//   sampler      40px  fixed     40 to 56               firm
//   library     the rest (a short window keeps 240 for it; a drag can
//               take it to 160), gentle snap where the waveforms
//               are at 136
//   sidebar     200px  flexible  160 to 320             gentle 6px snap
// Which neighbour gives way (owner's call 10, (a)): the decks move as one
// block; the waveforms' handle sizes the waveforms and the library gives
// way; the library's handle sizes the library and the waveforms give way;
// only ⌥-dragging either deck edge changes the decks. The sampler takes
// its strip from the library, so the decks never move when it opens.
// Keys on every grip: arrows ±24px, ⇧ ±96px, Home and End for min and max.
// A double-click settles back on the site's snappy spring (301ms; none
// under reduced motion); a drag follows the pointer with no easing.
//
// Sizes are kept in one key, oss-dj.panelSizes = { waves, decks, sidebar,
// sampler }; the library is the remainder. The old oss-dj.libraryHeight is
// read once to seed it. It's left in place while this is a flag so turning
// the flag off loses nothing; drop it when shipping. The size model is
// shared with #7 (App.svelte: rows, PANEL); this flag adds the grips, the
// memory and the sidebar. It marks the library's handle "dragging" itself,
// so it doesn't need #19 on. Settings' page list (#36) reads the same
// sidebar width (--library-sidebar).
export default {
  id: 'panel-sizes',
  n: 21,
  title: 'A grip on every panel edge, and designed sizes',
  group: 'Layout',
  notes:
    'Grips on the waveforms, library and sampler edges (visible at rest, brighter on hover); the sidebar divider lights on hover. Designed sizes: waveforms 136, decks 360 (⌥-drag, 340 to 400), sampler 40, sidebar 200; library the rest. Double-click resets with the site spring; sizes kept in oss-dj.panelSizes. The sampler shortens the library, never the decks.',
};

/** Show me: opens the sampler; flipping shows the decks shoved up and no grips (before), the decks in place and a grip on every edge (after). Replay drags the waveforms' edge and lets it spring back. */
export const show = {
  about: "Only the library's edge could be dragged, you couldn't see where to grab it, and opening the sampler shoved the decks up. Now every panel edge has a grip, each panel springs back to its designed size, and the decks never squash or stretch.",
  before: "There's one hidden handle, above the library. Open the sampler and the decks get 52px shorter: every button jumps up and the mixer's dials crowd together.",
  after: 'Every panel edge can be dragged: the waveforms, the library and the sampler have a faint grip, and the sidebar\'s divider lights up when you point at it, and a double-click springs it back to its designed size. The sampler takes its room from the library, so the decks stay exactly where they were.',
  period: 2000,
  async setup(app, ctx) {
    // #7 shares the size model; off for the show, so Before is today's app.
    ctx.tall = app.isOn('edge-tall');
    if (ctx.tall) app.setFlag('edge-tall', false);
    const sampler = () => app.$('section.library .bar .samp');
    ctx.opened = !app.$('.app.sampling');
    if (!ctx.opened) {
      await app.click(sampler());
      await app.wait(200);
    }
    // The decks with the sampler closed, flag off and on.
    ctx.parts = () => [app.deck(0), app.$('.mixer'), app.deck(1)];
    ctx.rest = app.both('panel-sizes', ctx.parts());
    await app.click(sampler());
    await app.until(() => app.$('.app.sampling'), 2000, 'the sampler');
    await app.wait(150);
  },
  cleanup(app, ctx) {
    if (ctx.opened && app.$('.app.sampling')) app.$('section.library .bar .samp')?.click();
    if (ctx.tall) app.setFlag('edge-tall', true);
  },
  target: (app) => [app.deck(0), app.$('.sampler')],
  badge: (app) => app.$('.mixer')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const rest = before ? ctx.rest.off : ctx.rest.on;
    const live = ctx.parts().map((e) => e?.getBoundingClientRect());
    if (!rest?.[0] || !live[0]) return;
    d.moved(rest[0], live[0], { what: 'decks', side: 'below', still: 'decks stay put with the sampler open' });
    if (before) return;
    // The grips, each with a small tag.
    const [waves, samp] = app.$$('.app > .grip');
    const grips = [
      [waves, 'waveforms'],
      [app.$('.app > .split'), 'library'],
      [samp, 'sampler'],
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
