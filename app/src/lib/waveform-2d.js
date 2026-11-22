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

/**
 * Where a bin lands on screen in CSS px, for overlays drawn outside the
 * canvas (the hot cue chips). Matches the renderer, lens included.
 */
export function screenX(bin, start, perPx, playhead, widthPx, dpr) {
  if (STYLE_NOW !== 'lens') return (bin - start) / perPx / dpr;
  const p2 = perPx * 2;
  const s2 = playhead - (widthPx / 2) * p2;
  return lensWarp((bin - s2) / p2 / widthPx) * (widthPx / dpr);
}

/** Hot cue slots drawn, matching the engine's HOT_CUES. */
export const HOT_CUES = 8;
/** Offset used to draw a shape off canvas so only its blurred shadow shows. */
const OFF = 20000;

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Waveform looks under exploration; `?wave=<name>` picks one in the browser build. */
export const STYLES = ['current', 'spectral', 'aurora', 'heat', 'contour', 'bars', 'horizon', 'ridgeline', 'matrix', 'spectrogram', 'lens', 'pulse', 'dusk', 'skywater', 'skyline', 'reflection', 'deckdusk', 'sunset', 'neon', 'tropical', 'deckpair', 'energy', 'spectrum', 'sunset2', 'neon2', 'tropical2', 'deckpair2', 'tinted', 'inkember', 'dusk2', 'glacier', 'mono'];
const STYLE_NOW = (() => {
  try {
    const s = new URLSearchParams(location.search).get('wave');
    return STYLES.includes(s) ? s : 'current';
  } catch {
    return 'current';
  }
})();

const STYLE = STYLE_NOW;

/** The lens: screen position (0..1) for a linear position, magnified around the middle. */
const LENS_K = 2.5;
const LENS_N = 1 - Math.exp(-LENS_K);
function lensWarp(p) {
  const d = p - 0.5;
  const t = Math.abs(d) * 2;
  // Past the edges it carries on straight, so anything off screen stays off screen.
  const f = t <= 1 ? (1 - Math.exp(-LENS_K * t)) / LENS_N : 1 + (t - 1) * (LENS_K * Math.exp(-LENS_K)) / LENS_N;
  return 0.5 + Math.sign(d) * 0.5 * f;
}
function lensUnwarp(q) {
  const d = q - 0.5;
  const f = Math.min(1, Math.abs(d) * 2);
  return 0.5 + Math.sign(d) * 0.5 * (-Math.log(1 - f * LENS_N) / LENS_K);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Samples a list of colour stops at t (0..1). */
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return lerp(stops[i], stops[i + 1], t - i);
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Blends of today's liquid ribbon with Horizon. Each half of the lane (above
 * and below the centre line) gets its own height and its own three band
 * colours, so a look can be mirrored like today or split like Horizon.
 * `base` is where the centre line sits (0..1 down the lane).
 */
