// #2: concentric corners wherever a rounded thing sits inset in another.
//
// A rounded control close to its container's rounded corner looks right
// only when the two curves share a centre: inner radius = outer radius −
// inset. Each nesting below is written as that sum, so it keeps working if
// the radius tokens or the spacing change. Where the inner radius would get
// too small (the toast's Undo, the banner's buttons) the outer one grows to
// inner + inset instead.
//
// Inventory (corner nestings, inset on both sides < outer radius):
//   waveforms panel → its zoom pill (8px in)                was 6, now 8
//   zoom pill → its − and + buttons (2px in)                was 4, now 6
//   library panel → nav items, bar controls, track list (8) already 8, now calc
//   track list → its rows (0px in)                          already, now calc
//   search field → its clear button (6px in)                was 4, now 2
//   sampler strip → its close button (8px in)               was 6, now 8
//   settings panel → its bar buttons (8px in)               already 8, now calc
//   beat-jump control → its ‹ › buttons (0px in)            already, now calc
//   context menu → its items (4px in)                       was 5, now 4
//   toast → Undo (6px in)                                   toast 8 → 12
//   banner → its buttons (8px in)                           banner 8 → 16
// Not nestings: the deck and mixer controls sit 16px in from 16px corners
// (inset = radius, so the concentric radius would be 0); the "Padded
// panels" setting tries growing those panels to control radius + padding.
// Dialog cards (Import, Report) pad 24–32px from 14px corners, so their
// contents are clear of the curve too.
export default {
  id: 'concentric',
  n: 2,
  title: 'Concentric inset corners',
  group: 'Shape',
  notes:
    'Inner radius = outer radius − inset wherever a rounded control sits near a rounded corner: zoom pill, clear button, sampler close, menu items, the toast and banner. "Grow" also rounds the deck and mixer panels to control radius + padding (24px), so their corner buttons are concentric too.',
  settings: {
    panels: {
      type: 'choice',
      options: [
        ['keep', 'Keep 16px'],
        ['grow', 'Grow decks'],
      ],
      default: 'keep',
      label: 'Padded panels',
    },
  },
};
