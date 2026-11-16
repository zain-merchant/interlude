// #3: onto the 4px grid, and edges that should meet, meeting.
//
// Measured with getBoundingClientRect, the app was close to its 4px grid
// but not on it, and several lines that read as one across panels missed
// each other by a few pixels:
// - The deck header was 45px (a 28px title over a 17px artist line), so
//   every row below it sat a pixel off the grid.
// - The pitch column's nudge buttons ended 4px below the headphone
//   buttons beside them in the mixer, and the mode row.
// - The library sidebar's items ran 2px below the track rows next to them
//   (their heading was 18.3px tall, so they sat on fractional pixels too).
// - The mixer's centre column (Master, Cue mix, meters, Rec) sat on
//   fractional pixels, and Rec floated mid-column, lined up with nothing.
// - The waveform lanes' track names weren't centred on the zoom control's
//   line at the same height.
//
// Fixes: line boxes on 4px multiples; nudge, headphones and Rec end on
// the mode row's bottom line, 12px above the transport; the sidebar
// and track list share one 28px row pitch from the search bar down. The
// overlay setting draws the grid over the app to check by eye.
//
// Left as they are: the channel dials are spread with space-between, so
// they sit on quarter pixels (snapping them needs a hook in Mixer.svelte);
// the mode tabs are 33px (32 and their rule); the pitch readout is centred
// in its 28px row. There is no base-unit setting: the window padding,
// sampler height, waveform row and library row height are literals in
// App.svelte and Library.svelte, so a different unit would pull them apart.
export default {
  id: 'grid',
  n: 3,
  title: 'Onto the 4px grid, edges lined up',
  group: 'Layout',
  notes: 'Deck header 44px; nudge, headphone and Rec on the mode row\'s bottom line; sidebar and tracks on one 28px pitch; Master column on whole pixels; lane names centred on the zoom control. Overlay draws the grid.',
  settings: {
    overlay: {
      type: 'choice',
      options: [
        ['off', 'Off'],
        ['4', '4px'],
        ['16', '16px'],
      ],
      default: 'off',
      label: 'Grid overlay',
    },
  },
};
