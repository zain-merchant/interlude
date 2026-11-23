// #114 (UI audit flag): wave-looks' drawing.
//
// What makes these as accurate as the stored levels allow:
//   - Levels are read bin by bin, each bin once, in the column its time falls
//     in. Nothing averages columns together, so a peak keeps its height.
//   - Smoothing runs after a hit (it lets the level fall slowly), never
//     before it, unless a look's "before" value asks for it. Today exact also
//     softens what's between hits, both ways, but never across one.
//   - A rise is drawn where its bin says the hit was, to the nearest device
//     pixel (LATE has the bands' own delays), and the outline is kept inside
//     the shape.
//   - The smoothed levels are worked out once for the whole track, not per
//     tile, so every tile agrees with its neighbours.
//   - Columns are one device pixel wide, and the beat lines are placed on
//     the same pixel grid as the sound.

const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** As waveform-2d.js's OFF: draws a shape off canvas so only its shadow shows. */
const OFF = 20000;
/** CSS px drawn past the view or tile, for the glow and the outline. */
const PAD = 32;
/** As waveform-2d.js's TILE. */
const TILE = 512;

/**
 * One band's level per bin, smoothed: a rise is instant, a fall has a time
 * constant of `after` bins; `before` bins lets it rise early.
 */
function envelope(v, after, before) {
  const n = v.length;
  const out = new Float32Array(n);
  const fall = after > 0.01 ? 1 - Math.exp(-1 / after) : 1;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const x = v[i];
    y = x > y ? x : y + (x - y) * fall;
    out[i] = y;
  }
  return early(out, before);
}

/** The "before" pass: a level that's about to rise starts rising `before` bins ahead. */
function early(out, before) {
  if (!(before > 0.01)) return out;
  const rise = 1 - Math.exp(-1 / before);
  let y = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const x = out[i];
    y = x > y ? x : y + (x - y) * rise;
    out[i] = y;
  }
  return out;
}

/**
 * Today's softness, kept off the hits: finds them (a rise of more than `hit`
 * of the band's height and by half as much again), smooths the level over
 * `radius` bins to either side between one hit and the next but never across
 * one, and keeps each hit's own peak and fall on top. So a hit starts and
 * peaks where it does in the sound, and only what's between hits is softened.
 * `ease` (0 to 1) rounds the peak over on its far side, across `round` bins.
 */
function between(v, after, before, radius, hit, ease, round) {
  const n = v.length;
  const held = envelope(v, after, 0);
  const R = Math.max(0, Math.round(radius / 2));
  const fall = Math.exp(-1 / Math.max(after, radius, 1));
  const T = Math.max(2, round);
  const starts = [0];
  let last = -9;
  for (let i = 1; i < n; i++) {
    const was = held[i - 1];
    if (v[i] > was + hit && v[i] > was * 1.5 && i - last > 3) starts.push((last = i));
  }
  // Two box passes (a triangle, as today's) inside each stretch, from running sums.
  let src = held;
  const sums = new Float64Array(n + 1);
  for (let pass = 0; R && pass < 2; pass++) {
    for (let i = 0; i < n; i++) sums[i + 1] = sums[i] + src[i];
    const dst = new Float32Array(n);
    for (let k = 0; k < starts.length; k++) {
      const s0 = starts[k];
      const s1 = starts[k + 1] ?? n;
      for (let i = s0; i < s1; i++) {
        const a = Math.max(s0, i - R);
        const b = Math.min(s1, i + R + 1);
        dst[i] = (sums[b] - sums[a]) / (b - a);
      }
    }
    src = dst;
  }
  const out = src === held ? Float32Array.from(held) : src;
  for (let k = 1; k < starts.length; k++) {
    // The hit itself: up with the sound while it builds (a few bins), to its
    // own peak. What the smoothing took off that peak is put back and let go
    // slowly, so the top has no spike on it.
    const s0 = starts[k];
    const s1 = Math.min(n, starts[k + 1] ?? n);
    let p = s0;
    for (let i = s0; i < Math.min(s1, s0 + 4); i++) if (v[i] > v[p]) p = i;
    for (let i = s0; i < p; i++) if (v[i] > out[i]) out[i] = v[i];
    const d = v[p] - out[p];
    let e = 1;
    for (let i = p; i < s1 && d > 0.002; i++, e *= fall) {
      const t = (i - p) / T;
      const cos = t < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * t) : 0;
      const k = e + (cos - e) * Math.min(1, ease * 2);
      if (k < 0.002) break;
      out[i] += d * k;
    }
  }
  return early(out, before);
}

