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
