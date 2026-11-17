// The name in the footer, drawn as a record (data-foot="record" or
// "streak"; the plain CSS grooves, "grooves", don't need this file).
//
// The letters are cut from a record lying back below the word: true
// grooves (filtered to the pixel, so they never shimmer), a soft band for
// each song, and a lamp's light on them, as in the hero's record. Still
// until the pointer comes over the word:
//   record  the grooves show round the pointer, and the record turns
//           slowly while it's there, its reflections sliding round
//   streak  the grooves are always faintly there; the ones under the
//           pointer catch the light along their arc, as in the hero
// The word itself is drawn here too (so it lines up exactly with its
// grooves); the page's text stays for layout and is hidden.
const word = document.querySelector('.foot-word');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.createElement('canvas');
canvas.className = 'foot-fx';
canvas.setAttribute('aria-hidden', 'true');
word.append(canvas);
// A zero-size mark on the word's baseline, to draw the letters in the right place.
const base = document.createElement('i');
base.className = 'foot-base';
word.append(base);
const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });

export const T = { mode: 'record', pitch: 4, rest: 0, cut: 0.22 };

const FRAG = `
precision highp float;
uniform sampler2D uText;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uCentre;   // record centre, CSS px from the canvas's top left
uniform float uAspect;  // how much the record is foreshortened (y squeezed)
uniform float uPitch;   // groove spacing, CSS px (on the word's middle row)
uniform float uSpin;
uniform vec3 uHover;    // pointer x, y, strength
uniform float uMode;    // 0 record, 1 streak
uniform float uRest;    // how much of the grooves show at rest

const float PI = 3.14159265;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uSize;
  float text = texture2D(uText, uv).a;
  if (text < 0.003) { gl_FragColor = vec4(0.0); return; }
  vec2 px = uv * uSize / uDpr;
  vec2 d = px - uCentre;
  d.y *= uAspect;
  float r = length(d);
  float a = atan(-d.y, d.x);
  float fr = max(fwidth(r), 1e-3);

  // Grooves: soft lines from a few harmonics, each faded as it nears the
  // pixel size, so their average never changes and nothing shimmers.
  float P = uPitch * uAspect;
  float g = r / P;
  float fg = fr / P;
  float sig = clamp(0.8 * fg, 0.03, 0.12);
  float lines = 0.0, norm = 0.0;
  for (int k = 1; k <= 12; k++) {
    float fk = float(k);
    float coef = exp(-2.0 * PI * PI * sig * sig * fk * fk);
    norm += 2.0 * coef;
    float att = exp(-7.0 * fk * fk * fg * fg) * (1.0 - smoothstep(0.3, 0.48, fk * fg));
    lines += 2.0 * coef * att * cos(2.0 * PI * fk * g);
  }
  lines /= norm;

  // Songs: bands of uneven width with a quiet run between.
  float W = 36.0 * P;
  float idx = floor(r / W);
  float u = fract(r / W);
  float inSong = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.9, 0.95, u));
  float loud = 0.82 + 0.18 * sin(PI * u) + 0.06 * sin(r / 23.0 + idx * 1.7);
  float L = mix(0.62, loud, inSong) * 0.6 + 0.4;
  L *= mix(0.7, 1.0 + lines, inSong);

  // Light: a fixed sheen, and short runs of groove that catch it, turning
  // with the record.
  float sheen = 0.22 * cos(2.0 * (a + 1.1));
  float b = a - uSpin;
  float seg = 2.0 * PI / 5.0;
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  float la = (mod(b - ph, seg) - 0.5 * seg) * r / 260.0;
  float du = (u - 0.5) / 0.3;
  float glint = exp(-la * la - du * du) * inSong;
  L = L * (1.0 + sheen) + 1.4 * glint * (0.4 + 0.6 * (1.0 + lines) * 0.5);

  // Where the grooves show.
  vec2 hp = vec2(uHover.x, uHover.y);
  float show = uRest;
  float lit = 0.0;
  if (uMode < 0.5) {
    float dist = length(px - hp) / 300.0;
    show = max(show, uHover.z * exp(-dist * dist * 2.2));
  } else {
    show = max(show, 0.32);
    vec2 hd = hp - uCentre;
    hd.y *= uAspect;
    float hr = length(hd);
    float ha = atan(-hd.y, hd.x);
    float dr = (r - hr) / (2.6 * P);
    float da = atan(sin(a - ha), cos(a - ha)) * max(hr, 100.0) / 200.0;
    lit = uHover.z * exp(-dr * dr - da * da) * (0.35 + 0.65 * (1.0 + lines) * 0.5);
  }

  float alpha = text * (0.045 + show * 0.16 * L + lit * 0.55);
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(vec3(0.9, 0.92, 0.96) * alpha + n, clamp(alpha + n, 0.0, 1.0));
}`;

