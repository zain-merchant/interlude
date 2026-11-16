// #12 (polish): tooltips that open like they belong to each other.
//
// Every tooltip waited 600 ms and then popped in at full strength, even
// when you'd just read the one next to it, so scanning a row of controls
// (the mixer's knobs, the transport) meant waiting at each one. With the
// flag on, the first tip still waits, then fades and rises in over a
// short, strong ease-out; moving straight on to the next control (within
// 300 ms) shows its tip at once with no entrance, as macOS does. Live
// readouts while dragging a knob or fader never animate. Hooks:
// tooltip.svelte.js (the skip), Tooltip.svelte (data-warm).
export default {
  id: 'polish-tooltip',
  n: 12,
  title: 'Tooltips: no wait when moving between them',
  group: 'Polish',
  notes: 'After the first tip, the next control\'s tip shows at once with no entrance. The first fades and rises 3px in over a strong ease-out.',
  settings: {
    ms: { type: 'range', min: 0, max: 250, step: 10, default: 140, unit: 'ms', label: 'Entrance' },
  },
};
