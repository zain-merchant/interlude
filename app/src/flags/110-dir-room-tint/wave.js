// #110 (UI audit flag): dir-room-tint's waveform hook.
//
// Today's renderer is kept on purpose: the waveform style is being explored
// separately and will be picked later. Waveform.svelte spreads this object
// into the options it hands the renderer while this flag is on, so a new
// style drops in here and nowhere else in the component:
//
//   - a look the renderer already knows: return { look: 'beads' } (105's
//     beads) or { look: 'ink' } (106's), or { veil: 'ground' } (108's veil);
//   - a new look: write its lane and overview drawers (see
//     105-dir-pebble/wave.js for the shape: lane(wf, ctx, x0, x1, spp, h,
//     colours, extra) and overview(x, cols, mid, colours)), then add it to
//     the look dispatch in waveform-2d.js. That dispatch is a two-way
//     ternary today (beads, else ink), so a third look has to be added
//     there explicitly, or it falls through to ink.
//
// `mode` is 'scroll' for the lanes and 'overview' for the deck's overview.
/** @param {{ deck: number, mode: string }} _ */
export function waveOptions(_) {
  return {};
}
