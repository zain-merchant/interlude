// Canvas waveform styles for the round-2 prototypes. Each draw function
// gets a 2D context sized in CSS pixels (already scaled for DPR), the deck's
// data, the playhead time and a palette. They redraw every frame.
import { sample, BINS_PER_SEC } from './track.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function grid(ctx, w, h, t, spp, beat, color, strong) {
  const t0 = t - (w / 2) * spp;
  const first = Math.ceil(t0 / beat);
  for (let b = first; ; b++) {
    const x = (b * beat - t0) / spp;
    if (x > w) break;
    const bar = b % 4 === 0;
    ctx.fillStyle = bar ? strong : color;
    ctx.fillRect(Math.round(x), 0, 1, h);
  }
}

/** Pro-Q style: smooth mirrored bands with translucent fills and a soft glow. */
export function ribbon(ctx, w, h, d, t, o) {
  const spp = o.seconds / w;
  // side: 'up' grows from the bottom edge, 'down' hangs from the top edge,
  // otherwise the shape is mirrored around the centre.
  const side = o.side === 'up' ? 1 : o.side === 'down' ? -1 : 0;
  const mid = side === 1 ? h : side === -1 ? 0 : h / 2;
  const amp = side ? h * 0.96 : h / 2;
  const step = 2;
  const cols = [];
  for (let x = 0; x <= w; x += step) {
    const tt = t + (x - w / 2) * spp;
    cols.push(sample(d, tt - spp * step / 2, tt + spp * step / 2) ?? [0, 0, 0]);
  }
  // Smooth with a small kernel so the shapes read as liquid, not jagged.
  const sm = cols.map((_, i) => [0, 1, 2].map((k) => {
    let s = 0, c = 0;
    for (let j = -2; j <= 2; j++) { const v = cols[i + j]; if (v) { s += v[k] * (3 - Math.abs(j)); c += 3 - Math.abs(j); } }
    return s / c;
  }));
  if (o.grid) grid(ctx, w, h, t, spp, d.beat, o.grid, o.gridStrong ?? o.grid);
  const layer = (k, scale, color, alpha, blur) => {
    ctx.beginPath();
    ctx.moveTo(0, mid);
    const up = side === -1 ? -1 : 1;
    sm.forEach((v, i) => ctx.lineTo(i * step, mid - up * v[k] * scale * amp));
    if (side) ctx.lineTo(w, mid);
    else for (let i = sm.length - 1; i >= 0; i--) ctx.lineTo(i * step, mid + sm[i][k] * scale * amp);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (side) {
      g.addColorStop(side === 1 ? 1 : 0, rgba(color, alpha));
      g.addColorStop(side === 1 ? 0 : 1, rgba(color, alpha * 0.3));
    } else {
      g.addColorStop(0, rgba(color, alpha * 0.35));
      g.addColorStop(0.5, rgba(color, alpha));
      g.addColorStop(1, rgba(color, alpha * 0.35));
    }
    ctx.fillStyle = g;
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.fill();
    ctx.filter = 'none';
  };
  ctx.globalCompositeOperation = 'lighter';
  if (o.glow) {
    layer(0, 0.95, o.low, 0.35 * o.glow, 12);
    layer(1, 0.62, o.mid, 0.22 * o.glow, 10);
  }
  layer(0, 0.95, o.low, 0.5);
  layer(1, 0.62, o.mid, 0.38);
  layer(2, 0.34, o.high, 0.55);
  ctx.globalCompositeOperation = 'source-over';
  // A crisp edge on the outer band so the shape reads sharp under the glow.
  for (const sign of side ? [side] : [1, -1]) {
    ctx.beginPath();
    sm.forEach((v, i) => {
      const y = mid - sign * Math.max(v[0] * 0.95, v[1] * 0.62) * amp;
      i ? ctx.lineTo(i * step, y) : ctx.moveTo(0, y);
    });
    ctx.strokeStyle = rgba(o.edge ?? o.high, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Played part: a dark veil so the future is what pops.
  ctx.fillStyle = o.past ?? 'rgba(8,8,10,0.6)';
  ctx.fillRect(0, 0, w / 2, h);
  playhead(ctx, w, h, o);
}

function playhead(ctx, w, h, o) {
  const x = Math.round(w / 2);
  if (o.headGlow) {
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, rgba(o.headGlow, 0.22));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, 0, 28, h);
  }
  ctx.fillStyle = o.head ?? '#fff';
  ctx.fillRect(x - 0.5, 0, 1.5, h);
}

