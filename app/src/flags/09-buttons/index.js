// #9: nicer normal buttons.
//
// The shared .btn (app.css) is a transparent control with a 1px outline at
// 11% white (--line-2), which also draws the mixer's headphone and Rec
// buttons and the toast's Undo. This flag offers whole styles to compare,
// applied to every normal button: Sync, the beat jump box, Sampler, the
// settings gear, Settings and dialog buttons, select menus, the mixer's
// headphone cue and Rec, and Undo. Play, Cue, ghost and primary buttons
// keep their own looks. The outline style takes a line weight and an edge
// strength; the others ignore them.
export default {
  id: 'buttons',
  n: 9,
  title: 'Button styles',
  group: 'Controls',
  notes:
    'Outline (tune weight and strength), tonal fill, glass, ghost with a fill, or raised keys. Hover, selected and pressed follow each style.',
  settings: {
    style: {
      type: 'choice',
      label: 'Style',
      default: 'tonal',
      options: [
        ['outline', 'Outline'],
        ['tonal', 'Tonal fill'],
        ['glass', 'Glass'],
        ['ghost', 'Ghost + fill'],
        ['raised', 'Raised'],
      ],
    },
    weight: { type: 'range', label: 'Outline weight', min: 0.5, max: 2, step: 0.25, default: 1, unit: 'px' },
    edge: { type: 'range', label: 'Outline strength', min: 0.5, max: 2.5, step: 0.1, default: 1 },
  },
};
