// The name in the footer, drawn with WebGL (the word too, so it lines up
// exactly with its grooves; the page's text stays for layout and is
// hidden). Nothing moves (or runs) until the pointer comes over the word.
//
// The modes:
//   lamp          a lamp you carry over the record: the grooves under it
//                 catch a long streak of light running across them, as on
//                 real vinyl, with a cool and a warm fringe; it trails the
//                 pointer a little
//   lamp-warp     the lamp, and the grooves bend gently apart round it
//   ripples       rings run out from the pointer through the grooves,
//                 bending them a little and catching the lamp's colours
//   lamp-ripples  both
//
// Each thing on screen has one control (see T): the letters, the gaps
// between the grooves, the groove lines and the outline are each a colour
// with its own opacity, drawn in that order, one over the other, inside
// the letters. The page background is CSS. The lamp's light is added on
// the lines and keeps its own colours.
//
// The pointer is followed on a critically damped spring, so nothing jumps
// and nothing overshoots; the loop stops once everything has settled, so a
// still pointer (or none) costs nothing. Reduced motion keeps the light and
// the warp, but nothing travels: no rings, and no lag.
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

export let ready = false;
// Colours are [r, g, b, a], 0 to 1.
export const T = {
  mode: 'lamp',
  pitch: 8,          // groove spacing, CSS px
  tilt: 0,           // groove angle, degrees (0: as they lie, nearly level)
  stroke: 0,         // outline width, CSS px (0: none)
  warp: 3,           // lamp-warp: how far the grooves bend at most, CSS px
  rippleSpeed: 0.85, // how fast rings run out, em a second
  rippleBend: 2,     // how far a ring bends the grooves at most, CSS px
  letter: [1, 1, 1, 11 / 255],
  gap: [0, 0, 0, 0],
  line: [1, 1, 1, 61 / 255],
  outline: [1, 1, 1, 1],
};
// How many frames have been drawn (for checking it stops when idle).
export const stats = { frames: 0 };

// Which number each mode has in the shader.
const MODES = { lamp: 0, 'lamp-warp': 1, ripples: 2, 'lamp-ripples': 3 };
export const isGL = (m) => m in MODES;
const hasLamp = (m) => m !== 'ripples';
const hasRipples = (m) => m === 'ripples' || m === 'lamp-ripples';
// How far a ring runs before it has faded, in em.
const RUN = 2.2;
const life = () => Math.min(8, RUN / Math.max(0.1, T.rippleSpeed));

// How the effect follows the pointer: a spring's stiffness, critically
// damped (it lags, then settles, and never overshoots). The lamp is heavy.
const SPRING = { lamp: 42, 'lamp-warp': 42, ripples: 90, 'lamp-ripples': 42 };

/** Any CSS colour, as [r, g, b, a] from 0 to 1 (or null if it isn't one).
 *  Hex is read directly; anything else is drawn opaque to read its colour
 *  (so a faint one keeps its exact colour), with its alpha read apart. */
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
export function rgba(css) {
  if (typeof css !== 'string') return null;
  const s = css.trim().toLowerCase();
  const hex = s.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const b = h.match(/../g).map((c) => parseInt(c, 16) / 255);
    return [b[0], b[1], b[2], b[3] ?? 1];
  }
  if (!probe) return null;
  // "oklch(… / 0.5)", "color(display-p3 … / 50%)", "rgb(… / 0.5)", "rgba(…, 0.5)".
  let a = 1;
  let opaque = s;
  const slash = s.match(/\s*\/\s*([\d.]+)(%?)\s*\)$/);
  const comma = s.match(/^(rgba|hsla)\((.*),\s*([\d.]+)(%?)\s*\)$/);
  if (slash) {
    a = parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    opaque = s.slice(0, slash.index) + ')';
  } else if (comma) {
    a = parseFloat(comma[3]) / (comma[4] ? 100 : 1);
    opaque = `${comma[1].slice(0, 3)}(${comma[2]})`;
  }
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = opaque;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, Math.max(0, Math.min(1, a))];
}