/** The three bands' envelopes for this look at this zoom, kept until either changes. */
function envelopes(wf, o, spp) {
  const perMs = wf.lookBps / 1000; // bins in a millisecond
  // The softness between hits is in px, as today's is, so it grows with the
  // zoom: in quarter steps of doubling, so a zoom gesture doesn't work it
  // out afresh every frame.
  const px = 2 ** (Math.round(Math.log2(spp) * 4) / 4);
  const soft = (o.soft ?? 0) * px;
  const ease = (o.ease ?? 0) / 100;
  const after = [0, 1, 2].map((b) => o[`a${b}`] * perMs);
  const before = [0, 1, 2].map((b) => (o[`b${b}`] ?? 0) * perMs);
  const key = `${wf.version}|${after}|${before}|${soft}|${o.hit}|${ease}`;
  if (wf.lookEnv?.key !== key)
    wf.lookEnv = { key, v: [0, 1, 2].map((b) => (o.hit != null ? between(wf.bands[b], after[b], before[b], soft, o.hit / 100, ease, (3 + 9 * ease) * px) : envelope(wf.bands[b], after[b], before[b]))) };
  return wf.lookEnv.v;
}

/**
 * How late in its bin each band is drawn, in bins. A hit can be anywhere in
 * its bin, so on average it's half a bin after the bin's start; the analyser's
 * filters delay the bass by about 2.3 ms and the mids by 0.7 (measured on
 * synthesised kicks), which is that much already. Together every band's hits
 * come out on time on average.
 */
const LATE = [0.09, 0.38, 0.47];

/**
 * Column tops for device pixels k0 to k1: each band's level there. A bin
 * narrower than a column is its column's loudest; a wider one holds from its
 * start, easing into the next only if that's lower. A bin's start goes to
 * the nearest column edge, so rounding is as often late as early.
 */
function columns(wf, E, k0, k1, perCol) {
  const n = wf.count;
  const out = [];
  for (let b = 0; b < 3; b++) {
    const v = E[b];
    const a = new Float32Array(k1 - k0);
    for (let k = k0; k < k1; k++) {
      const t0 = (k - 0.5) * perCol - LATE[b];
      let i0 = Math.ceil(t0);
      const i1 = Math.ceil(t0 + perCol);
      let m = 0;
      if (i1 > i0) {
        // Bins that start in this column; and before the first, the tail of the one it opens in.
        for (i0 = Math.max(0, i0); i0 < i1 && i0 < n; i0++) if (v[i0] > m) m = v[i0];
      }
      const i = Math.floor(t0);
      if (i >= 0 && i < n) {
        const next = i + 1 < n ? v[i + 1] : 0;
        const hold = next < v[i] ? v[i] + (next - v[i]) * (t0 - i) : v[i];
        if (hold > m) m = hold;
      }
      a[k - k0] = m;
    }
    out.push(a);
  }
  return out;
}

/** Today's three tones as they land on the cavity, for the looks that draw solid. */
function tones(c) {
  const add = (bg, col, a) => bg.map((v, i) => Math.round(Math.min(255, v + col[i] * a)));
  const low = add([6, 6, 7], c.low, 0.5);
  const mid = add(low, c.mid, 0.38);
  return [low.map((v, i) => Math.round(Math.max(v, c.low[i] * 0.62))), mid, add(mid, c.high, 0.55)];
}

const COLOURS = ['low', 'mid', 'high'];
const ALPHA = [0.5, 0.38, 0.55];

