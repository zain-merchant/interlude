// #106 (UI audit flag): Liner's waveforms (waveform-2d.js calls these while
// the flag is on; the renderer's own drawing is untouched).
//
// Printed ink: today's three mirrored bands and their shape, but each band
// a flat fill of its own tone, laid one over the other (no additive blend,
// no glow, no gradient), and the outer edge cut clean by the fill itself
// rather than a hairline. Columns sit on the track's grid, as today's do.

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const STEP = 2;
const MARGIN = 32;

function bands(ctx, cols, step, shift, mid, amp, c) {
  const fill = (k, s, color) => {
    ctx.beginPath();
    ctx.moveTo(shift, mid);
    for (let i = 0; i < cols.length; i++) ctx.lineTo(shift + i * step, mid - cols[i][k] * s * amp);
    for (let i = cols.length - 1; i >= 0; i--) ctx.lineTo(shift + i * step, mid + cols[i][k] * s * amp);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ctx.globalCompositeOperation = 'source-over';
  fill(0, 0.95, rgba(c.low, 0.85));
  fill(1, 0.62, rgba(c.mid, 0.8));
  fill(2, 0.34, rgba(c.high, 1));
}

/** The scrolling lane from x0 to x1 (CSS px on the track's grid). */
export function linerLane(wf, ctx, x0, x1, spp, h, c) {
  const dt = spp * STEP;
  const k0 = Math.floor((x0 - MARGIN) / STEP);
  const k1 = Math.ceil((x1 + MARGIN) / STEP);
  const raw = [];
  for (let k = k0 - 2; k <= k1 + 2; k++) raw.push(wf.sample(k * dt - dt / 2, k * dt + dt / 2) ?? [0, 0, 0]);
  const cols = [];
  for (let i = 2; i < raw.length - 2; i++) {
    const v = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let s = 0;
      for (let j = -2; j <= 2; j++) s += raw[i + j][k] * (3 - Math.abs(j));
      v[k] = s / 9;
    }
    cols.push(v);
  }
  bands(ctx, cols, STEP, k0 * STEP, h / 2, h / 2, c);
}

/** The overview: the same flat bands at the track's scale. */
export function linerOverview(x, cols, mid, c) {
  bands(x, cols, 1, 0, mid, mid, c);
}