const FRAG = `
precision highp float;
uniform sampler2D uText;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uCentre;   // record centre, CSS px from the canvas's top left
uniform float uAspect;  // how much the record is foreshortened (y squeezed)
uniform vec2 uPivot;    // the word's middle: the grooves turn round it
uniform vec2 uRot;      // cos, sin of minus the tilt
uniform float uPitch;   // groove spacing, CSS px
uniform vec3 uHover;    // pointer x, y (spring-followed), strength
uniform float uLamp;    // 1 with the lamp
uniform float uWarp;    // the warp's most, CSS px (0: none)
uniform float uRipples; // 1 with rings
uniform vec3 uRing;     // ring speed (CSS px a second), most bend (CSS px), life (s)
uniform float uEm;      // the word's font size, CSS px: effects scale with it
uniform float uTime;    // seconds, while running
uniform vec2 uFar;      // the lamp's streak points away from here
uniform vec3 uPts[8];   // rings: (x, y, when)
uniform vec4 uLetter;   // the letters' fill
uniform vec4 uGap;      // between the grooves
uniform vec4 uLine;     // the groove lines
uniform vec4 uOutline;  // round the letters
uniform float uStroke;  // outline width, CSS px

const float PI = 3.14159265;
// The lamp's fringes: cool on one side, warm on the other.
const vec3 COOL = vec3(0.239, 0.706, 1.0);
const vec3 WARM = vec3(1.0, 0.608, 0.271);
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Soft lines from a few harmonics, each faded as it nears the pixel size,
// so their average never changes and nothing shimmers. g counts grooves;
// fg is how many grooves one pixel covers; sig is the line's softness.
float grooveLines(float g, float fg, float sig) {
  float lines = 0.0, norm = 0.0;
  for (int k = 1; k <= 12; k++) {
    float fk = float(k);
    float coef = exp(-2.0 * PI * PI * sig * sig * fk * fk);
    norm += 2.0 * coef;
    float att = exp(-7.0 * fk * fk * fg * fg) * (1.0 - smoothstep(0.3, 0.48, fk * fg));
    lines += 2.0 * coef * att * cos(2.0 * PI * fk * g);
  }
  return lines / norm;
}

// A white core with a cool fringe at x = -1.5 and a warm one at x = +1.5
// (x in the light's own widths): how much light, and its colour.
void prism(float x, out float lit, out vec3 tint) {
  float core = exp(-x * x);
  float glow = exp(-x * x / 16.0);
  float cool = exp(-(x + 1.5) * (x + 1.5));
  float warm = exp(-(x - 1.5) * (x - 1.5));
  tint = (vec3(1.0) * (core + 0.28 * glow) + COOL * 0.55 * cool + WARM * 0.55 * warm)
    / max(core + 0.28 * glow + 0.55 * cool + 0.55 * warm, 1e-3);
  lit = core + 0.28 * glow + 0.4 * (cool + warm);
}

vec2 turn(vec2 p) {
  vec2 q = p - uPivot;
  return uPivot + vec2(uRot.x * q.x - uRot.y * q.y, uRot.y * q.x + uRot.x * q.y);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uSize;
  float text = texture2D(uText, uv).r;
  if (text < 0.003) { gl_FragColor = vec4(0.0); return; }
  // Everything below is worked out as if the grooves were untilted.
  vec2 px = turn(uv * uSize / uDpr);
  vec2 hp = turn(uHover.xy);
  float on = uHover.z;
  vec2 dp = px - hp;
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  float push = 0.0;    // how far the grooves are pushed, CSS px up
  float lit = 0.0;     // light on the grooves, 0 to 1
  vec3 tint = vec3(1.0);

  if (uLamp > 0.5) {
    // On grooved vinyl a lamp's reflection is a streak running across the
    // grooves (along a radius), not a spot. It leans away from a point
    // well below the word, so it fans out a little at the sides.
    vec2 dir = normalize(hp - uFar);
    float u = dot(dp, vec2(-dir.y, dir.x));
    float t = dot(dp, dir);
    float w = 0.055 * uEm;
    prism(u / w, lit, tint);
    lit *= on * exp(-t * t / (0.75 * 0.75 * uEm * uEm));
  }
  if (uWarp > 0.0) {
    // A gentle lens: the grooves part round the lamp, never folding over.
    // dp.y e^(-r^2/s^2) peaks at 0.43 s, so this peaks at uWarp.
    float s = 0.17 * uEm;
    push += uWarp / 0.4289 * on * (dp.y / s) * exp(-dot(dp, dp) / (s * s));
  }
  if (uRipples > 0.5) {
    // Each ring runs out from where the pointer was when it sounded,
    // widening and fading; the grooves lift a little as it passes, and it
    // catches the lamp's colours across its width.
    float rl = 0.0;
    vec3 rt = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec3 p = uPts[i];
      float age = uTime - p.z;
      if (age < 0.0 || age > uRing.z) continue;
      float R = uRing.x * age;
      float w = 0.07 * uEm * (1.0 + 0.95 * R / uEm);
      float x = (length(px - p.xy) - R) / w;
      float f = age / uRing.z;
      float fade = (1.0 - f) * (1.0 - f) * smoothstep(0.0, 0.12, age);
      push += on * uRing.y / 0.4289 * x * exp(-x * x) * fade;
      float l;
      vec3 c;
      prism(x * 1.6, l, c);
      l *= fade;
      rl += l;
      rt += c * l;
    }
    rl *= on;
    rt *= on;
    float total = lit + rl;
    tint = (tint * lit + rt) / max(total, 1e-3);
    lit = min(1.0, total);
  }

  // The grooves, from the bent radius (filtered by how fast that changes
  // across a pixel, so bending them never makes them shimmer). groove is
  // 1 on a line's crest and 0 between.
  vec2 d = px - uCentre;
  d.y *= uAspect;
  float r = length(d);
  float rr = r + push * uAspect;
  float P = uPitch * uAspect;
  float fg = max(fwidth(rr), 1e-3) / P;
  float lines = grooveLines(rr / P, fg, max(0.45 / uPitch, 0.8 * fg));
  float duty = min(1.0, 1.25 / uPitch);
  float groove = clamp((1.0 + lines) * duty, 0.0, 1.0);

  // Painted inside the letters, one over the other (premultiplied):
  // the fill, the gaps, the lines with any light, the outline.
  float fA = uLetter.a * text;
  vec3 pre = uLetter.rgb * fA;
  float al = fA;
  float gA = uGap.a * (1.0 - groove) * text;
  pre = uGap.rgb * gA + pre * (1.0 - gA);
  al = gA + al * (1.0 - gA);
  float lA = clamp(uLine.a + 0.9 * lit, 0.0, 1.0) * groove * text;
  vec3 lc = mix(uLine.rgb, tint, clamp(lit * 1.5, 0.0, 1.0));
  pre = lc * lA + pre * (1.0 - lA);
  al = lA + al * (1.0 - lA);
  if (uStroke > 0.0 && uOutline.a > 0.0) {
    // Where the letters end within uStroke (from their own shape, so
    // overlapping contours in the font don't show).
    float inner = 1.0;
    vec2 rad = uStroke * uDpr / uSize;
    for (int i = 0; i < 12; i++) {
      float t = float(i) * PI / 6.0;
      inner = min(inner, texture2D(uText, uv + rad * vec2(cos(t), sin(t))).r);
    }
    float oA = uOutline.a * text * (1.0 - inner);
    pre = uOutline.rgb * oA + pre * (1.0 - oA);
    al = oA + al * (1.0 - oA);
  }
  gl_FragColor = vec4(pre + n, clamp(al + n, 0.0, 1.0));
}`;

