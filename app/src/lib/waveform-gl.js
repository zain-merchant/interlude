// GPU waveform renderer (WebGL2). Bins are uploaded once per track as an
// RGBA8 texture (peak, low, mid, high); each frame only a few uniforms
// change, so drawing costs almost nothing on the CPU.
//
// The look: the familiar nested bands (bass blue outside, mids amber,
// highs white in the core) as one solid, smooth shape filled with a
// continuous gradient between them, with a ribbon of thin
// anti-aliased threads laid over them as a fine texture. The outermost
// thread is the crisp bass edge and the innermost follows the highs, the
// ones between blending blue to amber to white. A faint twist that
// scrolls with the music makes the inner threads weave. What has already played collapses to one grey
// shape. Beats are faint full-height lines, every 4th a little stronger,
// and the play head is a single 1 px line. Hot cues are thin cue-coloured
// lines; an active loop is a faint white band between two white lines. No
// glow anywhere.

const TEX_WIDTH = 4096;
/** Levels in the bin pyramid: level k holds one value per 2^k bins. */
const MAX_LEVELS = 16;
/** Hot cue slots drawn, matching the engine's HOT_CUES. */
export const HOT_CUES = 8;

const VERT = `#version 300 es
in vec2 a;
out vec2 uv;
void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
out vec4 color;
uniform sampler2D bins;   // the bin pyramid, every level end to end
uniform int count;        // number of bins (level 0)
uniform int levels;       // levels in the pyramid
uniform float levelOff[${MAX_LEVELS}]; // texel offset of each level
uniform float levelLen[${MAX_LEVELS}]; // values in each level
uniform float start;      // bin index at the left edge
uniform float perPx;      // bins per pixel
uniform float width;      // canvas width in px
uniform float height;     // canvas height in px
uniform float dpr;        // device pixel ratio, to keep lines a constant CSS width
uniform float playhead;   // bin index of the play position
uniform float cue;        // bin index of the cue point (-1 = none)
uniform vec3 cBg;
uniform vec3 cFg;
uniform vec3 cLow;
uniform vec3 cMid;
uniform vec3 cHigh;
uniform vec3 cPast;
uniform vec3 cCue;
uniform float centerLine; // 1 = scrolling view with a fixed centre play head
uniform float beatLen;    // bins per beat (0 = no beatgrid)
uniform float firstBeat;  // bin index of beat 0
uniform float hotCues[${HOT_CUES}]; // bin indexes (-1 = none)
uniform float loopIn;     // bin index (-1 = none)
uniform float loopOut;    // bin index (-1 = none)
uniform float looping;    // 1 = the loop is playing
uniform float twist;      // radians of ribbon twist per bin

vec4 fetchLevel(int l, int i) {
  if (i < 0 || float(i) >= levelLen[l]) return vec4(0.0);
  int t = int(levelOff[l]) + i;
  return texelFetch(bins, ivec2(t % ${TEX_WIDTH}, t / ${TEX_WIDTH}), 0);
}

// The bins under one pixel column, read from the pyramid level that has
// about one value per pixel and interpolated, so the outline flows at any
// zoom instead of breaking into separate bars.
vec4 sampleColumn(float px) {
  float b = start + px * perPx;
  float lv = clamp(floor(log2(max(perPx, 1.0))), 0.0, float(levels - 1));
  float bl = b / exp2(lv);
  float f = floor(bl - 0.5);
  int l = int(lv);
  return mix(fetchLevel(l, int(f)), fetchLevel(l, int(f) + 1), bl - 0.5 - f);
}

// The three band outlines (low, mid, high) at one column, in px from the
// centre line, smoothed with a small Gaussian across neighbouring columns.
vec3 bandsAt(float px, float half_) {
  float o = 2.0 * dpr;
  vec4 v = sampleColumn(px) * 0.4
    + (sampleColumn(px - o) + sampleColumn(px + o)) * 0.24
    + (sampleColumn(px - 2.0 * o) + sampleColumn(px + 2.0 * o)) * 0.06;
  v = clamp(v, 0.0, 1.0);
  return vec3(v.g, v.b * 0.78, v.a * 0.55) * half_;
}

// Thread t (0 = outermost, 1 = innermost) runs from the bass outline in
// to the highs outline, so the outer edge still reads as loudness and
// the colour across the threads as frequency. A slow twist along the
// track (it scrolls with the music) makes the threads weave like a ribbon.
float threadY(vec3 b, float t, float bin) {
  float h = t < 0.5 ? mix(b.x, b.y, t * 2.0) : mix(b.y, b.z, t * 2.0 - 1.0);
  float phase = bin * twist + t * 4.7;
  return h * (1.0 + 0.07 * sin(phase) * t * (1.0 - t) * 4.0);
}

// Brightness across a band: fullest at the centre line, falling off
// towards its edge, so each band reads as a soft, rounded shape.
float shade(float y, float h) {
  return mix(1.15, 0.7, smoothstep(0.0, 1.0, y / max(h, 1.0)));
}

vec3 threadColour(float t) {
  return t < 0.5 ? mix(cLow, cMid, t * 2.0) : mix(cMid, cHigh, t * 2.0 - 1.0);
}

void main() {
  float px = uv.x * width;
  float y = abs(uv.y - 0.5) * height; // px from the centre line
  float half_ = height * 0.5 - 2.0 * dpr;
  float bin = start + px * perPx;
  float aa = 0.8 * dpr;

  vec3 b = bandsAt(px, half_);
  vec3 bNext = bandsAt(px + dpr, half_);
  float binNext = bin + dpr * perPx;
  bool past = bin < playhead;
  vec3 c = cBg;

  // Silence draws nothing, not a hairline along the centre.
  if (b.x > 0.5 * dpr) {
    // Solid nested bands underneath, the familiar DJ shape: bass outside,
    // mids, highs in the core, each darker towards its edge.
    float inLow = 1.0 - smoothstep(b.x - aa, b.x + aa, y);
    float inMid = 1.0 - smoothstep(b.y - aa, b.y + aa, y);
    if (past) {
      c = mix(c, cPast, max(inLow, inMid));
    } else {
      // One continuous gradient from the white core through amber to the
      // blue edge, its stops at the band outlines, so the colour still
      // says where the highs, mids and bass are without hard seams.
      vec3 midway = mix(cHigh, cMid, 0.5);
      vec3 g = y < b.z ? mix(cHigh, midway, y / max(b.z, 1.0))
        : y < b.y ? mix(midway, cMid, (y - b.z) / max(b.y - b.z, 1.0))
        : mix(cMid, cLow, (y - b.y) / max(b.x - b.y, 1.0));
      c = mix(c, g * mix(1.0, 0.6, smoothstep(0.0, 1.0, y / max(b.x, 1.0))), inLow);
    }

    // Threads: about one every 4 px of height, each a 1 px anti-aliased line.
    float n = clamp(floor(half_ / (4.0 * dpr)), 6.0, 18.0);
    for (float k = 0.0; k < 18.0; k += 1.0) {
      if (k >= n) break;
      float t = k / (n - 1.0);
      float ty = threadY(b, t, bin);
      float slope = (threadY(bNext, t, binNext) - ty) / dpr;
      float d = abs(y - ty) / sqrt(1.0 + slope * slope);
      float line = 1.0 - smoothstep(0.3 * dpr, 1.0 * dpr, d);
      vec3 tc = past ? mix(cPast, cFg, 0.12) : threadColour(t);
      // The outermost thread is the band's crisp edge; the rest are a
      // finer texture over the fill.
      c = mix(c, tc, line * (past ? 0.6 : k < 0.5 ? 1.0 : 0.7));
    }
  }

  // Beat lines: faint and full height, every 4th a little stronger.
  if (beatLen > 0.0 && beatLen / perPx > 6.0 * dpr) {
    float b = (bin - firstBeat) / beatLen;
    // Beat 0 starts a bar and can sit up to a bar in (a downbeat set by
    // hand), so beats before it are drawn too; mod() keeps their bars.
    float k = floor(b + 0.5);
    float distPx = abs(b - k) * beatLen / perPx;
    float line = 1.0 - smoothstep(0.3 * dpr, 0.9 * dpr, distPx);
    c = mix(c, cFg, line * (mod(k, 4.0) < 0.5 ? 0.18 : 0.08));
  }

  // Loop: a faint band while it plays, edges always (a stored loop can be
  // jumped back into).
  if (loopIn >= 0.0) {
    float on = looping > 0.5 ? 1.0 : 0.0;
    if (loopOut > loopIn && bin >= loopIn && bin < loopOut) c = mix(c, cFg, 0.1 * on);
    float dEdge = abs(bin - loopIn) / perPx;
    if (loopOut > loopIn) dEdge = min(dEdge, abs(bin - loopOut) / perPx);
    float edge = 1.0 - smoothstep(0.4 * dpr, 1.0 * dpr, dEdge);
    c = mix(c, cFg, edge * mix(0.25, 0.7, on));
  }

  // Hot cues: thin lines; the scrolling view labels them in HTML.
  for (int i = 0; i < ${HOT_CUES}; i++) {
    if (hotCues[i] < 0.0) continue;
    float dx = abs(bin - hotCues[i]) / perPx;
    c = mix(c, cCue, (1.0 - smoothstep(0.4 * dpr, 1.0 * dpr, dx)) * 0.7);
  }

  // Cue marker: a thin line with a small triangle at the top.
  if (cue >= 0.0) {
    float dx = abs(bin - cue) / perPx;
    float line = 1.0 - smoothstep(0.4 * dpr, 1.0 * dpr, dx);
    float fromTop = (1.0 - uv.y) * height;
    float tri = 1.0 - smoothstep(-aa, aa, dx - (5.0 * dpr - fromTop));
    c = mix(c, cCue, max(line * 0.8, tri));
  }

  // Play head: one crisp 1 px line.
  float dPlay = centerLine > 0.5 ? abs(px - width * 0.5) : abs(bin - playhead) / perPx;
  c = mix(c, cFg, 1.0 - smoothstep(0.5 * dpr, 1.0 * dpr, dPlay));

  color = vec4(c, 1.0);
}`;

