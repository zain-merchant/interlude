// Direction 110's waveform, "Today exact", as one string for the renderer's
// view, '' for the app's own drawing. wave.js draws it: a level per band per
// bin, smoothed only after a hit, at one device pixel a column.
import { flag } from '../registry.svelte.js';

const LOOK = JSON.stringify({
  lines: 'seam',
  a0: 25, a1: 22, a2: 18, b0: 0, b1: 0, b2: 0, // smoothing after and before a hit, in ms: bass, mids, highs
  soft: 4, hit: 15, ease: 50,
  h0: 95, h1: 62, h2: 34, // heights, in %
  rim: 35, outw: 1, glow: 100, grad: 65,
});
export const lookString = () => (flag('dir-room-tint') ? LOOK : '');