const H = (x) => hex(x);
const BAND_SCALE = [0.95, 0.62, 0.34];
const BLENDS = {
  // Today's shape and layering in Horizon's dusk colours.
  dusk: () => ({
    base: 0.5,
    up: { amp: 1, bands: [H('#7a5cff'), H('#ff7a5c'), H('#fff0dc')], edge: H('#ffb3c8') },
    down: { amp: 1, bands: [H('#7a5cff'), H('#ff7a5c'), H('#fff0dc')], edge: H('#ffb3c8') },
  }),
  // Mirrored like today, but warm sky above the line and cool water below it.
  skywater: () => ({
    base: 0.5, line: 0.55,
    up: { amp: 1, bands: [H('#ff5fa2'), H('#ff9a3c'), H('#fff0d6')], edge: H('#ffc2a8') },
    down: { amp: 1, bands: [H('#5a5cff'), H('#3aa0ff'), H('#d6ecff')], edge: H('#9fb4ff'), stripes: 0.22 },
  }),
  // Horizon's split, drawn the liquid way: mids and highs above, bass below.
  skyline: () => ({
    base: 0.54, line: 0.6, only: true,
    up: { amp: 1, bands: [null, H('#ff8a4c'), H('#fff0d6')], scale: [0, 0.92, 0.75], edge: H('#ffb38a'), top: H('#ff5fa2') },
    down: { amp: 1, bands: [H('#7a6cff'), null, null], scale: [0.95, 0, 0], edge: H('#b0a6ff'), stripes: 0.18 },
  }),
  // The whole waveform stands on a horizon, with a dim reflection under it.
  reflection: () => ({
    base: 0.68, line: 0.5,
    up: { amp: 1, bands: [H('#ff5f8f'), H('#ff9a3c'), H('#fff0d6')], edge: H('#ffc2a8') },
    down: { amp: 1, bands: [H('#6a5cff'), H('#5a7cff'), H('#c8d4ff')], edge: null, dim: 0.7, stripes: 0.3, fade: true },
  }),
  // Sky and water in each deck's own colours, so A and B stay told apart.
  deckdusk: (deck) => deck === 0
    ? {
      base: 0.5, line: 0.45,
      up: { amp: 1, bands: [H('#3d8bff'), H('#7fd0ff'), H('#f4f8fc')], edge: H('#a8dcff') },
      down: { amp: 1, bands: [H('#5a4cff'), H('#7a8cff'), H('#dfe6ff')], edge: H('#a99cff'), stripes: 0.2 },
    }
    : {
      base: 0.5, line: 0.45,
      up: { amp: 1, bands: [H('#ff7a2e'), H('#ffbd6b'), H('#fff6e8')], edge: H('#ffd0a0') },
      down: { amp: 1, bands: [H('#d0367a'), H('#ff6f9a'), H('#ffe3ee')], edge: H('#ff9fc0'), stripes: 0.2 },
    },
};

/** Today's mirrored shape, no outline, in a fuller palette. */
const mirrored = (low, mid, high, o = {}) => ({
  base: 0.5, glow: 1.6, over: true, ...o,
  up: { amp: 1, bands: [H(low), H(mid), H(high)], edge: null },
  down: { amp: 1, bands: [H(low), H(mid), H(high)], edge: null },
});
Object.assign(BLENDS, {
  sunset: () => mirrored('#6b4cff', '#ff7a3d', '#ffe27a'),
  neon: () => mirrored('#2f6bff', '#ff3dae', '#c9f6ff'),
  tropical: () => mirrored('#00b8b0', '#ff6a5c', '#fff2a8'),
  deckpair: (deck) => deck === 0 ? mirrored('#2f6bff', '#2fd6e8', '#e8fff8') : mirrored('#ff4f6d', '#ffa23d', '#fff1c8'),
  // Colour follows loudness: quiet passages cool, peaks and drops hot.
  energy: () => ({
    ...mirrored('#3b5bff', '#ff4fa0', '#fff0c0'),
    energy: ['#2f4bff', '#8a3dff', '#ff3d9a', '#ff8a3d', '#ffd84a'].map(H),
  }),
});

/**
 * Many colours, as other DJ apps do: each slice's colour comes from where
 * its sound sits, bass-heavy at one end of the palette and bright at the
 * other, and each band sits a step along from the one below it.
 */