let prog = null;
const U = {};
let tex = null;
let geo = null;
let running = false;
let last = 0;
let clock = 0; // seconds the loop has run (it only counts while running)
// Where the pointer is (tx, ty), where the effect is (x, y, moving at vx,
// vy), and how much it shows (on, easing toward want).
const hover = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, on: 0, want: 0 };
// Rings, each [x, y, when].
const pts = Array.from({ length: 8 }, () => [0, 0, -99]);
let next = 0;
let lastPt = { x: 0, y: 0, t: -99 };
// The phone's one-off play-through: when it started (ms), or 0.
let demoAt = 0;
let mode = T.mode;

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
  for (const n of ['uText', 'uSize', 'uDpr', 'uCentre', 'uAspect', 'uPivot', 'uRot', 'uPitch', 'uHover', 'uLamp', 'uWarp',
    'uRipples', 'uRing', 'uEm', 'uTime', 'uFar', 'uPts', 'uLetter', 'uGap', 'uLine', 'uOutline', 'uStroke']) U[n] = gl.getUniformLocation(prog, n);
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
  const x = t.getContext('2d', { alpha: false });
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  x.scale(dpr, dpr);
  x.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  if ('letterSpacing' in x) x.letterSpacing = cs.letterSpacing;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  // Centre the ink, as the page does (letter-spacing adds a trailing gap).
  const ls = parseFloat(cs.letterSpacing) || 0;
  const tx = c.width / 2 - ls / 2;
  x.fillStyle = '#fff';
  x.fillText(word.dataset.text, tx, baseline);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t);
  // The grooves: arcs of the CSS ellipse "100% 50% at 50% 135%" of the
  // word's own box, so they're long and shallow, nearly level.
  const box = word.getBoundingClientRect();
  geo = { w, h, dpr, em: size, cx: c.width / 2,
    cy: box.top - c.top + box.height * 1.35, aspect: box.width / (box.height * 0.5),
    // The tilt turns them round the middle of the letters.
    pivot: { x: c.width / 2, y: baseline - size * 0.36 },
    // The lamp's streaks lean away from here.
    far: { x: c.width / 2, y: baseline + size * 2.6 },
    width: c.width, baseline };
  return geo;
}

