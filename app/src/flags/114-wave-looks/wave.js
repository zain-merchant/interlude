// The waveform direction 110 draws (look.js has its values).
//
// What makes these as accurate as the stored levels allow:
//   - Levels are read bin by bin, each bin once, in the column its time falls
//     in. Nothing averages columns together, so a peak keeps its height.
//   - Smoothing runs after a hit (it lets the level fall slowly), never
//     before it. It also softens what's
//     between hits, both ways, but never across one.
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
  const R = Math.max(0, Math.round((radius * (1 + 0.75 * ease)) / 2));
  const fall = Math.exp(-1 / Math.max(after, radius, 1));
  const T = Math.max(2, round);
  const starts = [0];
  let last = -9;
  for (let i = 1; i < n; i++) {
    const was = held[i - 1];
    if (v[i] > was + hit && v[i] > was * 1.5 && i - last > 3) starts.push((last = i));
  }
  // Two box passes (a triangle, as today's) inside each stretch, from running sums.
  // Eased, the level smoothed is one that falls slower, so the valleys between hits fill.
  let src = ease > 0 ? envelope(v, after * (1 + 2 * ease), 0) : held;
  const top = src;
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
  const out = src === top ? Float32Array.from(top) : src;
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
    wf.lookEnv = { key, v: [0, 1, 2].map((b) => (o.hit != null ? between(wf.bands[b], after[b], before[b], soft, o.hit / 100, ease, (3 + 17 * ease) * px) : envelope(wf.bands[b], after[b], before[b]))) };
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
/** A rise between two bins that's drawn as a slope, not an edge: well under the smallest hit. */
const SLOPE = 0.08;

/**
 * Column tops for device pixels k0 to k1: each band's level there. A bin
 * narrower than a column is its column's loudest; a wider one holds from its
 * start, easing into the next only if that's lower or barely higher (a swell,
 * not a hit). A bin's start goes to
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
        const hold = next < v[i] + SLOPE ? v[i] + (next - v[i]) * (t0 - i) : v[i];
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
export function lookLane(wf, ctx, ectx, x0, x1, spp, h, c) {
  const o = wf.wl;
  const mid = h / 2;
  const amp = h / 2;
  const E = envelopes(wf, o, spp);
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
        a[i] -= ease * Math.min(0.2 * rise, 3);
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
  if (o.rim > 0) {
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
    ectx.fillStyle = rgba(c.high, o.rim / 100);
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
  const base = `${wf.version}|${canvas.height}|${dpr}|${wf.strict ? 1 : 0}|${wf.wlKey}|${wf.lookBps}|${wf.lookBeat}`;
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
  if (!S || S.base !== base || S.colors !== c || Math.abs(S.spp / spp - 1) > 0.35) {
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
    const tw = at(t + 1) - x; // up to the next tile, so no gap shows where the pixel ratio isn't whole
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

/**
 * Each way of drawing the beats. `edge`: where the ticks stand ('seam' is the
 * line between the lanes, 'all' both edges of each lane). `tick`: lengths (CSS
 * px) and alphas of a beat's and a bar's; `live`: the same while they're being
 * used; `line`: alphas of their full-height lines.
 */
const MARKS = {
  seam: { edge: 'seam', tick: [[3, 0.36], [6, 0.7]], live: [[4, 0.65], [8, 0.95]] },
  full: { edge: 'all', tick: [[3, 0.4], [5, 0.75]], line: [0.12, 0.28] },
};

/**
 * The beats and bars, the same ones Waveform2D.beats marks: every beat, a bar
 * every four from the first downbeat, and bars only where a beat is under 6
 * px. Each mark's middle is on its beat and on the pixel grid the sound is
 * placed on (there, a mark begins on its beat and is rounded to whole CSS px,
 * so it wobbles against the sound). In Grid mode they're drawn in full.
 */
export function lookBeats(wf, w, h, view, spp) {
  const { ctx, wl } = wf;
  const dpr = window.devicePixelRatio || 1;
  const len = view.beatLen;
  const m = view.live === 2 ? MARKS.full : MARKS[wl.lines] ?? MARKS.seam;
  // Stronger while they're used, over a few frames, not at a stroke.
  const want = view.live ? 1 : 0;
  wf.lookLive = wf.lookLive === undefined ? want : wf.lookLive + (want - wf.lookLive) * 0.25;
  if (Math.abs(want - wf.lookLive) < 0.02) wf.lookLive = want;
  else wf.lookBusy = true;
  const tick = [0, 1].map((k) => {
    const [a, b] = [m.tick?.[k] ?? [0, 0], (m.live ?? m.tick)?.[k] ?? [0, 0]];
    return [Math.round((a[0] + (b[0] - a[0]) * wf.lookLive) * dpr) / dpr, a[1] + (b[1] - a[1]) * wf.lookLive];
  });
  const barsOnly = len / spp < 6;
  const off = Math.round((view.start / spp) * dpr);
  const bottom = view.deck === 0; // the left deck's lane is on top: the line between the lanes is its bottom edge
  const ends = m.edge === 'all' ? [true, false] : m.edge === 'seam' ? [bottom] : [];
  for (let b = Math.ceil((view.start - view.firstBeat) / len) - 1; ; b++) {
    const bx = (Math.round(((view.firstBeat + b * len) / spp - 0.5) * dpr) - off) / dpr;
    if (bx > w) break;
    const bar = ((b % 4) + 4) % 4 === 0;
    if (barsOnly && !bar) continue;
    const k = bar ? 1 : 0;
    const line = m.line?.[k];
    if (line) {
      ctx.fillStyle = `rgba(255,255,255,${line})`;
      ctx.fillRect(bx, 0, 1, h);
    }
    const [tl, ta] = tick[k];
    if (!tl) continue;
    ctx.fillStyle = `rgba(255,255,255,${ta})`;
    for (const e of ends) ctx.fillRect(bx, e ? h - tl : 0, 1, tl);
  }
}

/** The bar the play head is in, quieter than a white pill on it: small figures at its top, on the played side. */
export function lookBar(wf, h, view, x) {
  const bar = Math.floor((view.playhead - view.firstBeat) / view.beatLen / 4) + 1;
  if (bar < 1) return;
  const { ctx } = wf;
  const label = String(bar);
  ctx.font = `600 10px ${view.labelFont ? `${view.labelFont}, ` : ''}"Geist Variable", system-ui, sans-serif`;
  const tw = Math.ceil(ctx.measureText(label).width) + 8;
  const left = x(view.playhead) - tw - 0.75;
  const top = 0; // clear of the hot cues' chips, at each lane's foot
  ctx.fillStyle = 'rgba(6,6,7,0.78)';
  ctx.beginPath();
  ctx.roundRect(left, top, tw, 14, [0, 0, 0, 3]);
  ctx.fill();
  ctx.fillStyle = `rgba(${view.colors.fg},0.86)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + tw / 2, top + 7.5);
  ctx.textAlign = 'start';
}
