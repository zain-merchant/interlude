// #4: the contrast of borders, on selected items and on cards.
//
// Every edge in the app comes from three tokens: --line (dividers: the
// tab underline rule, the library header, the sidebar edge, the crossfader
// rule), --line-2 (control outlines, the selected library row, menus,
// tooltips, the toast, sampler slots, key caps) and --glass-edge (the ring,
// top highlight and shadow of every glass panel). Recessed wells (search,
// waveforms, empty sampler slots) carry their own faint ring in
// --well-shadow. This flag swaps those tokens for a set of treatments to
// click through, and separately restyles the selected list items (library
// row, sidebar item, settings page). macOS Increase Contrast still wins.
export default {
  id: 'borders',
  n: 4,
  title: 'Clearer edges and selection',
  group: 'Controls',
  notes:
    'Edges: brighter, softer, a dark keyline, a top-lit edge, or a faint inner glow, applied to panels, dividers, outlines and wells together. Selected: how the selected library row and sidebar items are edged.',
  settings: {
    edge: {
      type: 'choice',
      label: 'Edges',
      default: 'toplit',
      options: [
        ['brighter', 'Brighter', 'Every edge a little stronger: panels separate clearly, at the cost of a busier screen.'],
        ['softer', 'Softer', 'Every edge fainter: calmer, but panels blur into each other on a dim screen.'],
        ['keyline', 'Dark keyline', 'A dark line just outside each panel, like a cut: crisp on bright backdrops, heavier overall.'],
        ['toplit', 'Top-lit', 'A brighter top edge, as if lit from above: panels lift off the background without more lines.'],
        ['glow', 'Inner glow', 'A soft light just inside each edge: the most glassy, and the softest edge.'],
      ],
    },
    selected: {
      type: 'choice',
      label: 'Selected',
      default: 'lit',
      options: [
        ['keep', 'As now', 'The selected row keeps its thin outline.'],
        ['ring', 'Brighter ring', 'The same outline, stronger, so the selection is easier to find.'],
        ['fill', 'Fill, no ring', 'A lighter fill and no outline: quiet and clean, but weaker on a dim screen.'],
        ['lit', 'Top-lit', 'A lit top edge like the panels, so the selected row reads as the one raised thing in the list.'],
      ],
    },
  },
};

/** Show me: loupes on deck A's edge and on the selected library row, flipping between today's edges and the chosen treatment. */
export const show = {
  about: 'Panel edges and the selected track were drawn with the same faint grey line, so the selected row was easy to lose. Now edges catch the light and the selection stands out.',
  before: 'Every panel is outlined by an even, faint grey line, and the selected track row gets only a thin outline: on a dark screen it is easy to lose.',
  after: "Panels get a lit top edge, like light from above, so they lift off the background, and the selected row gets the same lit edge so you can find it at a glance. (Edges and Selected in this flag's settings try other looks.)",
  async setup(app) {
    await app.selectRow(2);
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
  },
  target: (app) => [app.$("[data-region='tracks'] .row.sel")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const deck = app.deck(0)?.getBoundingClientRect();
    const row = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    if (deck) {
      const zoom = 7;
      const l = d.loupe('edge', { x: deck.x - 5, y: deck.y - 5 }, { zoom, size: { w: 420, h: 150 }, at: { x: deck.x + 90, y: deck.y + 30 }, caption: '' });
      ctx.at = l.rect;
      d.text(l.rect.x + 150, l.rect.y + 62, before ? 'top: a faint grey line' : 'top: a bright, lit edge', { tone: before ? 'bad' : 'ok', fixed: true });
      d.text(l.rect.x + 50, l.rect.bottom - 40, before ? 'sides: the same grey' : 'sides: fade away', { fixed: true });
      d.text(l.rect.x + 10, l.rect.bottom - 16, "deck A's top-left corner, 7× bigger", { fixed: true });
    }
    if (row) {
      const zoom = 4;
      const l = d.loupe('row', { x: row.x - 6, y: row.y - 10 }, { zoom, size: { w: 440, h: 192 }, at: { x: 600, y: 300 }, caption: '' });
      d.text(l.rect.x + 10, l.rect.y + 16, before ? 'selected row: a thin grey outline' : 'selected row: lit top edge, brighter fill', { tone: before ? 'bad' : 'ok', fixed: true });
      d.text(l.rect.x + 10, l.rect.bottom - 16, 'the selected track row, 4× bigger', { fixed: true });
    }
  },
};