// Everything goes back to rest (a new mode starts clean).
function reset() {
  for (const p of pts) p[2] = -99;
  lastPt.t = -99;
  hover.vx = hover.vy = 0;
}

// The one-off play-through on phones: a slow pass along the word, as if a
// finger drew across it, then it lets go.
function demoPoint(now) {
  const t = (now - demoAt) / 2800;
  if (t >= 1) { demoAt = 0; hover.want = 0; return; }
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  hover.tx = geo.width * (0.14 + 0.72 * e);
  hover.ty = geo.baseline - geo.em * (0.36 + 0.08 * Math.sin(t * Math.PI * 2));
  hover.want = t < 0.85 ? 1 : 0;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  stats.frames++;
  if (mode !== T.mode) { mode = T.mode; reset(); }
  if (!isGL(mode)) return false;
  if (!geo) layout();
  if (!geo) return false;
  if (demoAt) demoPoint(now);
  clock += dt;
  const still = reduced.matches;

  // Shows over a quarter second or so; goes over about a second.
  hover.on += (hover.want - hover.on) * Math.min(1, dt * (hover.want ? 5 : 2.6));
  if (Math.abs(hover.on - hover.want) < 0.01) hover.on = hover.want;

  // Follow the pointer on a critically damped spring (in small steps, so
  // it's steady at any frame rate).
  const k = SPRING[mode];
  if (still) {
    hover.x = hover.tx;
    hover.y = hover.ty;
    hover.vx = hover.vy = 0;
  } else {
    const c = 2 * Math.sqrt(k);
    for (let s = 0, n = Math.ceil(dt / (1 / 240)); s < n; s++) {
      const h = dt / n;
      hover.vx += (k * (hover.tx - hover.x) - c * hover.vx) * h;
      hover.vy += (k * (hover.ty - hover.y) - c * hover.vy) * h;
      hover.x += hover.vx * h;
      hover.y += hover.vy * h;
    }
  }

  // Rings: one every second or so while it's over the word (more often
  // when they're quick, so one is always running), and sooner once it
  // has moved a fair way.
  const rings = hasRipples(mode) && !still;
  if (rings && hover.want) {
    const moved = Math.hypot(hover.x - lastPt.x, hover.y - lastPt.y);
    if (clock - lastPt.t > Math.min(0.95, 0.8 * life()) || (moved > geo.em * 0.6 && clock - lastPt.t > 0.3)) {
      pts[next] = [hover.x, hover.y, clock];
      next = (next + 1) % pts.length;
      Object.assign(lastPt, { x: hover.x, y: hover.y, t: clock });
    }
  }

  const a = (-T.tilt * Math.PI) / 180;
  const col = (v) => gl.uniform4f(U[v[0]], ...T[v[1]]);
  gl.viewport(0, 0, geo.w, geo.h);
  gl.uniform1i(U.uText, 0);
  gl.uniform2f(U.uSize, geo.w, geo.h);
  gl.uniform1f(U.uDpr, geo.dpr);
  gl.uniform2f(U.uCentre, geo.cx, geo.cy);
  gl.uniform1f(U.uAspect, geo.aspect);
  gl.uniform2f(U.uPivot, geo.pivot.x, geo.pivot.y);
  gl.uniform2f(U.uRot, Math.cos(a), Math.sin(a));
  gl.uniform1f(U.uPitch, T.pitch);
  gl.uniform3f(U.uHover, hover.x, hover.y, hover.on);
  gl.uniform1f(U.uLamp, hasLamp(mode) ? 1 : 0);
  gl.uniform1f(U.uWarp, mode === 'lamp-warp' ? T.warp : 0);
  gl.uniform1f(U.uRipples, hasRipples(mode) ? 1 : 0);
  gl.uniform3f(U.uRing, T.rippleSpeed * geo.em, T.rippleBend, life());
  gl.uniform1f(U.uEm, geo.em);
  gl.uniform1f(U.uTime, clock);
  gl.uniform2f(U.uFar, geo.far.x, geo.far.y);
  gl.uniform3fv(U.uPts, pts.flat());
  for (const v of [['uLetter', 'letter'], ['uGap', 'gap'], ['uLine', 'line'], ['uOutline', 'outline']]) col(v);
  gl.uniform1f(U.uStroke, T.stroke);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Keep going while anything is still moving: the fade, the spring, a
  // ring still running out, or (while over the word) the rings to come.
  if (demoAt) return true;
  if (hover.on !== hover.want) return true;
  if (hover.on === 0) return false;
  if (!still && (Math.abs(hover.tx - hover.x) > 0.2 || Math.abs(hover.ty - hover.y) > 0.2 || Math.hypot(hover.vx, hover.vy) > 2)) return true;
  if (rings && (hover.want || pts.some((p) => clock - p[2] < life()))) return true;
  return false;
}

