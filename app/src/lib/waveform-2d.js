// Canvas 2D waveform renderer: the "liquid ribbon" look from the design
// (docs/design-direction.md). Three smooth mirrored bands (low outside,
// mids, highs in the core) filled with translucent tones of the deck's
// colour and blended additively. A soft glow sits under the low and mid
// bands, and a crisp hairline runs along the outer edge. What has already
// played sits under a dark veil. Beats are faint full-height lines, every
// fourth a little stronger. Hot cues are thin lines in their slot's colour.
// An active loop is a faint band between two lines.
//
// Columns are sampled on a grid fixed to the track, not to the screen, and
// then slid by the sub-column remainder. Otherwise each column's window
// moves a little every frame, peaks are caught or missed, and the shape
// pulses.

/** Hot cue slots drawn, matching the engine's HOT_CUES. */
export const HOT_CUES = 8;
/** Offset used to draw a shape off canvas so only its blurred shadow shows. */
const OFF = 20000;

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Waveform looks under exploration; `?wave=<name>` picks one in the browser build. */
export const STYLES = ['current', 'spectral', 'aurora', 'heat', 'contour', 'bars'];
const STYLE = (() => {
  try {
    const s = new URLSearchParams(location.search).get('wave');
    return STYLES.includes(s) ? s : 'current';
  } catch {
    return 'current';
  }
})();

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Samples a list of colour stops at t (0..1). */
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return lerp(stops[i], stops[i + 1], t - i);
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Spectral: kick rose, body gold, air cyan; each column mixes by its band balance. */
const SPEC = { low: hex('#ff3d71'), mid: hex('#ffb43d'), high: hex('#3dcbff') };
function spectralColor(v, lift = true) {
  const [l, m, h] = v;
  // Cubed weights so a column leans to its strongest band instead of mixing to grey.
  const wl = l ** 3, wm = m ** 3 * 1.2, wh = h ** 3 * 2;
  const s = wl + wm + wh || 1;
  let c = [0, 1, 2].map((k) => (SPEC.low[k] * wl + SPEC.mid[k] * wm + SPEC.high[k] * wh) / s);
  const g = (c[0] + c[1] + c[2]) / 3;
  c = c.map((x) => Math.max(0, Math.min(255, g + (x - g) * 1.35)));
  // Lift toward white as the column gets loud, so peaks read hottest.
  return lift ? lerp(c, [255, 255, 255], Math.max(0, Math.max(l, m, h) - 0.75) * 1.2) : c;
}
/** Heat: loudness on a perceptual ramp, deep violet to white hot. */
const HEAT = ['#1d1250', '#5a1f9e', '#b52f9a', '#ff5470', '#ffa24a', '#ffe9a8'].map(hex);
/** Aurora: one vivid ramp per deck, low to high. */
const AURORA = [
  { low: hex('#4a3cff'), mid: hex('#21c8ff'), high: hex('#d6fff6') },
  { low: hex('#ff2e7e'), mid: hex('#ff9a3c'), high: hex('#fff1cf') },
];
/** Contour: neon lines, one per band. */
const CONTOUR = [
  { low: hex('#7b6cff'), mid: hex('#2fe0d0'), high: hex('#f2fbff') },
  { low: hex('#ff4f8b'), mid: hex('#ffc24a'), high: hex('#fff8ea') },
];

