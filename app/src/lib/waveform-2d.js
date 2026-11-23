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
/**
 * The scrolling ribbon is drawn once into tiles this wide (CSS px), on the
 * track's own grid, and each frame only places the tiles under the view.
 * Drawing it fresh every frame (five filled paths, two of them blurred, per
 * deck) is most of what the waveforms cost, and the shape only slides.
 */
const TILE = 512;
/** Columns drawn past a tile's edges, so the glow and smoothing across its edges match its neighbour's. */
const MARGIN = 32;
/** Columns of the scrolling ribbon, in CSS px. */
const STEP = 2;

import { pebbleLane, pebbleOverview } from '../flags/105-dir-pebble/wave.js'; // #105 (UI audit flag)
import { linerLane, linerOverview } from '../flags/106-dir-liner/wave.js'; // #106 (UI audit flag)
import { fieldDraw } from '../flags/107-dir-field/wave.js'; // #107 (UI audit flag)
import { lookLane, lookRibbon, lookBeats, lookBar, lookOverview } from '../flags/114-wave-looks/wave.js'; // #114 (UI audit flag)

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
    /** #50 (UI audit flag): the font for the overview's hot cue numbers. */
    this.font = 'sans-serif';
    /** #52 (UI audit flag): lane-start; see sample(). */
    this.strict = false;
    /** #101 (UI audit flag): dir-centerline's half ribbon, '' for the whole ribbon. */
    this.half = '';
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
    this.tiles = null;
    this.overviewImage = null;
  }

  /** The loudest value of each band between two bins. */
  sample(i0, i1) {
    // #52 (UI audit flag): lane-start tests the range before clamping, so a
    // window wholly before the track's start (or past its end) is silence,
    // not a copy of the first bin.
    if (this.strict && (i1 <= 0 || i0 >= this.count)) return null;
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
      view.flags ?? '', // #41, #50, #52 (UI audit flags): their states, so flipping one redraws.
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
   *           loopIn?: number, loopOut?: number, looping?: boolean, slip?: number,
   *           flags?: string, edge?: string, clipStart?: boolean, cueChips?: boolean, chipTop?: number, labelFont?: string,
   *           keyline?: boolean, loopTint?: boolean, half?: string, look?: string, veil?: string, wl?: string, bps?: number, sec?: number, deck?: number, live?: number }} view
   *   Positions are in bins, -1 for none; `perPx` is bins per device pixel.
   */
  draw(view) {
    this.resize();
    if (this.unchanged(view) && !this.lookBusy) return; // #114 (UI audit flag): wave-looks has a frame to draw finer still
    if (view.look === 'field') return fieldDraw(this, view); // #107 (UI audit flag): dir-field prints the sound dark on its deck's sheet
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const spp = view.perPx * dpr; // bins per CSS pixel
    const x = (bin) => (bin - view.start) / spp;
    const c = view.colors;

    // #52 (UI audit flag): lane-start (sample() reads it; the ribbon's tiles are keyed on it).
    this.strict = !!view.clipStart;
    // #101 (UI audit flag): dir-centerline's half ribbons ('up' sits on the lane's bottom edge, 'down' hangs from its top).
    this.half = view.half ?? '';
    this.look = view.look ? [view.look, view.beatLen ?? 0, view.firstBeat ?? 0] : null; // #105, #106 (UI audit flags): dir-pebble's beads, dir-liner's ink
    // #114 (UI audit flag): wave-looks' look and its values, null for the app's own drawing.
    if ((view.wl ?? '') !== (this.wlKey ?? '')) {
      this.wlKey = view.wl ?? '';
      this.wl = view.wl ? JSON.parse(view.wl) : null;
      this.lookTiles = this.tiles = null;
      this.lookBusy = false;
    }
    if (this.wl) (this.lookBps = view.bps ?? 172.27), (this.lookBeat = [view.beatLen ?? 0, view.firstBeat ?? 0]);
    const grid = view.mode === 'scroll' && view.beatLen > 0;
    if (view.loopIn >= 0 && view.loopOut > view.loopIn) {
      const a = x(view.loopIn), b = x(view.loopOut);
      // #43 (UI audit flag): on-state tints a running loop's stretch in the deck's colour.
      ctx.fillStyle = view.loopTint && view.looping ? rgba(c.mid, 0.12) : `rgba(255,255,255,${view.looping ? 0.08 : 0.04})`;
      ctx.fillRect(a, 0, b - a, h);
    }
    if (this.count) {
      if (view.mode === 'scroll' && this.wl) lookRibbon(this, w, h, view, spp, c); // #114 (UI audit flag)
      else if (view.mode === 'scroll') this.ribbon(w, h, view, spp, c);
      else this.overview(w, h, c);
    }
    // The grid sits over the waveform so it reads against loud parts too,
    // and under the veil so the played part dims with it.
    if (grid && this.wl) lookBeats(this, w, h, view, spp); // #114 (UI audit flag)
    else if (grid) this.beats(w, h, view, spp, x);
    if (this.count) {
      // The played part: a dark veil so what's ahead is what reads.
      const px = Math.max(0, Math.min(w, x(view.playhead)));
      ctx.fillStyle = view.mode === 'scroll' ? 'rgba(12,12,14,0.5)' : 'rgba(12,12,14,0.55)';
      if (view.veil === 'ground') ctx.fillStyle = rgba(c.low.map((v) => Math.round(v * 0.2)), view.mode === 'scroll' ? 0.58 : 0.62); // #108 (UI audit flag): dir-ground's veil is a deep tone of the deck's ground
      if (this.wl?.played === 'deep') ctx.fillStyle = 'rgba(10,10,12,0.7)'; // #114 (UI audit flag)
      ctx.fillRect(0, 0, px, h);
    }
    if (view.loopIn >= 0 && view.loopOut > view.loopIn) {
      ctx.fillStyle = view.looping ? rgba(view.loopTint ? c.mid : c.fg, 0.85) : 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.round(x(view.loopIn)) - 0.5, 0, 1, h);
      ctx.fillRect(Math.round(x(view.loopOut)) - 0.5, 0, 1, h);
    }
    /** #50 (UI audit flag): overview chips, drawn after their lines so close ones can stack. */
    const chips = [];
    view.hotCues?.forEach((cue, i) => {
      if (cue < 0) return;
      const cx = x(cue);
      if (cx < -6 || cx > w + 6) return;
      ctx.fillStyle = c.hot[i % c.hot.length];
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - 1, 0, 2, h);
      ctx.globalAlpha = 1;
      // #50 (UI audit flag): overview-cues puts the lane's numbered chip at the top of each overview marker.
      if (view.cueChips && view.mode === 'overview') return chips.push([cx, i]);
      ctx.beginPath();
      ctx.moveTo(cx - 4, 0);
      ctx.lineTo(cx + 4, 0);
      ctx.lineTo(cx, 4);
      ctx.closePath();
      ctx.fill();
    });
    // Close cues stack: each chip takes the first 12px row where it clears
    // the chips already drawn by a pixel.
    const rows = [];
    chips.sort((a, b) => a[0] - b[0]).forEach(([cx, i]) => {
      let row = 0;
      while ((rows[row] ?? -Infinity) > cx - 13) row++;
      rows[row] = cx;
      this.chip(cx, w, i + 1, c.hot[i % c.hot.length], c.ink, (view.chipTop ?? 0) + row * 13); // #110 (UI audit flag): dir-room-tint's chips stand clear of the overview's top edge
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
      // #54 (UI audit flag): deck-polish keylines the play head, so it reads against the near-white core.
      if (view.keyline) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x(view.playhead) - 1.75, 0, 1, h);
        ctx.fillRect(x(view.playhead) + 0.75, 0, 1, h);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x(view.playhead) - 0.75, 0, 1.5, h);
      if (view.mode === 'scroll' && view.beatLen > 0 && this.wl && this.wl.chip !== 'pill') lookBar(this, h, view, x); // #114 (UI audit flag)
      else if (view.mode === 'scroll' && view.beatLen > 0) this.barNumber(h, view, x);
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
    ctx.font = `600 10px ${view.labelFont ? `${view.labelFont}, ` : ''}"Geist Variable", system-ui, sans-serif`; // #111 (UI audit flag): font-special-gothic's face
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pw = Math.max(18, ctx.measureText(label).width + 8);
    const px = x(view.playhead) - pw / 2;
    const py = h / 2 - 7;
    // UI audit flags (the directions, #92 and up): the pill in the theme's --fg with --ink on it.
    const themed = view.pill === 'theme';
    ctx.fillStyle = themed ? rgba(view.colors.fg, 1) : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, 14, 4);
    ctx.fill();
    ctx.fillStyle = themed ? rgba(view.colors.ink, 1) : '#0c0c0e';
    ctx.fillText(label, px + pw / 2, h / 2 + 0.5);
    ctx.textAlign = 'start';
  }

  /** #50 (UI audit flag): a hot cue's numbered chip, 12px tall, at the top of its overview line. */
  chip(cx, w, n, fill, ink, top = 0) {
    const { ctx } = this;
    const cw = 12, ch = 12;
    const left = Math.max(0, Math.min(w - cw, Math.round(cx - cw / 2)));
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(left, top, cw, ch, top ? 3 : [0, 0, 3, 3]);
    else ctx.rect(left, top, cw, ch);
    ctx.fill();
    ctx.fillStyle = rgba(ink, 1);
    ctx.font = `600 11px ${this.font ?? 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), left + cw / 2, top + ch / 2 + 0.5);
  }

  /** Fills one band's shape. `glow` draws only its blurred shadow. */
  band(ctx, cols, step, shift, mid, amp, k, scale, color, alpha, h, glow = 0) {
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
    const g = ctx.createLinearGradient(0, mid - amp, 0, mid + amp); // (0, h) unless #101's half ribbon moves the axis
    g.addColorStop(0, rgba(color, alpha * 0.35));
    g.addColorStop(0.5, rgba(color, alpha));
    g.addColorStop(1, rgba(color, alpha * 0.35));
    ctx.fillStyle = g;
    ctx.fill();
  }

  /**
   * The scrolling ribbon. Once the zoom and size have held for a few
   * frames, it's drawn into tiles on the track's grid and each frame only
   * places the tiles under the view, on whole device pixels. While they're
   * changing (a zoom gesture, a resize), and for a couple of frames after
   * a jump (a seek, a cue, a drag on the overview), it's drawn straight
   * onto the lane instead, as tiles made then would be thrown away.
   */
  ribbon(w, h, view, spp, c) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const key = `${this.version}|${spp}|${canvas.height}|${dpr}|${this.strict ? 1 : 0}|${view.edge ?? ''}${this.half ? `|${this.half}` : ''}${this.look ? `|${this.look}` : ''}`; // #101 (UI audit flag): half; #105, #106: look
    if (!this.tiles || this.tilesKey !== key || this.tilesColors !== c) {
      this.tiles = new Map();
      this.spare = [];
      this.tilesKey = key;
      this.tilesColors = c;
      this.steady = 0;
    }
    // The view's left edge on the track's grid, in CSS px from the track's start.
    const off = view.start / spp;
    const first = Math.floor(off / TILE);
    const last = Math.floor((off + w) / TILE);
    // Scrolling brings in one new tile at a time; more than that is a jump.
    let missing = 0;
    for (let t = first; t <= last; t++) if (!this.tiles.has(t)) missing++;
    if (missing > 1 && this.steady >= 3) this.steady = 0;
    if (++this.steady < 3) {
      ctx.save();
      ctx.translate(-off, 0);
      this.ribbonShape(ctx, ctx, off, off + w, spp, h, c, view.edge);
      ctx.restore();
      return;
    }
    // Tiles out of view go back to be drawn over, not to the collector.
    for (const [t, tile] of this.tiles) {
      if (t >= first - 1 && t <= last + 1) continue;
      this.tiles.delete(t);
      this.spare.push(tile);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let t = first; t <= last; t++) {
      let tile = this.tiles.get(t);
      if (!tile) this.tiles.set(t, (tile = this.ribbonTile(t, spp, h, c, dpr, view.edge)));
      const dx = Math.round((t * TILE - off) * dpr);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(tile.bands, dx, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tile.edge, dx, 0);
    }
    ctx.restore();
  }

  /**
   * Draws tile `t` of the ribbon: its bands, blended additively, on one
   * canvas, and the crisp edge (drawn over them) on another, so placing
   * them gives what drawing straight onto the lane would.
   */
  ribbonTile(t, spp, h, c, dpr, edgeStyle) {
    const old = this.spare.pop();
    const make = (el) => {
      if (!el) {
        el = document.createElement('canvas');
        el.width = Math.round(TILE * dpr);
        el.height = this.canvas.height;
      }
      const x = el.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, el.width, el.height);
      x.setTransform(dpr, 0, 0, dpr, -t * TILE * dpr, 0);
      return [el, x];
    };
    const [bands, ctx] = make(old?.bands);
    const [edge, ectx] = make(old?.edge);
    this.ribbonShape(ctx, ectx, t * TILE, (t + 1) * TILE, spp, h, c, edgeStyle);
    return { bands, edge };
  }

  /**
   * Draws the ribbon from x0 to x1 (CSS px on the track's grid, where
   * column k sits at k * STEP): the bands on `ctx`, blended additively,
   * then the crisp edge on `ectx`. Columns run a little past both ends so
   * the glow and the smoothing are whole up to them.
   */
  ribbonShape(ctx, ectx, x0, x1, spp, h, c, edge) {
    if (this.wl) return lookLane(this, ctx, ectx, x0, x1, spp, h, c, this.half); // #114 (UI audit flag)
    if (this.look) return (this.look[0] === 'beads' ? pebbleLane : linerLane)(this, ectx, x0, x1, spp, h, c, this.look.slice(1)); // #105, #106 (UI audit flags)
    // #101 (UI audit flag): dir-centerline's half ribbon: the axis on the lane's edge, at the lane's full height.
    const mid = this.half === 'up' ? h : this.half === 'down' ? 0 : h / 2;
    const amp = this.half ? h : h / 2;
    const step = STEP;
    const dt = spp * step;
    const k0 = Math.floor((x0 - MARGIN) / step);
    const k1 = Math.ceil((x1 + MARGIN) / step);
    const shift = k0 * step;
    const raw = [];
    for (let k = k0 - 2; k <= k1 + 2; k++) {
      const at = k * dt;
      raw.push(this.sample(at - dt / 2, at + dt / 2) ?? [0, 0, 0]);
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
    this.band(ctx, cols, step, shift, mid, amp, 0, 0.95, c.low, 0.35 * glow, h, 12);
    this.band(ctx, cols, step, shift, mid, amp, 1, 0.62, c.mid, 0.22 * glow, h, 10);
    this.band(ctx, cols, step, shift, mid, amp, 0, 0.95, c.low, 0.5, h);
    this.band(ctx, cols, step, shift, mid, amp, 1, 0.62, c.mid, 0.38, h);
    this.band(ctx, cols, step, shift, mid, amp, 2, 0.34, c.high, 0.55, h);
    ctx.globalCompositeOperation = 'source-over';
    // A crisp edge on the outer band so the shape reads sharp under the glow.
    ectx.strokeStyle = rgba(c.high, 0.55);
    ectx.lineWidth = 1;
    for (const sign of [1, -1]) {
      ectx.beginPath();
      cols.forEach((v, i) => {
        const y = mid - sign * Math.max(v[0] * 0.95, v[1] * 0.62) * amp;
        i ? ectx.lineTo(shift + i * step, y) : ectx.moveTo(shift, y);
      });
      ectx.stroke();
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

  /** The whole track's shape, drawn once per size and placed each frame. */
  overview(w, h, c) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const key = `${this.version}|${canvas.width}|${canvas.height}|${dpr}${this.look ? `|${this.look[0]}` : ''}${this.wl ? `|${this.wlKey}` : ''}`; // #105, #106 (UI audit flags): look; #114: wl
    let img = this.overviewImage;
    if (!img || img.key !== key || img.colors !== c) {
      const el = document.createElement('canvas');
      el.width = canvas.width;
      el.height = canvas.height;
      const x = el.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = this.overviewCols(Math.round(w));
      const mid = h / 2;
      const fill = (k, s, color, a) => {
        x.beginPath();
        x.moveTo(0, mid);
        cols.forEach((v, i) => x.lineTo(i, mid - v[k] * s * mid));
        for (let i = cols.length - 1; i >= 0; i--) x.lineTo(i, mid + cols[i][k] * s * mid);
        x.closePath();
        x.fillStyle = rgba(color, a);
        x.fill();
      };
      const own = this.wl && lookOverview(this, x, cols, w, mid, c); // #114 (UI audit flag)
      const look = !this.wl && this.look;
      if (look && !own) (look[0] === 'beads' ? pebbleOverview : linerOverview)(x, cols, mid, c); // #105, #106 (UI audit flags)
      else if (!own) {
        x.globalCompositeOperation = 'lighter';
        fill(0, 0.95, c.low, 0.55);
        fill(1, 0.6, c.mid, 0.4);
        fill(2, 0.3, c.high, 0.45);
      }
      this.overviewImage = img = { key, colors: c, el };
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img.el, 0, 0);
    ctx.restore();
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
    ink: cssColor('var(--ink)'),
    cue: cssColor('var(--cue)'),
    hot: Array.from({ length: HOT_CUES }, (_, i) => `rgb(${cssColor(`var(--hc-${i + 1})`).join(',')})`),
  };
}