function loop(now) {
  if (frame(now)) requestAnimationFrame(loop);
  else running = false;
}
export function wake() {
  if (!prog || running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}
export function relayout() {
  geo = null;
  wake();
}

/** From the page's pointer handler: where the pointer is over the word
 *  (canvas-local CSS px), or null once it has left. */
export function point(p) {
  if (p) {
    // Coming in from nothing, start right there (not flying in from afar).
    if (hover.want === 0 && hover.on < 0.02) {
      hover.x = p.x;
      hover.y = p.y;
      hover.vx = hover.vy = 0;
      Object.assign(lastPt, { x: p.x, y: p.y, t: -99 });
    }
    Object.assign(hover, { tx: p.x, ty: p.y, want: 1 });
    demoAt = 0;
  } else hover.want = 0;
  wake();
}

/** The one-off play-through, for screens with no pointer to hover. */
export function demo() {
  if (reduced.matches || !geo && !layout()) return;
  demoAt = performance.now();
  hover.on = 0;
  hover.x = hover.tx = geo.width * 0.14;
  hover.y = hover.ty = geo.baseline - geo.em * 0.36;
  hover.vx = hover.vy = 0;
  lastPt.t = -99;
  wake();
}

/** For checking: where the effect is now, and where it's headed. */
export const follower = () => ({ x: hover.x, y: hover.y, tx: hover.tx, ty: hover.ty, on: hover.on });

try {
  if (init()) {
    ready = true;
    new ResizeObserver(relayout).observe(word);
    document.fonts?.ready.then(relayout);
  }
} catch (err) {
  console.warn('foot-fx:', err);
}
