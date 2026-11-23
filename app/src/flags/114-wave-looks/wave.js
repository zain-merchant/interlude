// #114 (UI audit flag): wave-looks' drawing.
//
// What makes these as accurate as the stored levels allow:
//   - Levels are read bin by bin, each bin once, in the column its time falls
//     in. Nothing averages columns together, so a peak keeps its height.
//   - Smoothing runs after a hit (it lets the level fall slowly), never
//     before it, unless a look's "before" value asks for it. A rise is drawn
//     where its bin starts.
//   - The smoothed levels are worked out once for the whole track, not per
//     tile, so every tile agrees with its neighbours.
//   - Columns are one device pixel wide, and the beat lines are placed on
//     the same pixel grid as the sound.

const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** As waveform-2d.js's OFF: draws a shape off canvas so only its shadow shows. */
const OFF = 20000;
/** CSS px drawn past the view or tile, for the glow and the outline. */
const PAD = 32;

/**
 * One band's level per bin, smoothed: rises are instant (or eased, if they're
 * ripples), falls have a time constant of `after` bins; `before` bins lets it
 * rise early. Pure forward and backward passes over the whole track.
 */
function envelope(v, after, before, ripple) {
  const n = v.length;
  const out = new Float32Array(n);
  const fall = after > 0.01 ? 1 - Math.exp(-1 / after) : 1;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (x > y) {
      // A ripple: a rise that's small both against the lane and against the
      // level it starts from. Easing one can't blunt a hit.
      if (ripple && x - y < ripple && x < y * 1.35) y += (x - y) * 0.4;
      else y = x;
    } else y += (x - y) * fall;
    out[i] = y;
  }
  if (before > 0.01) {
    const rise = 1 - Math.exp(-1 / before);
    y = 0;
    for (let i = n - 1; i >= 0; i--) {
      const x = out[i];
      y = x > y ? x : y + (x - y) * rise;
      out[i] = y;
    }
  }
  return out;
}

/** The three bands' envelopes for this look at this zoom, kept until either changes. */
function envelopes(wf, o, spp) {
  const perMs = wf.lookBps / 1000; // bins in a millisecond
  // The least smoothing is in px, so it grows with the zoom: in quarter
  // steps, so a zoom gesture doesn't work it out afresh every frame.
  const least = o.soft ? 2 ** (Math.round(Math.log2(o.soft * spp) * 4) / 4) : 0;
  const after = [0, 1, 2].map((b) => Math.max(o[`a${b}`] * perMs, least));
  const before = [0, 1, 2].map((b) => (o[`b${b}`] ?? 0) * perMs);
  const key = `${wf.version}|${after}|${before}|${o.ripple ?? 0}`;
  if (wf.lookEnv?.key !== key) wf.lookEnv = { key, v: [0, 1, 2].map((b) => envelope(wf.bands[b], after[b], before[b], (o.ripple ?? 0) / 100)) };
  return wf.lookEnv.v;
}

/**
 * Column tops for device pixels k0 to k1: each band's level there. A bin
 * narrower than a column is its column's loudest; a wider one holds from its
 * start, easing into the next only if that's lower, so nothing rises early.
 */
function columns(wf, E, k0, k1, perCol) {
  const n = wf.count;
  const out = [];
  for (let b = 0; b < 3; b++) {
    const v = E[b];
    const a = new Float32Array(k1 - k0);
    for (let k = k0; k < k1; k++) {
      const t0 = k * perCol;
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
  const dpr = window.devicePixelRatio || 1;
  const k0 = Math.floor((x0 - PAD) * dpr);
  const k1 = Math.ceil((x1 + PAD) * dpr);
  const cols = columns(wf, E, k0, k1, spp / dpr);
  const H = [o.h0 / 100, o.h1 / 100, o.h2 / 100];
  const heights = [0, 1, 2].map((b) => cols[b].map((v) => v * H[b] * amp));
  const n = k1 - k0;
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

  if (o.draw === 'nested') {
    const T = tones(c);
    for (let b = 0; b < 3; b++) {
      path(ectx, heights[b]);
      ectx.fillStyle = rgba(T[b]);
      ectx.fill();
    }
  } else {
    ctx.globalCompositeOperation = 'lighter';
    if (o.glow > 0) {
      for (const [b, a, r] of [[0, 0.35, 12], [1, 0.22, 10]]) {
        path(ctx, heights[b], -OFF);
        ctx.shadowColor = rgba(c[COLOURS[b]], (a * 0.2 * o.glow) / 100);
        ctx.shadowBlur = r * dpr;
        ctx.shadowOffsetX = OFF * dpr;
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
    // The outline runs through the columns' own tops, so it touches each
    // peak. A vertical edge keeps its 1px line inside the shape's side.
    const top = heights[0].map((v, i) => Math.max(v, heights[1][i]));
    ectx.strokeStyle = rgba(c.high, o.out / 100);
    ectx.lineWidth = o.outw;
    ectx.lineJoin = 'bevel';
    for (const sign of [1, -1]) {
      ectx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(i) + 0.5 / dpr;
        if (i) ectx.lineTo(x, mid - sign * top[i]);
        else ectx.moveTo(x, mid - sign * top[i]);
      }
      ectx.stroke();
    }
  }
}

/** The marks' pitch in CSS px and their origin: the beat halved to the nearest of width + gap, or width + gap itself. */
export function pitchOf(o, spp, beatLen, firstBeat) {
  const want = o.w + o.gap;
  if (!o.lock || !(beatLen > 0)) return { P: want, origin: 0 };
  const px = beatLen / spp;
  return { P: px / 2 ** Math.max(0, Math.round(Math.log2(px / want))), origin: firstBeat / spp, per: 2 ** Math.max(0, Math.round(Math.log2(px / want))) };
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
  // The mark's share of the pitch holds whatever the pitch came out at, in whole device px.
  const w = Math.max(1 / dpr, snap((P * o.w) / (o.w + o.gap)));
  const lists = [[], [], []];
  const rest = [];
  const n = wf.count;
  for (let j = Math.floor((x0 - P * 2 - origin) / P); j <= Math.ceil((x1 + P - origin) / P); j++) {
    const xa = origin + j * P;
    const left = snap(xa);
    const i0 = Math.max(0, Math.ceil((xa - P / 2) * spp - 0.5));
    const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil((xa + P / 2) * spp - 0.5)));
    const v = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const e = E[b];
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

/** The overview: solid bands, or marks, at the track's scale. True if it drew it (today's fills stay for the ribbons). */
export function lookOverview(wf, x, cols, w, mid, c) {
  const o = wf.wl;
  if (o.draw === 'ribbon') return false;
  const H = [o.h0 / 100, (o.h1 / 100) * (0.6 / 0.62), (o.h2 / 100) * (0.3 / 0.34)];
  const T = tones(c);
  x.globalCompositeOperation = 'source-over';
  if (o.draw === 'nested') {
    for (let b = 0; b < 3; b++) {
      x.beginPath();
      x.moveTo(0, mid);
      cols.forEach((v, i) => x.lineTo(i, mid - v[b] * H[b] * mid));
      for (let i = cols.length - 1; i >= 0; i--) x.lineTo(i, mid + cols[i][b] * H[b] * mid);
      x.closePath();
      x.fillStyle = rgba(T[b]);
      x.fill();
    }
    return true;
  }
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