/** TE style: thin rounded columns, white ahead, grey behind, beats marked. */
export function bars(ctx, w, h, d, t, o) {
  const spp = o.seconds / w;
  const gap = o.gap ?? 3, bw = o.bw ?? 2;
  const mid = h / 2;
  for (let x = 0; x < w; x += gap) {
    const tt = t + (x - w / 2) * spp;
    const v = sample(d, tt, tt + spp * gap);
    if (!v) continue;
    const e = Math.min(1, v[0] * 0.55 + v[1] * 0.35 + v[2] * 0.3);
    const hh = Math.max(1.5, e * (h * 0.46));
    const past = x < w / 2;
    // Colour by which band dominates, like a spectrum, but muted.
    let c = o.ahead ?? '#ecebe6';
    if (o.tint) c = v[0] > v[1] * 1.3 ? o.low : v[1] > v[2] ? o.mid : o.high;
    ctx.fillStyle = past ? (o.behind ?? '#3a3b40') : c;
    const r = bw / 2;
    roundRect(ctx, x, mid - hh, bw, hh * 2, r);
  }
  playhead(ctx, w, h, o);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Layer It / Kick 3 style: a fine envelope line with a band-coloured glow fill. */
export function scope(ctx, w, h, d, t, o) {
  const spp = o.seconds / w;
  const mid = h / 2;
  if (o.grid) grid(ctx, w, h, t, spp, d.beat, o.grid, o.gridStrong ?? o.grid);
  const pts = [];
  for (let x = 0; x <= w; x += 1.5) {
    const tt = t + (x - w / 2) * spp;
    const v = sample(d, tt, tt + spp * 1.5) ?? [0, 0, 0];
    pts.push([x, v]);
  }
  const fill = (k, scale, color, a) => {
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (const [x, v] of pts) ctx.lineTo(x, mid - v[k] * scale * mid);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], mid + pts[i][1][k] * scale * mid);
    ctx.fillStyle = rgba(color, a);
    ctx.fill();
  };
  ctx.globalCompositeOperation = 'lighter';
  fill(0, 0.92, o.low, 0.28);
  fill(1, 0.6, o.mid, 0.18);
  ctx.globalCompositeOperation = 'source-over';
  const line = (sign) => {
    ctx.beginPath();
    pts.forEach(([x, v], i) => {
      const e = Math.min(1, v[0] * 0.7 + v[1] * 0.4 + v[2] * 0.35);
      const y = mid - sign * e * mid * 0.92;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = o.line ?? '#f4f3ee';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };
  line(1);
  line(-1);
  ctx.fillStyle = o.past ?? 'rgba(8,8,10,0.55)';
  ctx.fillRect(0, 0, w / 2, h);
  playhead(ctx, w, h, o);
}

/** Ridgeline: the next bars stacked into the distance, nearest at the bottom. */
export function ridge(ctx, w, h, d, t, o) {
  const rows = o.rows ?? 26;
  const span = d.beat * 4; // one bar per row
  const bar0 = Math.floor(t / span);
  const horizon = h * 0.06;
  ctx.lineJoin = 'round';
  for (let r = rows - 1; r >= -1; r--) {
    const z = (r + ((t / span) % 1) * -1 + 1) / rows; // 0 near .. 1 far, scrolls toward you
    if (z < 0 || z > 1.05) continue;
    const persp = 1 - z * 0.62;
    const y = horizon + (h - horizon) * (1 - z) ** 1.35;
    const rowW = w * persp;
    const x0 = (w - rowW) / 2;
    const amp = h * 0.32 * persp;
    const tStart = (bar0 + r) * span;
    const pts = [];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const tt = tStart + (i / N) * span;
      const v = sample(d, tt, tt + span / N) ?? [0, 0, 0];
      const e = Math.min(1, v[0] * 0.65 + v[1] * 0.35 + v[2] * 0.25);
      // Taper the edges so each ridge rises from the floor.
      const edge = Math.sin((i / N) * Math.PI) ** 0.6;
      pts.push([x0 + (i / N) * rowW, y - e * amp * edge, v]);
    }
    ctx.beginPath();
    ctx.moveTo(x0, y);
    for (const [x, yy] of pts) ctx.lineTo(x, yy);
    ctx.lineTo(x0 + rowW, y);
    ctx.closePath();
    ctx.fillStyle = o.bg;
    ctx.fill();
    const fade = Math.max(0, 1 - z * 1.05);
    const near = r === 0;
    ctx.strokeStyle = near ? o.accent : rgba(o.line, 0.15 + 0.85 * fade);
    ctx.lineWidth = near ? 2 : 1.2 * persp + 0.2;
    if (near && o.glow) { ctx.shadowColor = o.accent; ctx.shadowBlur = 14; }
    ctx.beginPath();
    pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/** A ring: the whole track around a platter, played arc lit, playhead on top. */
export function radial(ctx, w, h, d, t, o) {
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) / 2 - (o.pad ?? 6);
  const inner = R * (o.inner ?? 0.72);
  const N = o.spokes ?? 220;
  const played = t / d.length;
  ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = sample(d, f * d.length, (f + 1 / N) * d.length) ?? [0, 0, 0];
    const e = Math.min(1, v[0] * 0.6 + v[1] * 0.35 + v[2] * 0.3);
    const a = -Math.PI / 2 + f * Math.PI * 2;
    const len = 2 + e * (R - inner);
    const c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = f < played ? o.played : o.ahead;
    ctx.lineWidth = o.spokeW ?? 2;
    ctx.beginPath();
    ctx.moveTo(cx + c * inner, cy + s * inner);
    ctx.lineTo(cx + c * (inner + len), cy + s * (inner + len));
    ctx.stroke();
  }
  const a = -Math.PI / 2 + played * Math.PI * 2;
  ctx.strokeStyle = o.head ?? '#fff';
  ctx.lineWidth = 2;
  if (o.glow) { ctx.shadowColor = o.headGlow ?? '#fff'; ctx.shadowBlur = 10; }
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * (inner - 6), cy + Math.sin(a) * (inner - 6));
  ctx.lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4));
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Whole-track overview as a thin filled strip, played part dimmed. */
export function overview(ctx, w, h, d, t, o) {
  const mid = o.bottom ? h : h / 2;
  const scale = o.bottom ? h : h / 2;
  const cols = [];
  for (let x = 0; x < w; x++) cols.push(sample(d, (x / w) * d.length, ((x + 1) / w) * d.length) ?? [0, 0, 0]);
  // Peaks per pixel are spiky over a whole track; ease them toward a local mean.
  for (let k = 0; k < 3; k++) {
    const src = cols.map((v) => v[k]);
    cols.forEach((v, x) => {
      let s = 0, c = 0;
      for (let j = -3; j <= 3; j++) if (src[x + j] !== undefined) { s += src[x + j]; c++; }
      v[k] = src[x] * 0.45 + (s / c) * 0.55;
    });
  }
  const px = (t / d.length) * w;
  const band = (k, s, color) => {
    ctx.beginPath();
    ctx.moveTo(0, mid);
    cols.forEach((v, x) => ctx.lineTo(x, mid - v[k] * s * scale));
    if (o.bottom) { ctx.lineTo(w, mid); }
    else for (let x = w - 1; x >= 0; x--) ctx.lineTo(x, mid + cols[x][k] * s * scale);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ctx.globalCompositeOperation = 'lighter';
  band(0, 0.95, rgba(o.low, 0.55));
  band(1, 0.6, rgba(o.mid, 0.4));
  band(2, 0.3, rgba(o.high, 0.45));
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = o.past ?? 'rgba(8,8,10,0.62)';
  ctx.fillRect(0, 0, px, h);
  ctx.fillStyle = o.head ?? '#fff';
  ctx.fillRect(px - 0.75, 0, 1.5, h);
}

/** Dot matrix, like a small OLED: quantised columns of square pixels. */
export function dots(ctx, w, h, d, t, o) {
  const spp = o.seconds / w;
  const cell = o.cell ?? 4, dot = o.dot ?? 2.6;
  const rows = Math.floor(h / cell);
  const midRow = rows / 2;
  for (let x = 0; x < w; x += cell) {
    const tt = t + (x - w / 2) * spp;
    const v = sample(d, tt, tt + spp * cell);
    if (!v) continue;
    const e = Math.min(1, v[0] * 0.6 + v[1] * 0.35 + v[2] * 0.3);
    const lit = Math.round(e * midRow);
    const past = x < w / 2;
    for (let r = 0; r < rows; r++) {
      const dist = Math.abs(r + 0.5 - midRow);
      const on = dist < lit;
      if (!on && !o.ghost) continue;
      ctx.fillStyle = on ? (past ? o.behind : dist > lit - 1.5 && v[2] > 0.35 ? o.peak : o.ahead) : o.ghost;
      ctx.fillRect(x, r * cell, dot, dot);
    }
  }
  ctx.fillStyle = o.head ?? '#fff';
  ctx.fillRect(Math.round(w / 2), 0, 1.5, h);
}

export const BIN = BINS_PER_SEC;
