// #105 (UI audit flag): Pebble's waveforms (waveform-2d.js calls these
// while the flag is on; the renderer's own drawing is untouched).
//
// The scrolling lane is a row of beads: one rounded capsule per beat
// subdivision, on the track's beat grid, so the beads never slide against
// the music. The subdivision is picked so a bead is 8 to 16px wide at the
// current zoom (a sixteenth at the default 12 s). Each bead holds the
// loudest moment of its slice, as nested capsules: lows outside, mids,
// the highs in the core: the lows a clear tone of the deck's colour (so the
// kick reads as strongly as the rest), the mids its colour, the highs its
// white; flat (no glow, no gradient). The overview is the same shape language at the track's
// scale: soft filled bands, flat.

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Bead width in CSS px for a beat of `beatPx`: the first halving that fits 8..16px. */
function beadPx(beatPx) {
  if (!(beatPx > 0)) return 8;
  let w = beatPx;
  while (w > 16) w /= 2;
  while (w < 8) w *= 2;
  return w;
}

function capsule(ctx, x, mid, w, hh) {
  const r = w / 2;
  hh = Math.max(hh, w);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, mid - hh / 2, w, hh, r);
  else ctx.rect(x, mid - hh / 2, w, hh);
  ctx.fill();
}

/**
 * Draws the lane from x0 to x1 (CSS px on the track's grid, bin = x * spp).
 * `wf` is the Waveform2D (for sample()), `beat` = [beatLen, firstBeat] in bins.
 */
export function pebbleLane(wf, ctx, x0, x1, spp, h, c, beat) {
  const [len, first] = beat;
  const beatPx = len > 0 ? len / spp : 0;
  const bw = beadPx(beatPx);
  const step = bw * spp; // bins per bead
  const origin = len > 0 ? first : 0;
  const mid = h / 2;
  const amp = h - 4;
  const gap = Math.max(2, Math.round(bw * 0.28));
  const w = Math.max(2, bw - gap);
  const j0 = Math.floor((x0 * spp - origin) / step) - 1;
  const j1 = Math.ceil((x1 * spp - origin) / step) + 1;
  ctx.globalCompositeOperation = 'source-over';
  const cols = [];
  for (let j = j0; j <= j1; j++) {
    const b = origin + j * step;
    const v = wf.sample(b, b + step);
    if (v) cols.push([j, v]);
  }
  /** @type {[(v: number[]) => number, string][]} */
  const layers = [
    [(v) => Math.max(v[0] * 0.95, v[1] * 0.62), rgba(c.mid, 0.4)],
    [(v) => v[1] * 0.62, rgba(c.mid, 1)],
    [(v) => v[2] * 0.34, rgba(c.high, 1)],
  ];
  layers.forEach(([f, fill], li) => {
    ctx.fillStyle = fill;
    for (const [j, v] of cols) {
      const a = f(v);
      if (a <= 0.02 && li > 0) continue;
      const x = (origin + j * step) / spp + gap / 2;
      capsule(ctx, x, mid, w, a * amp);
    }
  });
}

/**
 * The overview: the same beads at the track's scale, one every 6px (about
 * five seconds of a seven-minute track), each holding the loudest moment of
 * its stretch, so a breakdown is a run of small beads and a drop a run of
 * full ones. `cols` is one column per CSS px.
 */
export function pebbleOverview(x, cols, mid, c) {
  const pitch = 6;
  const w = 4;
  const amp = mid * 2 - 2;
  x.globalCompositeOperation = 'source-over';
  const beads = [];
  for (let i = 0; i + 1 <= cols.length; i += pitch) {
    const v = [0, 0, 0];
    for (let k = i; k < Math.min(cols.length, i + pitch); k++) for (let b = 0; b < 3; b++) v[b] = Math.max(v[b], cols[k][b]);
    beads.push([i, v]);
  }
  /** @type {[(v: number[]) => number, string][]} */
  const layers = [
    [(v) => Math.max(v[0] * 0.95, v[1] * 0.62), rgba(c.mid, 0.4)],
    [(v) => v[1] * 0.62, rgba(c.mid, 1)],
    [(v) => v[2] * 0.34, rgba(c.high, 1)],
  ];
  layers.forEach(([f, fill], li) => {
    x.fillStyle = fill;
    for (const [i, v] of beads) {
      const a = f(v);
      if (a <= 0.02 && li > 0) continue;
      capsule(x, i + (pitch - w) / 2, mid, w, a * amp);
    }
  });
}
