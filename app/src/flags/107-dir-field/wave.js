// #107 (UI audit flag): Field's waveforms. waveform-2d.js hands the whole
// draw to fieldDraw() while the flag is on; with it off nothing here runs.
//
// The sound is printed on the deck's coloured sheet in that colour's own
// deep inks, darker toward the core: the lows a clear tone, the mids the
// deck's ink, the highs its darkest ink, with a crisp ink edge on the outer
// band. It's today's ribbon (the same columns, smoothing and three bands),
// drawn dark on light instead of light on dark, so nothing is blended
// additively. The played stretch is lifted toward the sheet by erasing part
// of the ink, so the canvas never needs to know the sheet's colour.
// Everything on top (play head, cues, loop, grid) is ink.
//
// Colours come from the theme as today (themeColors): --a-low/--deck-a/--a-high
// and the b set are the inks, --fg the black ink.

const TILE = 512;
const MARGIN = 32;
const STEP = 2;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Smoothed columns from x0 to x1 (CSS px on the track's grid), as the renderer's ribbon. */
function columns(wf, x0, x1, spp) {
  const dt = spp * STEP;
  const k0 = Math.floor((x0 - MARGIN) / STEP);
  const k1 = Math.ceil((x1 + MARGIN) / STEP);
  const raw = [];
  for (let k = k0 - 2; k <= k1 + 2; k++) {
    const at = k * dt;
    raw.push(wf.sample(at - dt / 2, at + dt / 2) ?? [0, 0, 0]);
  }
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
  return { cols, shift: k0 * STEP, step: STEP };
}

/** The three bands and the outer edge, printed. */
function print(ctx, cols, shift, step, mid, amp, c, edgeW = 1) {
  const band = (k, scale, color, a, soft) => {
    ctx.beginPath();
    ctx.moveTo(shift, mid);
    for (let i = 0; i < cols.length; i++) ctx.lineTo(shift + i * step, mid - cols[i][k] * scale * amp);
    for (let i = cols.length - 1; i >= 0; i--) ctx.lineTo(shift + i * step, mid + cols[i][k] * scale * amp);
    ctx.closePath();
    if (soft) {
      const g = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
      g.addColorStop(0, rgba(color, a * soft));
      g.addColorStop(0.5, rgba(color, a));
      g.addColorStop(1, rgba(color, a * soft));
      ctx.fillStyle = g;
    } else ctx.fillStyle = rgba(color, a);
    ctx.fill();
  };
  ctx.globalCompositeOperation = 'source-over';
  band(0, 0.95, c.low, 0.5, 0.55);
  band(1, 0.62, c.mid, 0.78, 0.7);
  band(2, 0.34, c.high, 0.92, 0);
  ctx.strokeStyle = rgba(c.mid, 0.85);
  ctx.lineWidth = edgeW;
  for (const sign of [1, -1]) {
    ctx.beginPath();
    cols.forEach((v, i) => {
      const y = mid - sign * Math.max(v[0] * 0.95, v[1] * 0.62) * amp;
      i ? ctx.lineTo(shift + i * step, y) : ctx.moveTo(shift, y);
    });
    ctx.stroke();
  }
}

function laneTile(wf, t, spp, h, c, dpr) {
  const F = wf.field;
  const el = F.spare.pop() ?? document.createElement('canvas');
  el.width = Math.round(TILE * dpr);
  el.height = wf.canvas.height;
  const x = el.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, el.width, el.height);
  x.setTransform(dpr, 0, 0, dpr, -t * TILE * dpr, 0);
  const { cols, shift, step } = columns(wf, t * TILE, (t + 1) * TILE, spp);
  print(x, cols, shift, step, h / 2, h / 2 - 1, c);
  return el;
}

function lane(wf, ctx, w, h, view, spp, c, dpr) {
  const key = `${wf.version}|${spp}|${wf.canvas.height}|${dpr}|${wf.strict ? 1 : 0}|field`;
  const F = (wf.field ??= { spare: [] });
  if (!F.tiles || F.key !== key || F.colors !== c) {
    if (F.tiles) for (const el of F.tiles.values()) F.spare.push(el);
    F.tiles = new Map();
    F.key = key;
    F.colors = c;
  }
  const off = view.start / spp;
  const first = Math.floor(off / TILE);
  const last = Math.floor((off + w) / TILE);
  for (const [t, el] of F.tiles) {
    if (t >= first - 1 && t <= last + 1) continue;
    F.tiles.delete(t);
    F.spare.push(el);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let t = first; t <= last; t++) {
    let el = F.tiles.get(t);
    if (!el) F.tiles.set(t, (el = laneTile(wf, t, spp, h, c, dpr)));
    ctx.drawImage(el, Math.round((t * TILE - off) * dpr), 0);
  }
  ctx.restore();
}