let prog = null;
let U = {};
let tex = null;
let geo = null;
let running = false;
let spin = 0;
let last = 0;
const hover = { x: -1e4, y: -1e4, on: 0, want: 0 };

function init() {
  if (!gl) return false;
  gl.getExtension('OES_standard_derivatives');
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, '#extension GL_OES_standard_derivatives : enable\n' + FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uText', 'uSize', 'uDpr', 'uCentre', 'uAspect', 'uPitch', 'uSpin', 'uHover', 'uMode', 'uRest']) U[n] = gl.getUniformLocation(prog, n);
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return true;
}

// The letters, drawn into a texture the size of the canvas, on the same
// baseline and in the same type as the page's word.
function layout() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = canvas.getBoundingClientRect();
  const w = Math.round(c.width * dpr);
  const h = Math.round(c.height * dpr);
  if (!w || !h) return null;
  canvas.width = w;
  canvas.height = h;
  const cs = getComputedStyle(word);
  const size = parseFloat(cs.fontSize);
  const baseline = base.getBoundingClientRect().top - c.top;
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const x = t.getContext('2d');
  x.scale(dpr, dpr);
  x.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  if ('letterSpacing' in x) x.letterSpacing = cs.letterSpacing;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  // Centre the ink, as the page does (letter-spacing adds a trailing gap).
  const ls = parseFloat(cs.letterSpacing) || 0;
  x.fillText(word.dataset.text, c.width / 2 - ls / 2, baseline);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t);
  // The record's centre: well below the word, so its grooves arc gently
  // across the letters, foreshortened as if lying back.
  geo = { w, h, dpr, cx: c.width / 2, cy: baseline + size * 0.55, aspect: 2.0 };
  return geo;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (!geo) layout();
  if (!geo) return false;
  hover.on += (hover.want - hover.on) * Math.min(1, dt * (hover.want ? 4 : 2));
  if (Math.abs(hover.on - hover.want) < 0.002) hover.on = hover.want;
  // It turns only while the pointer is on it.
  if (!reduced.matches) spin += dt * hover.on * ((Math.PI * 2) / 30);
  gl.viewport(0, 0, geo.w, geo.h);
  gl.uniform1i(U.uText, 0);
  gl.uniform2f(U.uSize, geo.w, geo.h);
  gl.uniform1f(U.uDpr, geo.dpr);
  gl.uniform2f(U.uCentre, geo.cx, geo.cy);
  gl.uniform1f(U.uAspect, geo.aspect);
  gl.uniform1f(U.uPitch, T.pitch);
  gl.uniform1f(U.uSpin, spin);
  gl.uniform3f(U.uHover, hover.x, hover.y, hover.on);
  gl.uniform1f(U.uMode, T.mode === 'streak' ? 1 : 0);
  gl.uniform1f(U.uRest, T.rest);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return hover.on !== hover.want || hover.on > 0;
}

function loop(now) {
  if (frame(now) && T.mode !== 'grooves') requestAnimationFrame(loop);
  else running = false;
}
export function wake() {
  if (!prog || T.mode === 'grooves') return;
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}
export function relayout() {
  geo = null;
  wake();
}

/** From the page's pointer handler: where the pointer is over the word, or null. */
export function point(p) {
  if (p) Object.assign(hover, { x: p.x, y: p.y, want: 1 });
  else hover.want = 0;
  wake();
}

try {
  if (init()) {
    new ResizeObserver(relayout).observe(word);
    document.fonts?.ready.then(relayout);
  }
} catch (err) {
  console.warn('foot-fx:', err);
}