/**
 * Gaussian blur along time of interleaved RGBA values, `radius` values each
 * side (sigma = radius / 2).
 * @param {Float32Array} src @param {number} radius
 */
function blur(src, radius) {
  const n = src.length / 4;
  const w = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const g = Math.exp(-(k * k) / (2 * (radius / 2) ** 2));
    w.push(g);
    sum += g;
  }
  const out = new Float32Array(src.length);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        v += src[j * 4 + c] * w[k + radius];
      }
      out[i * 4 + c] = v / sum;
    }
  }
  return out;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

export class WaveformGL {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ['bins', 'count', 'levels', 'levelOff', 'levelLen', 'start', 'perPx', 'width', 'height', 'dpr', 'playhead', 'cue', 'cBg', 'cFg', 'cLow', 'cMid', 'cHigh', 'cPast', 'cCue', 'centerLine', 'twist', 'beatLen', 'firstBeat', 'loopIn', 'loopOut', 'looping']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.u.hotCues = gl.getUniformLocation(prog, 'hotCues');
    this.tex = gl.createTexture();
    this.count = 0;
    this.cues = new Float32Array(HOT_CUES);
    this.setBins(new Uint8Array(4));
  }

  /**
   * Uploads waveform bins (4 bytes each) as a pyramid: level 0 is the bins
   * lightly smoothed over time, and each level above holds the peak of
   * each pair below it, smoothed again. Built once per track, so drawing
   * any zoom reads only a couple of texels per pixel.
   */
  setBins(bytes) {
    const gl = this.gl;
    const count = Math.floor(bytes.length / 4);
    const levels = [blur(Float32Array.from(bytes.subarray(0, count * 4)), 2)];
    while (levels.length < MAX_LEVELS && levels[levels.length - 1].length / 4 > 1) {
      const prev = levels[levels.length - 1];
      const n = Math.ceil(prev.length / 8);
      const next = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 4; c++) {
          const a = prev[i * 8 + c];
          const b = i * 8 + 4 + c < prev.length ? prev[i * 8 + 4 + c] : a;
          next[i * 4 + c] = Math.max(a, b);
        }
      }
      levels.push(blur(next, 2));
    }
    const total = levels.reduce((n, l) => n + l.length / 4, 0);
    const rows = Math.max(1, Math.ceil(total / TEX_WIDTH));
    const packed = new Uint8Array(TEX_WIDTH * rows * 4);
    this.levelOff = new Float32Array(MAX_LEVELS);
    this.levelLen = new Float32Array(MAX_LEVELS);
    let at = 0;
    levels.forEach((l, k) => {
      this.levelOff[k] = at;
      this.levelLen[k] = l.length / 4;
      for (let i = 0; i < l.length; i++) packed[at * 4 + i] = Math.min(255, Math.round(l[i]));
      at += l.length / 4;
    });
    this.levels = count ? levels.length : 1;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TEX_WIDTH, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.count = count;
    this.binsVersion = (this.binsVersion ?? 0) + 1;
  }

  /** True if `view` draws exactly what the last draw did. Remembers it. */
  unchanged(view) {
    const key = [
      this.canvas.width, this.canvas.height, window.devicePixelRatio || 1, this.binsVersion,
      view.start, view.perPx, view.playhead, view.cue, !!view.centerLine,
      view.beatLen ?? 0, view.firstBeat ?? 0, view.loopIn ?? -1, view.loopOut ?? -1, !!view.looping,
      ...(view.hotCues ?? []),
    ];
    const last = this.lastKey;
    const same = !!last && view.colors === this.lastColors && last.length === key.length && key.every((v, i) => v === last[i]);
    this.lastKey = key;
    this.lastColors = view.colors;
    return same;
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

  /**
   * @param {{ start: number, perPx: number, playhead: number, cue: number,
   *           centerLine: boolean, colors: Record<string, number[]>,
   *           beatLen?: number, firstBeat?: number, hotCues?: number[],
   *           loopIn?: number, loopOut?: number, looping?: boolean }} view
   *   `start`, `playhead`, `cue`, `beatLen`, `firstBeat`, `hotCues` and the
   *   loop points are in bins, -1 for none;
   *   `perPx` is bins per device pixel. Colours are linear 0..1 RGB.
   */
  draw(view) {
    const gl = this.gl;
    this.resize();
    // A paused deck, or an overview whose play head hasn't moved, looks
    // the same as last frame: keep the picture and skip the GPU work.
    if (this.unchanged(view)) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.bins, 0);
    gl.uniform1i(this.u.count, this.count);
    gl.uniform1i(this.u.levels, this.levels);
    gl.uniform1fv(this.u.levelOff, this.levelOff);
    gl.uniform1fv(this.u.levelLen, this.levelLen);
    gl.uniform1f(this.u.start, view.start);
    gl.uniform1f(this.u.perPx, view.perPx);
    gl.uniform1f(this.u.width, this.canvas.width);
    gl.uniform1f(this.u.height, this.canvas.height);
    gl.uniform1f(this.u.dpr, window.devicePixelRatio || 1);
    gl.uniform1f(this.u.playhead, view.playhead);
    gl.uniform1f(this.u.cue, view.cue);
    gl.uniform1f(this.u.centerLine, view.centerLine ? 1 : 0);
    gl.uniform1f(this.u.beatLen, view.beatLen ?? 0);
    // The scrolling view twists once every two bars (or 4 s without a
    // beatgrid); the overview, which shows the whole track, every ~180 px.
    const dpr = window.devicePixelRatio || 1;
    const twistBins = !view.centerLine ? view.perPx * 180 * dpr : view.beatLen ? view.beatLen * 8 : 172 * 4;
    gl.uniform1f(this.u.twist, (2 * Math.PI) / twistBins);
    gl.uniform1f(this.u.firstBeat, view.firstBeat ?? 0);
    this.cues.fill(-1);
    view.hotCues?.forEach((c, i) => i < HOT_CUES && (this.cues[i] = c));
    gl.uniform1fv(this.u.hotCues, this.cues);
    gl.uniform1f(this.u.loopIn, view.loopIn ?? -1);
    gl.uniform1f(this.u.loopOut, view.loopOut ?? -1);
    gl.uniform1f(this.u.looping, view.looping ? 1 : 0);
    for (const [k, v] of Object.entries(view.colors)) gl.uniform3fv(this.u[k], v);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/**
 * Resolves a CSS custom property to 0..1 RGB. Theme colours may be written
 * in any CSS syntax (oklch, var(), ...), so they're painted onto a 1 px
 * canvas and read back.
 */
function cssColor(varName) {
  const probe = document.createElement('span');
  probe.style.color = `var(${varName})`;
  document.body.appendChild(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

/** Reads the waveform colours from the theme's CSS custom properties. */
export function themeColors() {
  return {
    cBg: cssColor('--bg'),
    cFg: cssColor('--fg'),
    cLow: cssColor('--w-low'),
    cMid: cssColor('--w-mid'),
    cHigh: cssColor('--w-high'),
    cPast: cssColor('--w-past'),
    cCue: cssColor('--cue'),
  };
}
