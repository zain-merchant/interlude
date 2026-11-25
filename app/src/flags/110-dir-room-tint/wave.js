// #110 (UI audit flag): dir-room-tint's waveform options, which Waveform.svelte
// hands the renderer while this flag is on. The overview's cue chips stand 3px
// clear of its top edge, all four corners round (they were cut off flat
// against it). Its lanes are drawn by ../114-wave-looks/wave.js.
/** @param {{ deck: number, mode: string }} _ */
export function waveOptions(_) {
  return { chipTop: 3 };
}
