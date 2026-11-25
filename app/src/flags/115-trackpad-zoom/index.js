// #115 (UI audit flag): trackpad-zoom.
//
// Pinch on the waveforms zooms them, smoothly, about the play head; so do ⌘,
// Ctrl or ⌥ with a scroll, by how far it moved (it was 15% for every event,
// however small, so a trackpad jumped). Plain scroll still scratches a paused
// track. ⌘= ⌘− ⌘0 stay the interface's size and − = the waveform zoom keys.
export default {
  id: 'trackpad-zoom',
  n: 115,
  title: 'Pinch to zoom the waveforms',
  group: 'Controls',
  settings: {},
  notes: 'Hook: Waveform.svelte listens on the waveforms panel (zoom.js). Off, the canvas’s own ⌘/Ctrl + scroll is what there is.',
};
