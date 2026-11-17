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
      if (view.mode === 'scroll') this.ribbon(w, h, view, spp, c);
      else this.overview(w, h, c);
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
    low: cssColor(`var(--${p}-low)`),
    mid: cssColor(`var(--deck-${p})`),
    high: cssColor(`var(--${p}-high)`),
    fg: cssColor('var(--fg)'),
    cue: cssColor('var(--cue)'),
    hot: Array.from({ length: HOT_CUES }, (_, i) => `rgb(${cssColor(`var(--hc-${i + 1})`).join(',')})`),
  };
}
