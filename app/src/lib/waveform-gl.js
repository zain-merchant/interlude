// GPU waveform renderer (WebGL2). Bins are uploaded once per track as an
// RGBA8 texture (peak, low, mid, high); each frame only a few uniforms
// change, so drawing costs almost nothing on the CPU.

const TEX_WIDTH = 4096;

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
uniform float playhead;   // bin index of the play position
uniform float cue;        // bin index of the cue point (-1 = none)
uniform vec3 cLow;
uniform vec3 cMid;
uniform vec3 cHigh;
uniform vec3 cBg;
uniform vec3 cAccent;
uniform float centerLine; // 1 = draw a fixed centre playhead (scrolling view)
uniform float beatLen;    // bins per beat (0 = no beatgrid)
uniform float firstBeat;  // bin index of beat 0

vec4 fetchBin(int i) {
  return texelFetch(bins, ivec2(i % ${TEX_WIDTH}, i / ${TEX_WIDTH}), 0);
}

void main() {
  float px = uv.x * width;
  float b0 = start + floor(px) * perPx;
  float b1 = b0 + max(perPx, 1.0);
  vec4 v = vec4(0.0);
  // Max over the bins under this pixel, sampled at up to 16 points.
  float steps = min(16.0, max(1.0, perPx));
  for (float s = 0.0; s < 16.0; s += 1.0) {
    if (s >= steps) break;
    int i = int(b0 + (b1 - b0) * (s / steps));
    if (i >= 0 && i < count) v = max(v, fetchBin(i));
  }
  float y = abs(uv.y - 0.5) * 2.0;
  vec3 c = cBg;
  float a = 0.0;
  if (y <= v.a * 0.7) { c = cHigh; a = 1.0; }
  else if (y <= v.b * 0.85) { c = cMid; a = 1.0; }
  else if (y <= v.g) { c = cLow; a = 1.0; }

  // Dim what has already played.
  float bin = start + px * perPx;
  if (bin < playhead && a > 0.0) c = mix(c, cBg, 0.55);

  // Beatgrid: a faint line per beat, a stronger one every 4 beats (bars are
  // counted from the first detected beat until downbeat detection lands).
  // Hidden when zoomed out so far that beats would blur together.
  if (beatLen > 0.0 && beatLen / perPx > 6.0) {
    float b = (bin - firstBeat) / beatLen;
    float k = floor(b + 0.5);
    float distPx = abs(b - k) * beatLen / perPx;
    if (distPx < 0.75 && k >= 0.0) {
      bool bar = mod(k, 4.0) < 0.5;
      c = mix(c, bar ? vec3(1.0, 0.32, 0.36) : vec3(1.0), bar ? 0.85 : 0.35);
    }
  }

  // Cue marker.
  if (cue >= 0.0 && abs(bin - cue) < perPx * 1.5) { c = mix(c, vec3(1.0, 0.25, 0.3), 0.9); a = 1.0; }
  // Play head.
  if (centerLine > 0.5 ? abs(px - width * 0.5) < 1.0 : abs(bin - playhead) < perPx * 1.0) { c = cAccent; a = 1.0; }

  color = vec4(c, 1.0);
}`;

function hexToRgb(hex) {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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
    for (const name of ['bins', 'count', 'start', 'perPx', 'width', 'playhead', 'cue', 'cLow', 'cMid', 'cHigh', 'cBg', 'cAccent', 'centerLine', 'beatLen', 'firstBeat']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.tex = gl.createTexture();
    this.count = 0;
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
   *           centerLine: boolean, colors: Record<string, string>,
   *           beatLen?: number, firstBeat?: number }} view
   *   `start`, `playhead`, `cue`, `beatLen` and `firstBeat` are in bins;
   *   `perPx` is bins per device pixel.
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
    gl.uniform1f(this.u.playhead, view.playhead);
    gl.uniform1f(this.u.cue, view.cue);
    gl.uniform1f(this.u.centerLine, view.centerLine ? 1 : 0);
    gl.uniform1f(this.u.beatLen, view.beatLen ?? 0);
    gl.uniform1f(this.u.firstBeat, view.firstBeat ?? 0);
    for (const k of ['cLow', 'cMid', 'cHigh', 'cBg', 'cAccent']) gl.uniform3fv(this.u[k], hexToRgb(view.colors[k]));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** Reads the theme colours from CSS custom properties. */
export function themeColors(accentVar) {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n);
  return {
    cLow: v('--wave-low'), cMid: v('--wave-mid'), cHigh: v('--wave-high'),
    cBg: v('--panel'), cAccent: v(accentVar),
  };
}