/** The lane's shape, as Waveform2D.ribbonShape draws it (bands on `ctx`, the outline on `ectx`). */
export function lookLane(wf, ctx, ectx, x0, x1, spp, h, c, half) {
  const o = wf.wl;
  const mid = half === 'up' ? h : half === 'down' ? 0 : h / 2;
  const amp = half ? h : h / 2;
  const E = envelopes(wf, o, spp);
  if (o.draw === 'pills' || o.draw === 'ticks') return marks(wf, ectx, E, x0, x1, spp, mid, amp, c);
  // Columns to a CSS px: one per device pixel, or one per CSS px and no glow
  // while the zoom is moving (every frame is drawn from scratch then).
  const real = window.devicePixelRatio || 1;
  const dpr = wf.zooming ? 1 : real;
  const k0 = Math.floor((x0 - PAD) * dpr);
  const k1 = Math.ceil((x1 + PAD) * dpr);
  const cols = columns(wf, E, k0, k1, spp / dpr);
  const H = [o.h0 / 100, o.h1 / 100, o.h2 / 100];
  const heights = [0, 1, 2].map((b) => cols[b].map((v) => v * H[b] * amp));
  const n = k1 - k0;
  // The front corner of a hit's top, cut back in its first column, with the
  // peak in its second: still well past half its height where it did before,
  // and nothing off the peak.
  const ease = (o.ease ?? 0) / 100;
  if (ease > 0 && !wf.zooming)
    for (const a of heights)
      for (let i = n - 2; i > 0; i--) {
        const rise = a[i] - a[i - 1];
        if (rise < 2) continue;
        if (a[i] > a[i + 1]) a[i + 1] = a[i];
        a[i] -= ease * Math.min(0.35 * rise, 3);
      }
  const X = (i) => (k0 + i) / dpr; // the column's left edge

  // Each column is a step as wide as a device pixel: a rise is a straight
  // edge on its own pixel, not a ramp that starts a column early. Runs of
  // the same height are one point.
  const path = (g, a, dx = 0) => {
    g.beginPath();
    g.moveTo(X(0) + dx, mid);
    for (let i = 0; i < n; i++) {
      if (i && a[i] === a[i - 1]) continue;
      if (i) g.lineTo(X(i) + dx, mid - a[i - 1]);
      g.lineTo(X(i) + dx, mid - a[i]);
    }
    g.lineTo(X(n) + dx, mid - a[n - 1]);
    g.lineTo(X(n) + dx, mid + a[n - 1]);
    for (let i = n - 1; i >= 0; i--) {
      if (i && a[i] === a[i - 1]) continue;
      g.lineTo(X(i) + dx, mid + a[i]);
      if (i) g.lineTo(X(i) + dx, mid + a[i - 1]);
    }
    g.closePath();
  };

  {
    ctx.globalCompositeOperation = 'lighter';
    if (o.glow > 0 && !wf.zooming) {
      for (const [b, a, r] of [[0, 0.35, 12], [1, 0.22, 10]]) {
        path(ctx, heights[b], -OFF);
        ctx.shadowColor = rgba(c[COLOURS[b]], (a * 0.2 * o.glow) / 100);
        ctx.shadowBlur = r * real;
        ctx.shadowOffsetX = OFF * real;
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
      }
    }
    for (let b = 0; b < 3; b++) {
      path(ctx, heights[b]);
      const col = c[COLOURS[b]];
      if (o.grad > 0) {
        const g = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
        const a = ALPHA[b] * (1 - o.grad / 100);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(0.5, rgba(col, ALPHA[b]));
        g.addColorStop(1, rgba(col, a));
        ctx.fillStyle = g;
      } else ctx.fillStyle = rgba(col, ALPHA[b]);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (o.out > 0) {
    // A rim inside the shape: each column from its top down to where a line
    // this wide, kept inside, ends (the lowest top within its width, less its
    // width). Half of a stroked line would stand outside a hit's front edge
    // and draw it early, and above its peak.
    // Eased spikes have a thinner edge at their sides.
    const r = Math.max(1, Math.round(o.outw * dpr + (1 - o.outw * dpr) * ease));
    const top = new Float32Array(n);
    for (let i = 0; i < n; i++) top[i] = Math.max(heights[0][i], heights[1][i]);
    const inner = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = top[i];
      for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) if (top[j] < m) m = top[j];
      inner[i] = Math.max(0, m - o.outw);
    }
    ectx.fillStyle = rgba(c.high, o.out / 100);
    ectx.beginPath();
    for (const sign of [1, -1]) {
      ectx.moveTo(X(0), mid - sign * top[0]);
      for (let i = 1; i < n; i++) {
        if (top[i] === top[i - 1]) continue;
        ectx.lineTo(X(i), mid - sign * top[i - 1]);
        ectx.lineTo(X(i), mid - sign * top[i]);
      }
      ectx.lineTo(X(n), mid - sign * top[n - 1]);
      ectx.lineTo(X(n), mid - sign * inner[n - 1]);
      for (let i = n - 1; i > 0; i--) {
        if (inner[i] === inner[i - 1]) continue;
        ectx.lineTo(X(i), mid - sign * inner[i]);
        ectx.lineTo(X(i), mid - sign * inner[i - 1]);
      }
      ectx.lineTo(X(0), mid - sign * inner[0]);
      ectx.closePath();
    }
    ectx.fill();
  }
}

