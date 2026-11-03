// GPU waveform renderer (WebGL2). Bins are uploaded once per track as an
// RGBA8 texture (peak, low, mid, high); each frame only a few uniforms
// change, so drawing costs almost nothing on the CPU.
//
// The look: one mirrored, anti-aliased envelope filled with a soft
// gradient. Its hue follows the spectrum, from the deck colour where the
// music is bass-heavy to a pale tint where it's bright. What has already
// played is desaturated, beats are short ticks at the edges, and the play
// head has a soft glow.

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
uniform float height;     // canvas height in px
uniform float dpr;        // device pixel ratio, to keep lines a constant CSS width
uniform float playhead;   // bin index of the play position
uniform float cue;        // bin index of the cue point (-1 = none)
uniform vec3 cBg;
uniform vec3 cAccent;
uniform float centerLine; // 1 = scrolling view with a fixed centre play head
uniform float beatLen;    // bins per beat (0 = no beatgrid)
uniform float firstBeat;  // bin index of beat 0

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

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  float px = uv.x * width;
  float pyFromCenter = abs(uv.y - 0.5) * height; // px from the centre line
  float half_ = height * 0.5;
  float bin = start + px * perPx;

  // Average neighbouring columns a little so the outline isn't jagged.
  vec4 v = sampleColumn(px) * 0.5 + (sampleColumn(px - 1.0) + sampleColumn(px + 1.0)) * 0.25;

  // Envelope height in px, with 2 px of headroom top and bottom.
  float h = clamp(v.r, 0.0, 1.0) * (half_ - 2.0 * dpr);
  float aa = 0.9 * dpr;
  float inside = 1.0 - smoothstep(h - aa, h + aa, pyFromCenter);

  // Spectral tint: bass-heavy columns keep the deck colour, bright ones
  // move towards a pale version of it.
  float energy = v.g + v.b + v.a + 1e-4;
  float bright = clamp((v.b * 0.55 + v.a * 1.1) / energy, 0.0, 1.0);
  vec3 pale = mix(cAccent, vec3(1.0), 0.72);
  vec3 tone = mix(cAccent, pale, smoothstep(0.15, 0.75, bright));

  // Soft gradient: brightest at the centre, fading towards the edge.
  float rel = h > 0.0 ? pyFromCenter / max(h, 1.0) : 1.0;
  vec3 fill = tone * mix(1.08, 0.55, smoothstep(0.0, 1.0, rel));
  float alpha = mix(0.95, 0.7, rel);

  // Played part: desaturated and dimmer.
  if (bin < playhead) {
    fill = mix(vec3(luma(fill)), fill, 0.18) * 0.62;
    alpha *= 0.85;
  }

  vec3 c = mix(cBg, fill, inside * alpha);

  // Beat ticks along the top and bottom edges, longer on every 4th beat.
  if (beatLen > 0.0 && beatLen / perPx > 6.0 * dpr) {
    float b = (bin - firstBeat) / beatLen;
    float k = floor(b + 0.5);
    if (k >= 0.0) {
      float distPx = abs(b - k) * beatLen / perPx;
      bool bar = mod(k, 4.0) < 0.5;
      float len = (bar ? 0.2 : 0.11) * half_;
      float fromEdge = half_ - pyFromCenter;
      float tick = (1.0 - smoothstep(0.35 * dpr, 1.1 * dpr, distPx)) * (1.0 - smoothstep(len - aa, len + aa, fromEdge));
      c = mix(c, bar ? vec3(1.0) : mix(cBg, vec3(1.0), 0.6), tick * (bar ? 0.85 : 0.55));
    }
  }

  // Cue marker: a thin line with a small triangle at the top.
  if (cue >= 0.0) {
    float dx = abs(bin - cue) / perPx;
    vec3 cueC = vec3(1.0, 0.36, 0.42);
    float line = 1.0 - smoothstep(0.4 * dpr, 1.2 * dpr, dx);
    float fromTop = (1.0 - uv.y) * height;
    float tri = 1.0 - smoothstep(-aa, aa, dx - (6.0 * dpr - fromTop));
    c = mix(c, cueC, max(line * 0.75, tri));
  }

  // Play head: a crisp line with a soft glow in the deck colour.
  float dPlay = centerLine > 0.5 ? abs(px - width * 0.5) : abs(bin - playhead) / perPx;
  float glow = exp(-pow(dPlay / (6.0 * dpr), 2.0)) * (centerLine > 0.5 ? 0.35 : 0.2);
  c += cAccent * glow;
  float core = 1.0 - smoothstep(0.5 * dpr, 1.3 * dpr, dPlay);
  c = mix(c, mix(cAccent, vec3(1.0), 0.6), core);

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
    for (const name of ['bins', 'count', 'start', 'perPx', 'width', 'height', 'dpr', 'playhead', 'cue', 'cBg', 'cAccent', 'centerLine', 'beatLen', 'firstBeat']) {
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
   *           centerLine: boolean, colors: { cBg: number[], cAccent: number[] },
   *           beatLen?: number, firstBeat?: number }} view
   *   `start`, `playhead`, `cue`, `beatLen` and `firstBeat` are in bins;
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
    gl.uniform3fv(this.u.cBg, view.colors.cBg);
    gl.uniform3fv(this.u.cAccent, view.colors.cAccent);
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

/** Reads the theme colours from CSS custom properties. */
export function themeColors(accentVar) {
  return { cBg: cssColor('--panel'), cAccent: cssColor(accentVar) };
}