const spectrumLook = (stops) => ({ ...mirrored('#000000', '#000000', '#000000'), spectrum: stops.map(H) });
Object.assign(BLENDS, {
  spectrum: () => spectrumLook(['#ff2d55', '#ff8a2d', '#ffd23d', '#3ddc84', '#2dc8ff', '#6a6bff']),
  sunset2: () => spectrumLook(['#5b3cff', '#b03dff', '#ff3d8b', '#ff7a3d', '#ffc84a', '#fff1c4']),
  neon2: () => spectrumLook(['#2f5bff', '#8a3dff', '#ff3dae', '#ff7ad6', '#3de6ff', '#a8ffe0']),
  tropical2: () => spectrumLook(['#007f8a', '#00c8b0', '#9cf25c', '#ffe45c', '#ff7a5c', '#ff4f8b']),
  deckpair2: (deck) => spectrumLook(deck === 0
    ? ['#3b2fff', '#2f6bff', '#2fb4ff', '#2fe0d0', '#8affc4', '#e8fff6']
    : ['#d0204a', '#ff4a3d', '#ff8a2d', '#ffb43d', '#ffe07a', '#fff6e0']),
});
/** Where a slice's sound sits, 0 (all bass) to 1 (all air), stretched to use the palette. */
function centroid(v) {
  const s = v[0] + v[1] + v[2] || 1;
  const t = (v[1] * 0.5 + v[2]) / s;
  return Math.max(0, Math.min(1, (t - 0.12) / 0.55));
}

/** OKLCH (L 0..1, C, h degrees) to 0..255 sRGB, clipped. */
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => {
    x = Math.max(0, Math.min(1, x));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  });
}
/**
 * A palette in one hue family: each band has its own lightness and chroma
 * (bass darkest and richest, highs lightest and palest), and the hue moves
 * along a short arc with the sound, from h0 when bass-heavy to h1 when bright.
 * Precomputed as a 33-step table per band.
 */