/** Parts of a beat the marks may stand on: every one of these keeps a mark on each quarter beat. */
const PARTS = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

/** The marks' pitch in CSS px and their origin: the part of a beat nearest width + gap, or width + gap itself. */
export function pitchOf(o, spp, beatLen, firstBeat) {
  const want = o.w + o.gap;
  if (!o.lock || !(beatLen > 0)) return { P: want, origin: 0 };
  const px = beatLen / spp;
  const off = (d) => Math.abs(Math.log(px / d / want));
  const part = PARTS.reduce((a, d) => (off(d) < off(a) ? d : a));
  return { P: px / part, origin: firstBeat / spp };
}

/**
 * The three levels cut into marks on one pitch, each mark holding all three,
 * nested. A mark stands at the middle of its stretch of time, so a hit on the
 * beat (or a little off it) lights the mark on the beat line; a hit between
 * two marks lights the nearer.
 */
function marks(wf, ctx, E, x0, x1, spp, mid, amp, c) {
  const o = wf.wl;
  const dpr = window.devicePixelRatio || 1;
  const { P, origin } = pitchOf(o, spp, wf.lookBeat[0], wf.lookBeat[1]);
  const A = amp - 1;
  const H = [o.h0 / 100, o.h1 / 100, o.h2 / 100];
  const snap = (x) => Math.round(x * dpr) / dpr;
  const w = Math.max(1 / dpr, Math.min(snap(o.w), Math.floor((P - 0.5) * dpr) / dpr));
  const lists = [[], [], []];
  const rest = [];
  const n = wf.count;
  for (let j = Math.floor((x0 - P * 2 - origin) / P); j <= Math.ceil((x1 + P - origin) / P); j++) {
    const xa = origin + j * P;
    const left = snap(xa);
    const v = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const e = E[b];
      const late = LATE[b];
      const i0 = Math.max(0, Math.ceil((xa - P / 2) * spp - late));
      const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil((xa + P / 2) * spp - late)));
      for (let i = i0; i < i1; i++) if (e[i] > v[b]) v[b] = e[i];
      v[b] *= H[b] * A;
    }
    if (Math.max(v[0], v[1], v[2]) < 0.04 * A) {
      rest.push(left);
      continue;
    }
    for (let b = 0; b < 3; b++) if (v[b] >= 0.6) lists[b].push([left, v[b]]);
  }
  const T = tones(c);
  for (let b = 0; b < 3; b++) {
    ctx.fillStyle = rgba(T[b]);
    ctx.beginPath();
    for (const [x, v] of lists[b]) {
      if (o.draw === 'pills') {
        const hh = Math.max(v, w / 2);
        ctx.roundRect(x, mid - hh, w, 2 * hh, w / 2);
      } else {
        const cx = x + w / 2;
        ctx.moveTo(cx, mid - v);
        ctx.quadraticCurveTo(cx + w, mid, cx, mid + v);
        ctx.quadraticCurveTo(cx - w, mid, cx, mid - v);
      }
    }
    ctx.fill();
  }
  ctx.fillStyle = rgba(T[1], 0.6);
  ctx.beginPath();
  for (const x of rest) ctx.rect(x + w / 2 - 0.75, mid - 0.75, 1.5, 1.5);
  ctx.fill();
}