function overview(wf, ctx, w, h, c, dpr) {
  const key = `${wf.version}|${wf.canvas.width}|${wf.canvas.height}|${dpr}|field`;
  const F = (wf.field ??= { spare: [] });
  if (!F.ov || F.ov.key !== key || F.ov.colors !== c) {
    const el = document.createElement('canvas');
    el.width = wf.canvas.width;
    el.height = wf.canvas.height;
    const x = el.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = wf.overviewCols(Math.round(w));
    print(x, cols, 0, 1, h / 2, h / 2 - 1, c, 0.75);
    F.ov = { key, colors: c, el };
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(F.ov.el, 0, 0);
  ctx.restore();
}

/** The beat grid in ink: bars as hairlines, beats as ticks at the edges, a phrase a little stronger. */
function grid(ctx, w, h, view, spp, x, ink, dpr) {
  const len = view.beatLen;
  const first = Math.ceil((view.start - view.firstBeat) / len);
  const barsOnly = len / spp < 6;
  for (let b = first; ; b++) {
    const bx = Math.round(x(view.firstBeat + b * len));
    if (bx > w + 2) break;
    const n = ((b % 64) + 64) % 64;
    if (n === 0) {
      ctx.fillStyle = rgba(ink, 0.3);
      ctx.fillRect(bx - 1 / dpr, 0, 2 / dpr, h);
    } else if (n % 4 === 0) {
      ctx.fillStyle = rgba(ink, 0.13);
      ctx.fillRect(bx, 0, 1, h);
    } else if (!barsOnly) {
      ctx.fillStyle = rgba(ink, 0.16);
      ctx.fillRect(bx, 0, 1, 5);
      ctx.fillRect(bx, h - 5, 1, 5);
    }
  }
}

/** A hot cue's numbered chip on the overview: an ink tab, the number knocked out. */
function chip(ctx, cx, w, n, ink, font, top) {
  const cw = 12, ch = 12;
  const left = Math.max(0, Math.min(w - cw, Math.round(cx - cw / 2)));
  ctx.fillStyle = rgba(ink, 1);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, cw, ch, top ? 2 : [0, 0, 2, 2]);
  else ctx.rect(left, top, cw, ch);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 10px ${font ?? 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), left + cw / 2, top + ch / 2 + 0.5);
}

/** Draws the whole canvas for Field (the renderer has already resized it and checked for changes). */
export function fieldDraw(wf, view) {
  const { ctx, canvas } = wf;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  const spp = view.perPx * dpr;
  const x = (bin) => (bin - view.start) / spp;
  const c = view.colors;
  const ink = c.fg;
  wf.strict = !!view.clipStart;
  const scroll = view.mode === 'scroll';
  const loop = view.loopIn >= 0 && view.loopOut > view.loopIn;

  if (scroll && view.beatLen > 0) grid(ctx, w, h, view, spp, x, ink, dpr);
  if (loop) {
    const a = x(view.loopIn), b = x(view.loopOut);
    ctx.fillStyle = rgba(ink, view.looping ? 0.1 : 0.05);
    ctx.fillRect(a, 0, b - a, h);
  }
  if (wf.count) {
    if (scroll) lane(wf, ctx, w, h, view, spp, c, dpr);
    else overview(wf, ctx, w, h, c, dpr);
    // The played part: lift the ink toward the sheet.
    const px = Math.max(0, Math.min(w, x(view.playhead)));
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${scroll ? 0.6 : 0.58})`;
    ctx.fillRect(0, 0, px, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (loop) {
    ctx.fillStyle = rgba(ink, view.looping ? 0.9 : 0.4);
    ctx.fillRect(Math.round(x(view.loopIn)) - 0.5, 0, 1, h);
    ctx.fillRect(Math.round(x(view.loopOut)) - 0.5, 0, 1, h);
  }
  const chips = [];
  view.hotCues?.forEach((cue, i) => {
    if (cue < 0) return;
    const cx = x(cue);
    if (cx < -6 || cx > w + 6) return;
    ctx.fillStyle = rgba(ink, 0.85);
    ctx.fillRect(Math.round(cx) - 0.75, 0, 1.5, h);
    if (view.cueChips && !scroll) return chips.push([cx, i]);
    ctx.fillStyle = rgba(ink, 1);
    ctx.beginPath();
    ctx.moveTo(cx - 4, 0);
    ctx.lineTo(cx + 4, 0);
    ctx.lineTo(cx, 4);
    ctx.closePath();
    ctx.fill();
  });
  const rows = [];
  chips.sort((a, b) => a[0] - b[0]).forEach(([cx, i]) => {
    let row = 0;
    while ((rows[row] ?? -Infinity) > cx - 13) row++;
    rows[row] = cx;
    chip(ctx, cx, w, i + 1, ink, wf.font, row * 13);
  });
  if (view.cue >= 0) {
    const cx = x(view.cue);
    ctx.fillStyle = rgba(ink, 1);
    ctx.beginPath();
    ctx.moveTo(cx - 4, h);
    ctx.lineTo(cx + 4, h);
    ctx.lineTo(cx, h - 5);
    ctx.closePath();
    ctx.fill();
  }
  if (view.slip >= 0) {
    ctx.fillStyle = rgba(ink, 0.45);
    ctx.fillRect(Math.round(x(view.slip)) - 0.5, 0, 1, h);
  }
  if (view.playhead >= 0) {
    const p = x(view.playhead);
    // An ink rule with a paper hairline either side, so it reads on the darkest core.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(p - 2, 0, 4, h);
    ctx.fillStyle = rgba(ink, 1);
    ctx.fillRect(p - 1, 0, 2, h);
  }
}