function family({ h0, h1, L = [0.56, 0.73, 0.9], C = [0.14, 0.11, 0.05], shift = [0, 0.15, 0.3] }) {
  return [0, 1, 2].map((k) => Array.from({ length: 33 }, (_, i) => {
    const t = Math.min(1, i / 32 + shift[k]);
    return oklch(L[k], C[k], h0 + (h1 - h0) * t);
  }));
}
const familyLook = (fam) => ({ ...mirrored('#000000', '#000000', '#000000'), family: fam, glow: 1 });
const FAM = {
  // Today's ice and cream, with a little hue movement and more depth.
  tinted: [family({ h0: 262, h1: 225, C: [0.09, 0.06, 0.025] }), family({ h0: 45, h1: 80, C: [0.09, 0.06, 0.025] })],
  // Ink blue to ice for A; ember to amber for B.
  inkember: [family({ h0: 268, h1: 215 }), family({ h0: 30, h1: 75 })],
  // Violet to blue for A; rose to peach for B.
  dusk2: [family({ h0: 300, h1: 250, C: [0.15, 0.11, 0.05] }), family({ h0: 5, h1: 50, C: [0.15, 0.11, 0.05] })],
  // Teal to sea green for A; copper to gold for B.
  glacier: [family({ h0: 215, h1: 170, C: [0.11, 0.1, 0.05] }), family({ h0: 45, h1: 90, C: [0.12, 0.11, 0.05] })],
  // One hue per deck, the colour only in the bass and mids: the calmest.
  mono: [family({ h0: 250, h1: 250, C: [0.13, 0.08, 0.02], shift: [0, 0, 0] }), family({ h0: 55, h1: 55, C: [0.13, 0.08, 0.02], shift: [0, 0, 0] })],
};
for (const name of Object.keys(FAM)) BLENDS[name] = (deck) => familyLook(FAM[name][deck]);

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
    if (STYLE === 'lens' && view.mode === 'scroll') {
      // Twice the time on screen, bent so the play head is magnified and the edges compress.
      view = { ...view, perPx: view.perPx * 2, start: view.playhead - (canvas.width / 2) * view.perPx * 2 };
    }
    const spp = view.perPx * dpr; // bins per CSS pixel
    const lin = (bin) => (bin - view.start) / spp;
    const x = STYLE === 'lens' && view.mode === 'scroll' ? (bin) => lensWarp(lin(bin) / w) * w : lin;
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
      } else if (view.mode === 'scroll' && STYLE === 'lens') {
        this.paint(this.lensColumns(w, view, spp), 2, 0, h, c, false, 'spectral');
      } else if (view.mode === 'scroll') {
        const { cols, step, shift } = this.columns(w, view, spp);
        this.paint(cols, step, shift, h, c, false);
      } else {
        const o = STYLE === 'lens' || STYLE === 'pulse' ? 'spectral' : STYLE;
        this.paint(this.overviewCols(Math.round(w)), 1, 0, h, c, true, o);
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
    const step = STYLE === 'bars' || STYLE === 'matrix' ? 4 : 2;
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


  /** Columns for the lens: equal on screen, so each spans more of the track toward the edges. */
  lensColumns(w, view, spp) {
    const cols = [];
    const t = (q) => view.start + lensUnwarp(q / w) * w * spp;
    for (let x = 0; x <= w + 2; x += 2) cols.push(this.sample(t(x - 1), t(x + 1)) ?? [0, 0, 0]);
    const out = cols.map((v, i) => [0, 1, 2].map((k) => {
      let s = 0, n = 0;
      for (let j = -1; j <= 1; j++) if (cols[i + j]) { s += cols[i + j][k] * (2 - Math.abs(j)); n += 2 - Math.abs(j); }
      return s / n;
    }));
    return out;
  }

  /** Local peaks of one band: column indexes louder than `min` and everything within `r`. */
  peaks(cols, k, r, min) {
    const out = [];
    for (let i = 0; i < cols.length; i++) {
      const v = cols[i][k];
      if (v < min) continue;
      let top = true;
      for (let j = -r; j <= r && top; j++) if (j && cols[i + j] && cols[i + j][k] > v) top = false;
      if (top) out.push(i);
    }
    return out;
  }

  /** The bolder forms: horizon, ridgeline, matrix, spectrogram, pulse. */
  form(style, cols, step, shift, h, c, overview) {
    const { ctx } = this;
    const X = (i) => shift + i * step;
    const n = cols.length;

    if (style === 'horizon') {
      // Mids and highs rise above a horizon line like a skyline; the bass hangs
      // below it as a striped reflection.
      const base = Math.round(h * 0.52) + 0.5;
      const up = base - 3, down = h - base - 1;
      ctx.beginPath();
      ctx.moveTo(X(0), base);
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), base - Math.max(cols[i][1] * 0.85, cols[i][2] * 0.55) * up);
      ctx.lineTo(X(n - 1), base);
      ctx.closePath();
      let g = ctx.createLinearGradient(0, base - up, 0, base);
      g.addColorStop(0.3, css(hex('#ff5fa2'), 0.9));
      g.addColorStop(0.7, css(hex('#ff9a3c'), 0.7));
      g.addColorStop(1, css(hex('#ffd36b'), 0.3));
      ctx.fillStyle = g;
      ctx.fill();
      // Highs: bright spires inside the skyline.
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(X(0), base);
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), base - cols[i][2] * 0.95 * up);
      ctx.lineTo(X(n - 1), base);
      ctx.closePath();
      g = ctx.createLinearGradient(0, base - up, 0, base);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, css(hex('#7fe3ff'), 0.15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // The bass reflection.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(X(0), base);
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), base + cols[i][0] ** 1.5 * 0.95 * down);
      ctx.lineTo(X(n - 1), base);
      ctx.closePath();
      g = ctx.createLinearGradient(0, base, 0, h);
      g.addColorStop(0, css(hex('#8a7dff'), 1));
      g.addColorStop(0.6, css(hex('#4a5cff'), 0.7));
      g.addColorStop(1, css(hex('#2a7bff'), 0.2));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(8,8,12,0.55)';
      for (let y = base + 2; y < h; y += overview ? 2 : 3) ctx.fillRect(0, y, X(n), 1);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(0, base - 0.5, X(n), 1);
      return;
    }

    if (style === 'ridgeline') {
      // Three ridges, highs at the back, bass at the front, each hiding what's behind it.
      const ridges = [
        [2, h * 0.4, h * 0.36, hex('#3dcbff')],
        [1, h * 0.68, h * 0.5, hex('#ffb43d')],
        [0, h * 0.97, h * 0.6, hex('#ff3d71')],
      ];
      for (const [k, base, tall, col] of ridges) {
        const top = (i) => base - cols[i][k] * tall;
        ctx.beginPath();
        ctx.moveTo(X(0), base);
        for (let i = 0; i < n; i++) ctx.lineTo(X(i), top(i));
        ctx.lineTo(X(n - 1), base);
        ctx.closePath();
        ctx.fillStyle = '#16161a';
        ctx.fill();
        const g = ctx.createLinearGradient(0, base - tall, 0, base);
        g.addColorStop(0, css(col, 0.55));
        g.addColorStop(1, css(col, 0.02));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < n; i++) i ? ctx.lineTo(X(i), top(i)) : ctx.moveTo(X(i), top(i));
        ctx.strokeStyle = css(lerp(col, [255, 255, 255], 0.2), 1);
        ctx.lineWidth = overview ? 1 : 1.5;
        ctx.stroke();
      }
      return;
    }

    if (style === 'matrix') {
      // An LED wall: lit dots from the middle out, coloured by the band that reaches them.
      const pitch = overview ? 3 : 4;
      const dot = pitch - 1;
      const stride = Math.max(1, Math.round(pitch / step));
      const mid = h / 2;
      const rows = Math.floor(mid / pitch);
      const paths = { off: new Path2D(), low: new Path2D(), mid: new Path2D(), high: new Path2D() };
      for (let i = 0; i < n; i += stride) {
        const v = cols[i];
        const x = Math.round(X(i));
        for (let r = 0; r < rows; r++) {
          const d = (r + 0.5) / rows;
          const key = v[2] * 0.34 >= d ? 'high' : v[1] * 0.55 >= d ? 'mid' : v[0] * 1.0 >= d ? 'low' : 'off';
          const y0 = Math.round(mid - (r + 1) * pitch) + 0.5;
          const y1 = Math.round(mid + r * pitch) + 0.5;
          paths[key].rect(x, y0, dot, dot);
          paths[key].rect(x, y1, dot, dot);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fill(paths.off);
      ctx.fillStyle = css(hex('#ff3d71'), 0.95);
      ctx.fill(paths.low);
      ctx.fillStyle = css(hex('#ffb43d'), 0.95);
      ctx.fill(paths.mid);
      ctx.fillStyle = css(hex('#c8f4ff'), 1);
      ctx.fill(paths.high);
      return;
    }

    if (style === 'spectrogram') {
      // Frequency up the lane (bass at the bottom), energy as colour, drawn
      // into a small image and scaled up smooth.
      const R = 24;
      const key = overview ? cols : null;
      let img = key && this.specCache?.key === key ? this.specCache.img : null;
      if (!img) {
        const off = (this.specCanvas ??= document.createElement('canvas'));
        off.width = n;
        off.height = R;
        const octx = off.getContext('2d');
        const data = octx.createImageData(n, R);
        const centers = [0.1, 0.45, 0.82];
        for (let i = 0; i < n; i++) {
          const v = cols[i];
          for (let y = 0; y < R; y++) {
            const fy = 1 - y / (R - 1);
            let e = 0;
            for (let k = 0; k < 3; k++) {
              const sig = 0.08 + 0.16 * v[k];
              const d = (fy - centers[k]) / sig;
              e += v[k] * Math.exp(-d * d);
            }
            e = Math.min(1, e);
            const col = ramp(HEAT, overview ? e ** 1.6 * 0.9 : e ** 0.85);
            const o = (y * n + i) * 4;
            data.data[o] = col[0];
            data.data[o + 1] = col[1];
            data.data[o + 2] = col[2];
            data.data[o + 3] = Math.min(255, e * (overview ? 1.1 : 1.5) * 255);
          }
        }
        octx.putImageData(data, 0, 0);
        img = off;
        if (key) {
          const keep = document.createElement('canvas');
          keep.width = n;
          keep.height = R;
          keep.getContext('2d').drawImage(off, 0, 0);
          this.specCache = { key, img: keep };
          img = keep;
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, X(0), 0, (n - 1) * step + step, h);
      return;
    }

    if (style === 'pulse') {
      // A graphic score: kicks as glowing discs, snares and pads as rings,
      // hats as ticks, all strung on one line.
      const mid = h / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, mid - 0.5, X(n), 1);
      // A thin body for the mids so quiet passages still have a shape.
      ctx.beginPath();
      ctx.moveTo(X(0), mid);
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), mid - cols[i][1] * h * 0.16);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), mid + cols[i][1] * h * 0.16);
      ctx.closePath();
      ctx.fillStyle = css(hex('#ffb43d'), 0.22);
      ctx.fill();
      ctx.fillStyle = css(hex('#7fe3ff'), 0.85);
      for (const i of this.peaks(cols, 2, 2, 0.22)) {
        const t = cols[i][2] * h * 0.42;
        ctx.fillRect(X(i) - 0.75, mid - t, 1.5, t * 2);
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = css(hex('#ffc65c'), 0.9);
      for (const i of this.peaks(cols, 1, 12, 0.55)) {
        ctx.beginPath();
        ctx.arc(X(i), mid, 3 + cols[i][1] * h * 0.14, 0, Math.PI * 2);
        ctx.stroke();
      }
      const rose = hex('#ff3d71');
      for (const i of this.peaks(cols, 0, 8, 0.3)) {
        const r = 4 + cols[i][0] * h * 0.25;
        const g = ctx.createRadialGradient(X(i), mid, 0, X(i), mid, r);
        g.addColorStop(0, 'rgba(255,240,245,0.95)');
        g.addColorStop(0.35, css(rose, 0.85));
        g.addColorStop(1, css(rose, 0.08));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(X(i), mid, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = css(rose, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return;
    }
  }


  /** One half of a band: from the centre line out to the band's level. */
  halfPath(cols, step, shift, base, amp, sign, f) {
    const { ctx } = this;
    const n = cols.length;
    ctx.beginPath();
    ctx.moveTo(shift, base);
    for (let i = 0; i < n; i++) ctx.lineTo(shift + i * step, base - sign * f(cols[i]) * amp);
    ctx.lineTo(shift + (n - 1) * step, base);
    ctx.closePath();
  }

  /** Today's liquid ribbon, with each half of the lane styled on its own. */
  blend(look, cols, step, shift, h, overview) {
    const { ctx } = this;
    const base = Math.round(h * look.base) + 0.5;
    const dpr = window.devicePixelRatio || 1;
    const halves = [
      [look.up, 1, base - 2],
      [look.down, -1, h - base - 1],
    ];
    const level = (half, k) => {
      const sc = (half.scale ?? BAND_SCALE)[k];
      return (v) => v[k] * sc;
    };
    const outer = (half) => (v) => Math.max(...[0, 1, 2].map((k) => (half.bands[k] ? level(half, k)(v) : 0)));
    for (const [half, sign, amp] of halves) {
      const dim = half.dim ?? 1;
      ctx.globalCompositeOperation = 'lighter';
      if (!overview) {
        // Glow under the lows and mids, as today: only the blurred shadow lands.
        for (const [k, a, blur] of [[0, 0.07, 12], [1, 0.045, 10]]) {
          if (!half.bands[k]) continue;
          ctx.save();
          ctx.translate(-OFF, 0);
          this.halfPath(cols, step, shift, base, amp, sign, level(half, k));
          const gc = look.family ? look.family[k][16] : look.spectrum ? look.spectrum[k === 0 ? 1 : 3] : half.bands[k];
          ctx.shadowColor = css(gc, a * 2.5 * dim * (look.glow ?? 1));
          ctx.shadowBlur = blur * dpr;
          ctx.shadowOffsetX = OFF * dpr;
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.restore();
        }
      }
      // Layered over each other (not added) keeps each band's own hue.
      if (look.over) ctx.globalCompositeOperation = 'source-over';
      const alphas = look.over ? [0.85, 0.85, 0.9] : [0.5, 0.4, 0.6];
      for (let k = 0; k < 3; k++) {
        const col = half.bands[k];
        if (!col) continue;
        this.halfPath(cols, step, shift, base, amp, sign, level(half, k));
        // Strongest at the line, fading toward the lane's edge, as today;
        // a `top` colour shifts the far end to another hue (Horizon's sunset).
        const far = base - sign * amp;
        const g = ctx.createLinearGradient(0, base, 0, far);
        const a = alphas[k] * dim * (overview ? 0.9 : 1);
        if (look.family) {
          const lut = look.family[k];
          ctx.fillStyle = this.hgrad(cols, step, shift, (v) => lut[Math.round(centroid(v) * 32)], () => a);
          ctx.fill();
          continue;
        }
        if (look.spectrum) {
          const off = [-0.18, 0.05, 0.3][k];
          const lift = [0, 0.1, 0.45][k];
          ctx.fillStyle = this.hgrad(cols, step, shift, (v) => lerp(ramp(look.spectrum, centroid(v) + off), [255, 255, 255], lift), () => a);
          ctx.fill();
          continue;
        }
        if (look.energy) {
          // Each column's colour from its loudness, the higher bands a step hotter.
          ctx.fillStyle = this.hgrad(cols, step, shift, (v) => ramp(look.energy, Math.max(v[0], v[1], v[2]) ** 1.3 * 0.8 + k * 0.12), () => a);
          ctx.fill();
          continue;
        }
        g.addColorStop(0, css(col, a));
        g.addColorStop(1, css(k === 1 && half.top ? half.top : col, a * (half.fade ? 0.1 : look.over ? 0.55 : 0.4)));
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (half.stripes) {
        // Water: fine dark lines through this half, clipped to its shape.
        ctx.save();
        this.halfPath(cols, step, shift, base, amp, sign, outer(half));
        ctx.clip();
        ctx.fillStyle = `rgba(10,10,14,${half.stripes})`;
        const gap = overview ? 2 : 3;
        for (let y = base + 2; y < h; y += gap) ctx.fillRect(0, y, shift + cols.length * step, 1);
        ctx.restore();
      }
      if (half.edge && !overview) {
        // A crisp hairline along the outer edge, as today.
        const f = outer(half);
        ctx.beginPath();
        cols.forEach((v, i) => {
          const y = base - sign * f(v) * amp;
          i ? ctx.lineTo(shift + i * step, y) : ctx.moveTo(shift, y);
        });
        ctx.strokeStyle = css(half.edge, 0.6 * dim);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (look.family) {
      // Soften toward the lane's edges, as today, so the middle carries the weight.
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, shift + cols.length * step, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (look.line) {
      ctx.fillStyle = `rgba(255,255,255,${look.line * (overview ? 0.6 : 1)})`;
      ctx.fillRect(0, base - 0.5, shift + cols.length * step, 1);
    }
  }

  /** The exploratory looks, shared by the scrolling view and the overview. */
  paint(cols, step, shift, h, c, overview, STYLE = STYLE_NOW) {
    if (['horizon', 'ridgeline', 'matrix', 'spectrogram', 'pulse'].includes(STYLE)) return this.form(STYLE, cols, step, shift, h, c, overview);
    if (BLENDS[STYLE]) return this.blend(BLENDS[STYLE](c.deck ?? 0), cols, step, shift, h, overview);
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
