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
  title: 'Border contrast',
  group: 'Controls',
  notes:
    'Edges: brighter, softer, a dark keyline, a top-lit edge, or a faint inner glow, applied to panels, dividers, outlines and wells together. Selected: how the selected library row and sidebar items are edged.',
  settings: {
    edge: {
      type: 'choice',
      label: 'Edges',
      default: 'toplit',
      options: [
        ['brighter', 'Brighter'],
        ['softer', 'Softer'],
        ['keyline', 'Dark keyline'],
        ['toplit', 'Top-lit'],
        ['glow', 'Inner glow'],
      ],
    },
    selected: {
      type: 'choice',
      label: 'Selected',
      default: 'lit',
      options: [
        ['keep', 'As now'],
        ['ring', 'Brighter ring'],
        ['fill', 'Fill, no ring'],
        ['lit', 'Top-lit'],
      ],
    },
  },
};

/** Show me: loupes on a panel's edge and on the selected library row. */
export const show = {
  note: "Loupes on deck A's edge and the selected library row. Click through Edges and Selected under More, and turn the flag off to compare with today's.",
  async setup(app) {
    await app.selectRow(2);
  },
  target: (app) => [app.deck(0), app.$("[data-region='tracks'] .row.sel")],
  aid(d, app) {
    const deck = app.deck(0)?.getBoundingClientRect();
    const row = app.$("[data-region='tracks'] .row.sel")?.getBoundingClientRect();
    if (deck) d.loupe('edge', { x: deck.x - 6, y: deck.y - 6 }, { zoom: 5, size: { w: 260, h: 110 }, at: { x: 16, y: 14 }, caption: 'deck A edge, 5×' });
    if (row) d.loupe('row', { x: row.x - 6, y: row.y - 6 }, { zoom: 5, size: { w: 260, h: 110 }, at: { x: 290, y: 14 }, caption: 'selected row edge, 5×' });
  },
};
