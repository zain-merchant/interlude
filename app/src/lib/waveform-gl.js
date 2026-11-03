// GPU waveform renderer (WebGL2). Bins are uploaded once per track as an
// RGBA8 texture (peak, low, mid, high); each frame only a few uniforms
// change, so drawing costs almost nothing on the CPU.
//
// The look: three nested, mirrored envelopes, one per frequency band (low
// blue outside, mid amber, high near-white in the core), with
// anti-aliased edges. What has already played collapses to one grey
// shape. Beats are faint full-height lines, every 4th a little stronger,
// and the play head is a single 1 px line. Hot cues are thin cue-coloured
// lines; an active loop is a faint white band between two white lines. No
// glow anywhere.

const TEX_WIDTH = 4096;
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
uniform sampler2D bins;
uniform int count;        // number of bins
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

vec4 fetchBin(int i) {
  if (i < 0 || i >= count) return vec4(0.0);
  return texelFetch(bins, ivec2(i % ${TEX_WIDTH}, i / ${TEX_WIDTH}), 0);
}

// The bins under one pixel column: interpolated when zoomed in, so the
// outline stays smooth, and a peak-preserving max when zoomed out.
vec4 sampleColumn(float px) {
  float b = start + px * perPx;
  if (perPx <= 1.0) {
    float f = floor(b - 0.5);
    return mix(fetchBin(int(f)), fetchBin(int(f) + 1), b - 0.5 - f);
  }
  float b0 = start + floor(px) * perPx;
  vec4 v = vec4(0.0);
  float steps = min(16.0, perPx);
  for (float s = 0.0; s < 16.0; s += 1.0) {
    if (s >= steps) break;
    v = max(v, fetchBin(int(b0 + perPx * (s / steps))));
  }
  return v;
}

void main() {
  float px = uv.x * width;
  float y = abs(uv.y - 0.5) * height; // px from the centre line
  float half_ = height * 0.5 - 2.0 * dpr;
  float bin = start + px * perPx;
  float aa = 0.8 * dpr;

  // Average neighbouring columns a little so the outline isn't jagged.
  vec4 v = sampleColumn(px) * 0.5 + (sampleColumn(px - 1.0) + sampleColumn(px + 1.0)) * 0.25;
  v = clamp(v, 0.0, 1.0);
  float hLow = v.g * half_;
  float hMid = v.b * 0.78 * half_;
  float hHigh = v.a * 0.55 * half_;
  float inLow = 1.0 - smoothstep(hLow - aa, hLow + aa, y);
  float inMid = 1.0 - smoothstep(hMid - aa, hMid + aa, y);
  float inHigh = 1.0 - smoothstep(hHigh - aa, hHigh + aa, y);

  vec3 c = cBg;
  if (bin < playhead) {
    c = mix(c, cPast, max(inLow, inMid));
  } else {
    c = mix(c, cLow, inLow);
    c = mix(c, cMid, inMid);
    c = mix(c, cHigh, inHigh);
  }

  // Beat lines: faint and full height, every 4th a little stronger.
  if (beatLen > 0.0 && beatLen / perPx > 6.0 * dpr) {
    float b = (bin - firstBeat) / beatLen;
    float k = floor(b + 0.5);
    if (k >= 0.0) {
      float distPx = abs(b - k) * beatLen / perPx;
      float line = 1.0 - smoothstep(0.3 * dpr, 0.9 * dpr, distPx);
      c = mix(c, cFg, line * (mod(k, 4.0) < 0.5 ? 0.18 : 0.08));
    }
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
    for (const name of ['bins', 'count', 'start', 'perPx', 'width', 'height', 'dpr', 'playhead', 'cue', 'cBg', 'cFg', 'cLow', 'cMid', 'cHigh', 'cPast', 'cCue', 'centerLine', 'beatLen', 'firstBeat', 'loopIn', 'loopOut', 'looping']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.u.hotCues = gl.getUniformLocation(prog, 'hotCues');
    this.tex = gl.createTexture();
    this.count = 0;
    this.cues = new Float32Array(HOT_CUES);
    this.setBins(new Uint8Array(4));
  }

  /** Uploads waveform bins (4 bytes each). */
  setBins(bytes) {
    const gl = this.gl;
    const count = Math.max(1, Math.floor(bytes.length / 4));
    const rows = Math.ceil(count / TEX_WIDTH);
    const padded = new Uint8Array(TEX_WIDTH * rows * 4);
    padded.set(bytes.subarray(0, count * 4));
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TEX_WIDTH, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, padded);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.count = bytes.length >= 4 ? count : 0;
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
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.bins, 0);
    gl.uniform1i(this.u.count, this.count);
    gl.uniform1f(this.u.start, view.start);
    gl.uniform1f(this.u.perPx, view.perPx);
    gl.uniform1f(this.u.width, this.canvas.width);
    gl.uniform1f(this.u.height, this.canvas.height);
    gl.uniform1f(this.u.dpr, window.devicePixelRatio || 1);
    gl.uniform1f(this.u.playhead, view.playhead);
    gl.uniform1f(this.u.cue, view.cue);
    gl.uniform1f(this.u.centerLine, view.centerLine ? 1 : 0);
    gl.uniform1f(this.u.beatLen, view.beatLen ?? 0);
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