/** The overview as marks, at the track's scale. True if it drew it (today's fills stay for the ribbons). */
export function lookOverview(wf, x, cols, w, mid, c) {
  const o = wf.wl;
  if (o.draw === 'ribbon') return false;
  const H = [o.h0 / 100, (o.h1 / 100) * (0.6 / 0.62), (o.h2 / 100) * (0.3 / 0.34)];
  const T = tones(c);
  x.globalCompositeOperation = 'source-over';
  const P = Math.max(2, Math.min(6, Math.round((o.w + o.gap) * 0.6 * 2) / 2));
  const dpr = window.devicePixelRatio || 1;
  const mw = Math.max(1, Math.round(((P * o.w) / (o.w + o.gap)) * dpr) / dpr);
  for (let b = 0; b < 3; b++) {
    x.fillStyle = rgba(T[b]);
    x.beginPath();
    for (let at = 0; at < w; at += P) {
      let m = 0;
      for (let k = Math.floor(at); k < Math.min(cols.length, at + P); k++) if (cols[k][b] > m) m = cols[k][b];
      const hh = Math.max(0.6, m * H[b] * mid);
      x.roundRect(at, mid - hh, mw, 2 * hh, Math.min(mw / 2, hh));
    }
    x.fill();
  }
  return true;
}

/**
 * The scrolling lane, as Waveform2D.ribbon does it (tiles placed on whole
 * device pixels, drawn straight onto the lane for a couple of frames after a
 * jump), but for two things. A tempo change (a nudge, the pitch fader) keeps
 * its tiles and places them stretched to fit; once the tempo holds, new ones
 * are drawn a tile a frame and swapped in. And while the zoom moves, the lane
 * is drawn coarser, as every frame is new.
 */