export class Waveform2D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.canvas = canvas;
    this.ctx = ctx;
    this.count = 0;
    this.version = 0;
    this.setBins(new Uint8Array(0));
  }

  /**
   * Takes waveform bins, 4 bytes each (peak, low, mid, high), and keeps
   * each band's level scaled so a loud passage fills the lane.
   */
  setBins(bytes) {
    const n = Math.floor(bytes.length / 4);
    const bands = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let k = 0; k < 3; k++) {
      const b = bands[k];
      // Bins are stored as sqrt(level) * 255; the shapes are drawn on the level.
      for (let i = 0; i < n; i++) b[i] = (bytes[i * 4 + 1 + k] / 255) ** 2;
      // The 99.5th percentile, not the max, so one click doesn't flatten the rest.
      const sorted = Float32Array.from(b).sort();
      const top = sorted[Math.floor(sorted.length * 0.995)] || 1;
      for (let i = 0; i < n; i++) b[i] = Math.min(1, b[i] / top);
    }
    this.bands = bands;
    this.count = n;
    this.version++;
    this.overviewCache = null;
  }

  /** The loudest value of each band between two bins. */
  sample(i0, i1) {
    i0 = Math.max(0, Math.floor(i0));
    i1 = Math.min(this.count, Math.max(i0 + 1, Math.ceil(i1)));
    if (i0 >= this.count || i1 <= 0) return null;
    let l = 0, m = 0, h = 0;
    const [L, M, H] = this.bands;
    for (let i = i0; i < i1; i++) {
      if (L[i] > l) l = L[i];
      if (M[i] > m) m = M[i];
      if (H[i] > h) h = H[i];
    }
    return [l, m, h];
  }

  /** Matches the drawing buffer to the canvas's CSS size and pixel ratio. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** True if `view` draws exactly what the last draw did. Remembers it. */
  unchanged(view) {
    const key = [
      this.canvas.width, this.canvas.height, window.devicePixelRatio || 1, this.version,
      view.start, view.perPx, view.playhead, view.cue, view.mode,
      view.beatLen ?? 0, view.firstBeat ?? 0, view.loopIn ?? -1, view.loopOut ?? -1, !!view.looping, view.slip ?? -1,
      ...(view.hotCues ?? []),
    ];
    const last = this.lastKey;
    const same = !!last && view.colors === this.lastColors && last.length === key.length && key.every((v, i) => v === last[i]);
    this.lastKey = key;
    this.lastColors = view.colors;
    return same;
  }

  /**
   * @param {{ mode: 'scroll' | 'overview', start: number, perPx: number, playhead: number, cue: number,
   *           colors: ReturnType<typeof themeColors> & { low: number[], mid: number[], high: number[] },
   *           beatLen?: number, firstBeat?: number, hotCues?: number[],
   *           loopIn?: number, loopOut?: number, looping?: boolean, slip?: number }} view
   *   Positions are in bins, -1 for none; `perPx` is bins per device pixel.
   */
  draw(view) {
    this.resize();
    if (this.unchanged(view)) return;
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const spp = view.perPx * dpr; // bins per CSS pixel
    const x = (bin) => (bin - view.start) / spp;
    const c = view.colors;

    if (view.loopIn >= 0 && view.loopOut > view.loopIn) {
      const a = x(view.loopIn), b = x(view.loopOut);
      ctx.fillStyle = `rgba(255,255,255,${view.looping ? 0.08 : 0.04})`;
      ctx.fillRect(a, 0, b - a, h);
    }
    if (this.count) {
      if (STYLE === 'current') {
        if (view.mode === 'scroll') this.ribbon(w, h, view, spp, c);
        else this.overview(w, h, c);
      } else if (view.mode === 'scroll') {
        const { cols, step, shift } = this.columns(w, view, spp);
        this.paint(cols, step, shift, h, c, false);
      } else {
        this.paint(this.overviewCols(Math.round(w)), 1, 0, h, c, true);
      }
    }
    // The grid sits over the waveform so it reads against loud parts too,
    // and under the veil so the played part dims with it.
    if (view.mode === 'scroll' && view.beatLen > 0) this.beats(w, h, view, spp, x);
    if (this.count) {
      // The played part: a dark veil so what's ahead is what reads.
      const px = Math.max(0, Math.min(w, x(view.playhead)));
      ctx.fillStyle = view.mode === 'scroll' ? 'rgba(12,12,14,0.5)' : 'rgba(12,12,14,0.55)';
      ctx.fillRect(0, 0, px, h);
    }
    if (view.loopIn >= 0 && view.loopOut > view.loopIn) {
      ctx.fillStyle = view.looping ? rgba(c.fg, 0.85) : 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.round(x(view.loopIn)) - 0.5, 0, 1, h);
      ctx.fillRect(Math.round(x(view.loopOut)) - 0.5, 0, 1, h);
    }
    view.hotCues?.forEach((cue, i) => {
      if (cue < 0) return;
      const cx = x(cue);
      if (cx < -6 || cx > w + 6) return;
      ctx.fillStyle = c.hot[i % c.hot.length];
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - 1, 0, 2, h);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 4, 0);
      ctx.lineTo(cx + 4, 0);
      ctx.lineTo(cx, 4);
      ctx.closePath();
      ctx.fill();
    });
    if (view.cue >= 0) {
      const cx = x(view.cue);
      ctx.fillStyle = rgba(c.cue, 1);
      ctx.beginPath();
      ctx.moveTo(cx - 4, h);
      ctx.lineTo(cx + 4, h);
      ctx.lineTo(cx, h - 5);
      ctx.closePath();
      ctx.fill();
    }
    if (view.slip >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(Math.round(x(view.slip)) - 0.5, 0, 1, h);
    }
    if (view.playhead >= 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x(view.playhead) - 0.75, 0, 1.5, h);
      if (view.mode === 'scroll' && view.beatLen > 0) this.barNumber(h, view, x);
    }
  }

  /**
   * Beat lines, with brighter bar lines. Beat 0 is the first downbeat.
   * When beats get too close to tell apart only bars are drawn.
   */
  beats(w, h, view, spp, x) {
    const { ctx } = this;
    const len = view.beatLen;
    const barsOnly = len / spp < 6;
    const TICK = 5;
    for (let b = Math.ceil((view.start - view.firstBeat) / len); ; b++) {
      const bx = Math.round(x(view.firstBeat + b * len));
      if (bx > w) break;
      const bar = ((b % 4) + 4) % 4 === 0;
      if (barsOnly && !bar) continue;
      if (bar) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(bx, 0, 1, h);
        // Ticks at the edges mark the bar even where the waveform is loud.
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(bx, 0, 1, TICK);
        ctx.fillRect(bx, h - TICK, 1, TICK);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(bx, 0, 1, h);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(bx, 0, 1, 3);
        ctx.fillRect(bx, h - 3, 1, 3);
      }
    }
  }

  /** The bar the play head is in, on the play head line, from the first downbeat on. */
  barNumber(h, view, x) {
    const bar = Math.floor((view.playhead - view.firstBeat) / view.beatLen / 4) + 1;
    if (bar < 1) return;
    const { ctx } = this;
    const label = String(bar);
    ctx.font = '600 10px "Geist Variable", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pw = Math.max(18, ctx.measureText(label).width + 8);
    const px = x(view.playhead) - pw / 2;
    const py = h / 2 - 7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#0c0c0e';
    ctx.fillText(label, px + pw / 2, h / 2 + 0.5);
    ctx.textAlign = 'start';
  }

  /** Fills one band's shape. `glow` draws only its blurred shadow. */
  band(cols, step, shift, mid, amp, k, scale, color, alpha, h, glow = 0) {
    const { ctx } = this;
    const dx = glow ? -OFF : 0;
    ctx.beginPath();
    ctx.moveTo(dx + shift, mid);
    for (let i = 0; i < cols.length; i++) ctx.lineTo(dx + shift + i * step, mid - cols[i][k] * scale * amp);
    for (let i = cols.length - 1; i >= 0; i--) ctx.lineTo(dx + shift + i * step, mid + cols[i][k] * scale * amp);
    ctx.closePath();
    if (glow) {
      // Shadows aren't scaled by the transform, so the offset is in device px.
      const dpr = window.devicePixelRatio || 1;
      ctx.shadowColor = rgba(color, alpha);
      ctx.shadowBlur = glow * dpr;
      ctx.shadowOffsetX = OFF * dpr;
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(color, alpha * 0.35));
    g.addColorStop(0.5, rgba(color, alpha));
    g.addColorStop(1, rgba(color, alpha * 0.35));
    ctx.fillStyle = g;
    ctx.fill();
  }

  ribbon(w, h, view, spp, c) {
    const { ctx } = this;
    const mid = h / 2;
    const amp = h / 2;
    const step = 2;
    const dt = spp * step;
    const k0 = Math.floor(view.start / dt);
    const shift = (k0 * dt - view.start) / spp; // 0 .. -step px
    const raw = [];
    for (let i = -2; i <= w / step + 4; i++) {
      const t = (k0 + i) * dt;
      raw.push(this.sample(t - dt / 2, t + dt / 2) ?? [0, 0, 0]);
    }
    // A small triangular kernel so the shapes read as liquid, not jagged.
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
    ctx.globalCompositeOperation = 'lighter';
    const glow = 0.2;
    this.band(cols, step, shift, mid, amp, 0, 0.95, c.low, 0.35 * glow, h, 12);
    this.band(cols, step, shift, mid, amp, 1, 0.62, c.mid, 0.22 * glow, h, 10);
    this.band(cols, step, shift, mid, amp, 0, 0.95, c.low, 0.5, h);
    this.band(cols, step, shift, mid, amp, 1, 0.62, c.mid, 0.38, h);
    this.band(cols, step, shift, mid, amp, 2, 0.34, c.high, 0.55, h);
    ctx.globalCompositeOperation = 'source-over';
    // A crisp edge on the outer band so the shape reads sharp under the glow.
    ctx.strokeStyle = rgba(c.high, 0.55);
    ctx.lineWidth = 1;
    for (const sign of [1, -1]) {
      ctx.beginPath();
      cols.forEach((v, i) => {
        const y = mid - sign * Math.max(v[0] * 0.95, v[1] * 0.62) * amp;
        i ? ctx.lineTo(shift + i * step, y) : ctx.moveTo(shift, y);
      });
      ctx.stroke();
    }
  }


  /** The scrolling view's columns: track-fixed grid, lightly smoothed. */
  columns(w, view, spp) {
    const step = STYLE === 'bars' ? 4 : 2;
    const dt = spp * step;
    const k0 = Math.floor(view.start / dt);
    const shift = (k0 * dt - view.start) / spp;
    const raw = [];
    for (let i = -2; i <= w / step + 4; i++) {
      const t = (k0 + i) * dt;
      raw.push(this.sample(t - dt / 2, t + dt / 2) ?? [0, 0, 0]);
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
    return { cols, step, shift };
  }

  /** A mirrored shape around the middle; `f(v)` is the half height, 0..1. */
  shape(cols, step, shift, mid, amp, f) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(shift, mid);
    for (let i = 0; i < cols.length; i++) ctx.lineTo(shift + i * step, mid - f(cols[i]) * amp);
    for (let i = cols.length - 1; i >= 0; i--) ctx.lineTo(shift + i * step, mid + f(cols[i]) * amp);
    ctx.closePath();
  }

  /** One edge line (top and bottom) of a shape. */
  edge(cols, step, shift, mid, amp, f) {
    const { ctx } = this;
    ctx.beginPath();
    for (const sign of [1, -1]) {
      cols.forEach((v, i) => {
        const y = mid - sign * f(v) * amp;
        i ? ctx.lineTo(shift + i * step, y) : ctx.moveTo(shift, y);
      });
    }
  }

  /** A gradient along x with one colour per column. */
  hgrad(cols, step, shift, color, alpha) {
    const n = cols.length;
    const g = this.ctx.createLinearGradient(shift, 0, shift + (n - 1) * step, 0);
    // A stop every few columns: colour changes slowly next to the shape's detail.
    const every = Math.max(3, Math.floor(n / 240));
    for (let i = 0; i < n; i += every) g.addColorStop(i / (n - 1), css(color(cols[i], i), alpha(cols[i])));
    return g;
  }

  /** The exploratory looks, shared by the scrolling view and the overview. */
  paint(cols, step, shift, h, c, overview) {
    const { ctx } = this;
    const mid = h / 2;
    const amp = (h / 2) * (overview ? 0.98 : 0.96);
    const outer = (v) => Math.max(v[0] * 0.95, v[1] * 0.66);
    const vfade = (a, b) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(0,0,0,${b})`);
      g.addColorStop(0.5, `rgba(0,0,0,${a})`);
      g.addColorStop(1, `rgba(0,0,0,${b})`);
      return g;
    };

    if (STYLE === 'spectral' || STYLE === 'heat') {
      const color = STYLE === 'spectral'
        ? (v) => spectralColor(v, !overview)
        : (v) => ramp(HEAT, Math.max(v[0], v[1] * 0.9, v[2] * 0.7) ** (overview ? 2.2 : 0.8));
      const k = overview ? 0.5 : 1;
      // Each column's colour once; the layers below only change its alpha or tint.
      const base = cols.map((v) => color(v));
      const tint = (t) => (v, i) => (t ? lerp(base[i], [255, 255, 255], t) : base[i]);
      // Body: the full envelope in each column's colour.
      this.shape(cols, step, shift, mid, amp, outer);
      ctx.fillStyle = this.hgrad(cols, step, shift, tint(0), () => 0.55);
      ctx.fill();
      // Mids, brighter, and the highs as a hot core.
      ctx.globalCompositeOperation = 'lighter';
      this.shape(cols, step, shift, mid, amp, (v) => v[1] * 0.6);
      ctx.fillStyle = this.hgrad(cols, step, shift, tint(0), () => 0.35 * k);
      ctx.fill();
      this.shape(cols, step, shift, mid, amp, (v) => v[2] * 0.32);
      ctx.fillStyle = this.hgrad(cols, step, shift, tint(0.55 * k), () => 0.6 * k);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // Darken toward the edges so the middle carries the energy.
      this.shape(cols, step, shift, mid, amp, outer);
      ctx.fillStyle = vfade(0, 0.35);
      ctx.fill();
      if (!overview) {
        this.edge(cols, step, shift, mid, amp, outer);
        ctx.strokeStyle = this.hgrad(cols, step, shift, tint(0.25), () => 0.95);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return;
    }

    if (STYLE === 'aurora') {
      const p = AURORA[c.deck ?? 0];
      const k = overview ? 0.6 : 1;
      const fill = (f, col, a0, a1) => {
        a0 *= k;
        a1 *= k;
        this.shape(cols, step, shift, mid, amp, f);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, css(col, a1));
        g.addColorStop(0.5, css(col, a0));
        g.addColorStop(1, css(col, a1));
        ctx.fillStyle = g;
        ctx.fill();
      };
      ctx.globalCompositeOperation = 'lighter';
      if (!overview) {
        // A soft bloom under the lows, drawn off canvas so only its shadow lands.
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.translate(-OFF, 0);
        this.shape(cols, step, shift, mid, amp, (v) => v[0] * 0.95);
        ctx.shadowColor = css(p.low, 0.55);
        ctx.shadowBlur = 14 * dpr;
        ctx.shadowOffsetX = OFF * dpr;
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
      }
      fill((v) => v[0] * 0.95, p.low, 0.75, 0.25);
      fill((v) => v[1] * 0.64, p.mid, 0.6, 0.2);
      fill((v) => v[2] * 0.34, p.high, 0.8, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      if (!overview) {
        this.edge(cols, step, shift, mid, amp, (v) => v[0] * 0.95);
        ctx.strokeStyle = css(lerp(p.low, [255, 255, 255], 0.45), 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return;
    }

    if (STYLE === 'contour') {
      const p = CONTOUR[c.deck ?? 0];
      // A barely-there fill so the shape still has mass.
      this.shape(cols, step, shift, mid, amp, outer);
      ctx.fillStyle = css(p.low, 0.1);
      ctx.fill();
      this.shape(cols, step, shift, mid, amp, (v) => v[1] * 0.64);
      ctx.fillStyle = css(p.mid, 0.08);
      ctx.fill();
      const lines = [
        [(v) => v[0] * 0.95, p.low],
        [(v) => v[1] * 0.64, p.mid],
        [(v) => v[2] * 0.34, p.high],
      ];
      ctx.globalCompositeOperation = 'lighter';
      for (const [f, col] of lines) {
        this.edge(cols, step, shift, mid, amp, f);
        if (!overview) {
          ctx.strokeStyle = css(col, 0.22);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.strokeStyle = css(col, 0.95);
        ctx.lineWidth = overview ? 1 : 1.25;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    if (STYLE === 'bars') {
      // Crisp rounded bars, one per 3 px, coloured by band balance.
      const bw = overview ? 1 : 2.5;
      for (let i = 0; i < cols.length; i++) {
        const v = cols[i];
        const x = shift + i * step;
        const o = outer(v) * amp;
        const col = spectralColor(v, !overview);
        ctx.fillStyle = css(col, overview ? 0.7 : 0.92);
        if (overview) ctx.fillRect(x, mid - o, 1, o * 2);
        else {
          ctx.beginPath();
          ctx.roundRect(x, mid - o, bw, Math.max(1, o * 2), 1);
          ctx.fill();
        }
        const hi = v[2] * 0.34 * amp;
        if (hi > 0.5) {
          ctx.fillStyle = css(lerp(col, [255, 255, 255], overview ? 0.3 : 0.65), overview ? 0.5 : 0.9);
          ctx.fillRect(x, mid - hi, bw, hi * 2);
        }
      }
      return;
    }
  }

  /** The whole track in the lane's width, eased so it isn't spiky. Cached per width. */
  overviewCols(w) {
    const cache = this.overviewCache;
    if (cache && cache.w === w) return cache.cols;
    const per = this.count / w;
    const cols = [];
    for (let x = 0; x < w; x++) cols.push(this.sample(x * per, (x + 1) * per) ?? [0, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const src = cols.map((v) => v[k]);
      cols.forEach((v, x) => {
        let s = 0, n = 0;
        for (let j = -3; j <= 3; j++) if (src[x + j] !== undefined) { s += src[x + j]; n++; }
        v[k] = src[x] * 0.45 + (s / n) * 0.55;
      });
    }
    this.overviewCache = { w, cols };
    return cols;
  }

  overview(w, h, c) {
    const { ctx } = this;
    const cols = this.overviewCols(Math.round(w));
    const mid = h / 2;
    const fill = (k, s, color, a) => {
      ctx.beginPath();
      ctx.moveTo(0, mid);
      cols.forEach((v, x) => ctx.lineTo(x, mid - v[k] * s * mid));
      for (let x = cols.length - 1; x >= 0; x--) ctx.lineTo(x, mid + cols[x][k] * s * mid);
      ctx.closePath();
      ctx.fillStyle = rgba(color, a);
      ctx.fill();
    };
    ctx.globalCompositeOperation = 'lighter';
    fill(0, 0.95, c.low, 0.55);
    fill(1, 0.6, c.mid, 0.4);
    fill(2, 0.3, c.high, 0.45);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Resolves a CSS colour (any syntax, var() included) to 0..255 RGB. */
function cssColor(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.appendChild(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Reads the waveform colours for a deck from the theme's CSS custom properties. */
export function themeColors(deck) {
  const p = deck === 0 ? 'a' : 'b';
  return {
    deck,
    low: cssColor(`var(--${p}-low)`),
    mid: cssColor(`var(--deck-${p})`),
    high: cssColor(`var(--${p}-high)`),
    fg: cssColor('var(--fg)'),
    cue: cssColor('var(--cue)'),
    hot: Array.from({ length: HOT_CUES }, (_, i) => `rgb(${cssColor(`var(--hc-${i + 1})`).join(',')})`),
  };
}