export function lookRibbon(wf, w, h, view, spp, c) {
  const { ctx, canvas } = wf;
  const dpr = window.devicePixelRatio || 1;
  const base = `${wf.version}|${canvas.height}|${dpr}|${wf.strict ? 1 : 0}|${wf.half}|${wf.wlKey}|${wf.lookBps}|${wf.lookBeat}`;
  wf.spare ??= [];
  const straight = (s) => {
    const off = view.start / s;
    ctx.save();
    ctx.translate(-Math.round(off * dpr) / dpr, 0);
    wf.ribbonShape(ctx, ctx, off, off + w, s, h, c, view.edge);
    ctx.restore();
  };
  wf.zooming = wf.lookSec !== undefined && view.sec !== wf.lookSec;
  wf.lookSec = view.sec;
  if (wf.zooming) {
    wf.lookTiles = wf.lookNext = null;
    wf.lookBusy = true; // drawn again, finer, once the zoom holds
    straight(spp);
    return;
  }
  let S = wf.lookTiles;
  if (!S || S.base !== base || S.colors !== c || Math.abs(S.spp / spp - 1) > 0.12) {
    if (S && S.base !== base) wf.spare = [];
    S = wf.lookTiles = { base, colors: c, spp, tiles: new Map() };
    wf.lookNext = null;
    wf.lookSteady = 0;
  }
  const range = (s) => [Math.floor(view.start / s / TILE), Math.floor((view.start + w * spp) / s / TILE)];
  const [first, last] = range(S.spp);
  let missing = 0;
  for (let t = first; t <= last; t++) if (!S.tiles.has(t)) missing++;
  if (missing > 1 && wf.lookSteady >= 3) wf.lookSteady = 0;
  wf.lookBusy = S.spp !== spp;
  if (++wf.lookSteady < 3) {
    straight(spp);
    return;
  }
  for (const [t, tile] of S.tiles) {
    if (t >= first - 1 && t <= last + 1) continue;
    S.tiles.delete(t);
    wf.spare.push(tile);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const at = (t) => Math.round(((t * TILE * S.spp - view.start) / spp) * dpr);
  for (let t = first; t <= last; t++) {
    let tile = S.tiles.get(t);
    if (!tile) S.tiles.set(t, (tile = wf.ribbonTile(t, S.spp, h, c, dpr, view.edge)));
    const x = at(t);
    const tw = S.spp === spp ? tile.bands.width : at(t + 1) - x;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tile.bands, x, 0, tw, tile.bands.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tile.edge, x, 0, tw, tile.edge.height);
  }
  ctx.restore();
  // The tempo moved: once it's held for a few frames, tiles at its own scale.
  if (S.spp === spp) return;
  wf.lookHeld = wf.lookSpp === spp ? wf.lookHeld + 1 : 0;
  wf.lookSpp = spp;
  if (wf.lookHeld < 8) return;
  let N = wf.lookNext;
  if (!N || N.spp !== spp || N.base !== base || N.colors !== c) N = wf.lookNext = { base, colors: c, spp, tiles: new Map() };
  const [a, b] = range(spp);
  for (let t = a; t <= b; t++) {
    if (N.tiles.has(t)) continue;
    N.tiles.set(t, wf.ribbonTile(t, spp, h, c, dpr, view.edge));
    return;
  }
  for (const tile of S.tiles.values()) wf.spare.push(tile);
  wf.lookTiles = N;
  wf.lookNext = null;
}

/** How strong each way of marking the beats is: a bar's line, a beat's line, a bar's ticks, a beat's ticks (CSS px long, then alpha). */
const MARKS = {
  full: { bar: 0.28, beat: 0.12, barTick: [5, 0.75], beatTick: [3, 0.4] },
  faint: { bar: 0.14, beat: 0.05, barTick: [5, 0.6], beatTick: [3, 0.34] },
  ticks: { bar: 0.14, beat: 0, barTick: [6, 0.7], beatTick: [4, 0.42] },
  none: { bar: 0, beat: 0, barTick: [0, 0], beatTick: [0, 0] },
  dots: { bar: 0.14, beat: 0, barTick: [5, 0.6], dot: 0.55 },
};

/**
 * Beat lines, bars stronger, as Waveform2D.beats draws them but with each
 * line's middle on its beat (they began there, and were rounded to whole CSS
 * px while the sound is placed on device px, so they wobbled against it).
 */
export function lookBeats(wf, w, h, view, spp) {
  const { ctx } = wf;
  const dpr = window.devicePixelRatio || 1;
  const len = view.beatLen;
  const m = MARKS[wf.wl.lines] ?? MARKS.full;
  const barsOnly = len / spp < 6;
  const off = Math.round((view.start / spp) * dpr);
  const mark = (x, y, ww, hh, a) => {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, ww, hh);
  };
  for (let b = Math.ceil((view.start - view.firstBeat) / len) - 1; ; b++) {
    const bx = (Math.round(((view.firstBeat + b * len) / spp - 0.5) * dpr) - off) / dpr;
    if (bx > w) break;
    const bar = ((b % 4) + 4) % 4 === 0;
    if (barsOnly && !bar) continue;
    const line = bar ? m.bar : m.beat;
    if (line) mark(bx, 0, 1, h, line);
    const tick = bar ? m.barTick : m.beatTick;
    if (tick) for (const y of [0, h - tick[0]]) mark(bx, y, 1, tick[0], tick[1]);
    else for (const y of [1, h - 3]) mark(bx - 0.5, y, 2, 2, m.dot);
  }
}
