// Behind the hero: a record lying back in perspective, its centre behind
// the top of the app's screen, turning slowly. Its far side and rim arc up
// the page behind the hero's words; reflections slide round as it turns.
//
// Drawn with one small WebGL shader, at the screen's full pixel density, so
// it stays crisp: every pixel works out where it lies on the disc and how
// much light the grooves there give back.
//
// What keeps it even and quiet:
// - The grooves are a fixed pattern on the disc, filtered to the pixel: where
//   the record lies flattest (behind the headline) they pack closer on
//   screen, and as they near the pixel size they fade smoothly to their
//   average instead of aliasing. Their average never changes, so no part of
//   the disc is brighter just because the grooves bunch up there.
// - Light only nudges it: a broad, fixed sheen (two soft wedges either side
//   of the centre, as on a real record) and a soft warp in the pressing that
//   turns with the disc, each a few percent up or down, added, never
//   multiplied into hot spots or holes.
// - A touch of dither, so the soft gradients on the near-black page never
//   step into bands.
//
// The page uses the blend style (satin's soft bands with fine grooves over
// them) and the needle touch: hover and the grooves under the pointer catch
// the light along their arc; click to drop the needle in a groove, which
// lights warm and creeps slowly inward. fine, satin and off still work.
//
// A kick in the music lifts it a hair; with reduced motion it's one still
// frame.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const screen = document.querySelector('.shot .screen');
const canvas = document.querySelector('.ripples');
const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });

// The disc: about 1.8 times the content's width across, its centre just
// behind the top of the app's screen, lying back in perspective so its far
// rim arcs up behind the headline and its edge shows at the sides. The
// horizon sits this far (CSS px) above the top of the canvas: the far side
// narrows and its grooves crowd, the near side (under the screen) opens out.
const HORIZON = 1400;
// Where the far rim sits, CSS px from the canvas's top.
const RIM_TOP = 24;

/** A point on the page (CSS pixels from the canvas's top left) on the disc. */
function toRecord(x, y, g) {
  const f = g.d0 / Math.max(1, y + HORIZON);
  const qx = (x - g.cx) * f;
  const qy = ((1 - f) * g.d0) / g.tilt;
  return { r: Math.hypot(qx, qy), a: Math.atan2(qy, qx) };
}
// One turn every 40 seconds: slow, but its reflections can be seen moving.
const TURN = (Math.PI * 2) / 40;
// Set by eye with the Tune panel (see the end of this file): how far the
// whole record sits lower, how strong the needle's light is, and how much
// it moves on its own (the turn, and the lamp's light drifting slowly to
// and fro across it, so it's never quite still).
const T = { drop: 60, needle: 0.6, life: 1 };
// The lamp drifts this far either way (radians), once every this many seconds.
const DRIFT = 0.32;
const DRIFT_S = 22;
// A dropped needle's groove stays lit this long (s), then fades over this long.
const NEEDLE_HOLD = 2.5;
const NEEDLE_FADE = 2.5;
// Where the light comes from: up and to the right of the centre.
const FACING = -1.3;
const GAP = 8; // the quiet run between two songs, in the record's own pixels

const STYLES = {
  // lines: how much the single grooves show; satin: how much the songs show
  // as bands; level: overall strength.
  // sheen: how far the fixed light lifts the grooves facing it (and dims
  // those across from it).
  fine: { lines: 0.75, satin: 0, level: 0.052, sheen: 0.13 },
  satin: { lines: 0, satin: 1, level: 0.06, sheen: 0.13 },
  blend: { lines: 1, satin: 0.6, level: 0.056, sheen: 0.22 },
};
let style = 'blend';
let touch = 'needle';
let avg = 0;
let swell = 0;
let want = 0;
let lastKick = 0;
let spin = 0;
let drift = 0;
const needle = { on: false, r: 0, born: 0 };
const ripple = { on: false, r: 0, born: 0 };
// The pointer, in record terms (radius and angle), eased so the light on
// the grooves glides after it rather than jumping.
const hover = { r: 0, a: 0, on: 0, x: -1e4, y: -1e4 };
// Where the needle was last dropped: the pointer's own light stays off
// there (so nothing stays lit under a still pointer) until it moves away.
const quiet = { x: 0, y: 0, on: false };
let running = false;
let visible = true;

export function setStyle(v) {
  style = STYLES[v] ? v : 'blend';
  wake();
}
export function setVariant(v) {
  touch = v === 'off' ? 'off' : 'needle';
  if (touch === 'off') needle.on = ripple.on = false;
  wake();
}

/** Called with each level report from the app. */
export function hear(l) {
  avg += (l - avg) * 0.05;
  const now = performance.now();
  if (l > 0.12 && l > avg * 1.3 && now - lastKick > 900) {
    lastKick = now;
    want = 1;
  }
}

// Fixed pseudo-random numbers, so the record looks the same every visit.
const rand = (i, s = 1) => {
  const k = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return k - Math.floor(k);
};

const MAX_TRACKS = 24;
const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uSize;      // canvas, device pixels
uniform float uDpr;
uniform vec2 uCentre;    // record centre, CSS pixels from the canvas's top left
uniform vec2 uGeo;       // distance from the centre to the horizon, and the tilt
uniform vec4 uHoles[4];  // the hero's buttons, where nothing may show through
uniform float uHoleCount;
uniform float uHoleR;     // the buttons' corner radius
uniform vec2 uSpan;      // inner and outer radius, record pixels
uniform float uSpin;
uniform float uFacing;
uniform vec3 uStyle;     // lines, satin, level
uniform float uSheen;
uniform float uGlint;
uniform vec3 uHover;     // pointer radius, angle, strength
uniform float uSwell;
uniform vec2 uNeedle;    // radius, strength
uniform vec2 uRipple;    // radius, strength
uniform vec2 uTracks[${MAX_TRACKS}];
uniform float uTrackCount;

const float PI = 3.14159265;
// Groove spacing, record pixels: PITCH near the centre, opening out by
// PITCH_OUT more at the rim. The far side of the disc (behind the
// headline) is foreshortened hard; the wider spacing out there keeps its
// grooves about 5 CSS px apart, distinct hairlines rather than one band.
// The grooves stay true circles: spacing only changes with the radius.
const float PITCH = 6.0;
const float PITCH_OUT = 8.0;
const float HORIZON = ${HORIZON.toFixed(1)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  // Onto the disc, in perspective (see toRecord).
  float f = uGeo.x / max(1.0, px.y + HORIZON);
  vec2 q = vec2((px.x - uCentre.x) * f, (1.0 - f) * uGeo.x / uGeo.y);
  float r = length(q);
  // How many record pixels one device pixel covers here (larger where the
  // disc is flattest).
  float fr = max(fwidth(r), 1e-3);
  float R = uSpan.y;
  if (r > R + 2.0 * fr) { gl_FragColor = vec4(0.0); return; }
  // The disc, with a crisp edge, and the label hidden behind the screen.
  float edge = smoothstep(uSpan.x, uSpan.x + 40.0, r) * (1.0 - smoothstep(R - fr, R + fr, r));
  // Out at the rim: a smooth lead-in with no grooves, then the raised lip.
  float lead = smoothstep(R - 34.0, R - 26.0, r);
  float a = atan(q.y, q.x);

  // Which song this radius is in, and where in it.
  float inSong = 0.0;
  float u = 0.0;
  float idx = 0.0;
  float mid = r;
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    if (float(i) >= uTrackCount) break;
    vec2 t = uTracks[i];
    float soft = max(3.0, fr * 1.5);
    float w = smoothstep(t.x - soft, t.x + soft, r) * (1.0 - smoothstep(t.y - soft, t.y + soft, r));
    if (w > inSong) { inSong = w; u = clamp((r - t.x) / (t.y - t.x), 0.0, 1.0); idx = float(i); mid = 0.5 * (t.x + t.y); }
  }

  // The grooves: a train of soft lines, built from a few harmonics, each
  // faded out as it nears the pixel size. Its average is always 1.
  float pb = PITCH_OUT / uSpan.y;
  float g = log(1.0 + pb * r / PITCH) / pb;     // grooves counted out from the centre
  float fg = fr / (PITCH + pb * r);              // grooves per device pixel
  float lines = 0.0;
  // Hairlines stay about a device pixel fine wherever the grooves open out
  // (on the near side), and are soft bands where they crowd (the far side).
  float sig = clamp(0.8 * fg, 0.025, 0.1);
  float norm = 0.0;
  for (int k = 1; k <= 16; k++) {
    float fk = float(k);
    float coef = exp(-2.0 * PI * PI * sig * sig * fk * fk);   // line shape
    norm += 2.0 * coef;
    float att = exp(-7.0 * fk * fk * fg * fg) * (1.0 - smoothstep(0.3, 0.48, fk * fg));
    lines += 2.0 * coef * att * cos(2.0 * PI * fk * g);
  }
  lines /= norm; // the brightest line sits +1 over the average, which stays 1

  // Each song: a soft band, a little louder in its middle, its loudness
  // drifting gently across it, as the music does.
  float loud = 0.82 + 0.18 * sin(PI * u) + 0.07 * sin(r / 18.0 + idx * 1.7) * sin(r / 50.0 + idx);
  float satin = mix(0.62, loud, inSong);
  float fine = mix(0.7, 1.0 + lines, inSong);
  float L = mix(1.0, satin, uStyle.y) * mix(1.0, fine, uStyle.x);
  L = mix(L, 0.5, lead);

  // Light. The fixed sheen: two broad wedges either side of the centre.
  float sheen = uSheen * cos(2.0 * (a - uFacing));
  // The pressing is never perfectly even: a soft warp in it, a few hundred
  // pixels across, curling with the radius, turning with the record.
  float b = a - uSpin;
  float k1 = floor(mid / 140.0) + 3.0;
  float k2 = floor(mid / 90.0) + 5.0;
  float warp = 0.13 * sin(k1 * b + r / 80.0 + idx * 2.3) + 0.085 * sin(k2 * b - r / 55.0 + idx * 4.1);
  L *= 1.0 + sheen + warp * mix(0.6, 1.0, inSong);

  // Reflections, so it reads as spinning: in each song, a few short runs
  // of groove catch the light more than the rest (a slight ridge in the
  // pressing). They're fixed on the disc and turn with it, brightening as
  // they come round into the lamp's light and fading as they leave, the
  // way highlights slide round a record under a lamp.
  float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
  lamp *= lamp;
  float seg = 2.0 * PI / 3.0;
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  float la = mod(b - ph, seg) - 0.5 * seg;          // angle to the nearest one
  float arc = la * r / 220.0;
  float uc = 0.3 + 0.4 * fract(sin(idx * 17.3) * 9631.1);
  float du = (u - uc) / 0.3;
  float glint = exp(-arc * arc - du * du) * inSong;
  float onLines = mix(1.0, clamp(0.4 + 0.6 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
  L += uGlint * glint * (0.25 + 0.75 * lamp) * onLines * (1.0 - lead);
  // The lip at the very edge catches the light: a fine bright line that
  // shows the disc's outline, brightest where the lamp falls.
  float dl = (r - (R - 2.5)) / max(1.3, fr * 1.2);
  L += 1.1 * exp(-dl * dl) * (0.45 + 0.55 * lamp) * mix(0.35, 1.0, clamp((f - 1.0) * 4.0, 0.0, 1.0));

  // The pointer: the grooves at its radius catch the light along their own
  // run, a narrow streak following the arc either side of it rather than a
  // round glow, shining on the grooves themselves.
  if (uHover.z > 0.0) {
    float dr = (r - uHover.x) / 34.0;
    float da = atan(sin(a - uHover.y), cos(a - uHover.y));
    float s = da * max(uHover.x, 100.0) / 240.0;
    float streak = exp(-dr * dr) * exp(-s * s);
    float shine = mix(1.0, clamp(0.25 + 0.75 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
    L += 11.0 * uHover.z * streak * (0.45 + 0.55 * shine) * mix(0.6, 1.0, inSong);
  }

  float alpha = uStyle.z * L * edge * (1.0 + 0.08 * uSwell);
  vec3 col = vec3(0.86, 0.89, 0.95) * alpha;

  // The needle's groove: lit warm, a narrow band riding on the grooves.
  vec3 warm = vec3(0.95, 0.86, 0.74);
  if (uNeedle.y > 0.0) {
    float d = (r - uNeedle.x) / max(3.0, fr * 1.2);
    float band = exp(-d * d * 0.5) * uNeedle.y * edge;
    float on = mix(1.0, clamp(0.35 + 0.65 * (1.0 + lines) * 0.5, 0.0, 1.2), uStyle.x);
    float w = 0.3 * band * on;
    col += warm * w;
    alpha += w;
  }
  // A dropped needle: one soft ring of light running out through the grooves.
  if (uRipple.y > 0.0) {
    float d = (r - uRipple.x) / 20.0;
    float w = 0.1 * exp(-d * d) * uRipple.y * edge * mix(1.0, fine, uStyle.x);
    col += warm * w;
    alpha += w;
  }

  // Nothing shows through the hero's buttons (one is see-through).
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 h = uHoles[i];
    // A rounded box the button's own shape, so no dark corners show
    // outside its rounded ones: it ends exactly at the button's edge.
    vec2 hc = 0.5 * (h.xy + h.zw);
    vec2 hq = abs(px - hc) - (0.5 * (h.zw - h.xy) - uHoleR);
    float sd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - uHoleR;
    float inside = 1.0 - smoothstep(-1.0, 0.0, sd);
    col *= 1.0 - inside;
    alpha *= 1.0 - inside;
  }

  // Dither, so the soft gradients never step into bands.
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col + n, 0.0), clamp(alpha + n, 0.0, 1.0));
}`;

let prog = null;
let U = {};
let geo = null;

function init() {
  if (!gl) return false;
  gl.getExtension('OES_standard_derivatives');
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  // WebGL 1 needs the derivatives extension switched on in the shader.
  const frag = '#extension GL_OES_standard_derivatives : enable\n' + FRAG;
  prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uSize', 'uDpr', 'uCentre', 'uGeo', 'uHoles', 'uHoleCount', 'uHoleR', 'uSpan', 'uSpin', 'uFacing', 'uStyle', 'uSheen', 'uGlint', 'uHover', 'uSwell', 'uNeedle', 'uRipple', 'uTracks', 'uTrackCount']) U[n] = gl.getUniformLocation(prog, n);
  return true;
}

/** Where the record sits, and its songs: uneven lengths, a quiet run after each. */
// The page is measured at most twice a second (and on resize), not every
// frame: reading positions forces the browser to lay the page out.
let measured = 0;
addEventListener('resize', () => (measured = 0));
function layout(now) {
  if (geo && now - measured < 500) return geo;
  measured = now;
  const c = canvas.getBoundingClientRect();
  const s = screen.getBoundingClientRect();
  const cx = s.left - c.left + s.width / 2;
  // The centre sits just behind the top of the screen; the disc is about
  // 1.8 times the content's width across.
  const cy = s.top - c.top + s.height * 0.14 + T.drop;
  const R = Math.min(c.width * 0.7, s.width * 0.9);
  const r0 = R * 0.12;
  // Tilt it back just enough that its far rim lands near the top of the
  // canvas (behind the headline).
  const d0 = cy + HORIZON;
  const tilt = Math.max(0.2, ((d0 / (RIM_TOP + T.drop + HORIZON) - 1) * d0) / R);
  // The hero's buttons, so nothing shows through them.
  const holes = [...document.querySelectorAll('.hero .btn')].slice(0, 4).map((b) => {
    const r = b.getBoundingClientRect();
    return [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top];
  });
  // The record runs on past the mouse/controller switch under the screen
  // and fades out to nothing at the next section's heading ("Install").
  const bar = document.querySelector('.shot-bar')?.getBoundingClientRect();
  const next = document.querySelector('#install :is(h1, h2, h3)')?.getBoundingClientRect();
  const end = bar && next && next.top > bar.bottom ? next.top - c.top : s.bottom - c.top + 180;
  // The app's screen, where the pointer isn't on the record.
  const box = { l: s.left - c.left, r: s.right - c.left, t: s.top - c.top, b: s.bottom - c.top };
  const key = [c.width, c.height, Math.round(cx), Math.round(cy), Math.round(end), T.drop].join();
  gl.uniform4fv(U.uHoles, new Float32Array([...holes.flat(), ...new Array(16 - holes.length * 4).fill(0)]));
  gl.uniform1f(U.uHoleCount, holes.length);
  const btn = document.querySelector('.hero .btn');
  gl.uniform1f(U.uHoleR, btn ? parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 0 : 0);
  if (geo?.key === key) return Object.assign(geo, { box });
  const tracks = [];
  for (let a = r0, i = 0; a < R - 40 && tracks.length < MAX_TRACKS; i++) {
    const b = Math.min(R - 34, a + 60 + rand(i, 9) * 80);
    tracks.push(a, b);
    a = b + GAP;
  }
  gl.uniform2fv(U.uTracks, new Float32Array([...tracks, ...new Array(MAX_TRACKS * 2 - tracks.length).fill(0)]));
  gl.uniform1f(U.uTrackCount, tracks.length / 2);
  // The page's mask: the record shows evenly behind the words, a step
  // quieter beside the app, which is the star.
  canvas.style.setProperty('--fx-top', `${Math.round(s.top - c.top)}px`);
  canvas.style.setProperty('--fx-mid', `${Math.round(s.top - c.top + s.height * 0.3)}px`);
  canvas.style.setProperty('--fx-end', `${Math.round(end)}px`);
  geo = { key, cx, cy, R, r0, box, d0, tilt };
  return geo;
}

const local = (e) => {
  const c = canvas.getBoundingClientRect();
  return { x: e.clientX - c.left, y: e.clientY - c.top };
};
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const p = local(e);
  Object.assign(hover, p);
  if (quiet.on && Math.hypot(p.x - quiet.x, p.y - quiet.y) > 40) quiet.on = false;
  wake();
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => Object.assign(hover, { x: -1e4, y: -1e4 }));
addEventListener('pointerdown', (e) => {
  if (touch !== 'needle' || !geo || e.target.closest('a, button, input, summary, iframe, .try, .shot')) return;
  const p = local(e);
  const { r } = toRecord(p.x, p.y, geo);
  if (r < geo.r0 || r > geo.R) return;
  const now = performance.now();
  Object.assign(needle, { on: true, r, born: now });
  Object.assign(ripple, { on: true, r, born: now });
  Object.assign(quiet, { x: p.x, y: p.y, on: true });
  wake();
}, { passive: true });

function wake() {
  if (!prog || running) return;
  if (reduced.matches) {
    frame(performance.now(), true);
    return;
  }
  if (!visible) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(draw);
}

let last = performance.now();
function frame(now, still) {
  const dt = still ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    geo = null;
  }
  const g = layout(now);
  swell += (want - swell) * Math.min(1, dt * (want > swell ? 2.5 : 1));
  want *= Math.exp(-dt * 1.4);
  spin += TURN * T.life * dt;
  drift += dt * T.life;

  // The needle plays inward, slowly; the ring runs out and fades.
  let needleOn = 0;
  if (needle.on && touch === 'needle') {
    needle.r = Math.max(g.r0 + 30, needle.r - dt * 0.6);
    // It lights as it lands, plays on a few seconds, then fades away like
    // the ring it sent out.
    const age = (now - needle.born) / 1000;
    needleOn = Math.min(1, age / 0.5) * (1 - Math.min(1, Math.max(0, (age - NEEDLE_HOLD) / NEEDLE_FADE)) ** 2);
    if (age > NEEDLE_HOLD + NEEDLE_FADE) needle.on = false;
  }
  let rippleOn = 0;
  let rippleR = 0;
  if (ripple.on) {
    const t = (now - ripple.born) / 3600;
    if (t >= 1) ripple.on = false;
    else {
      rippleOn = Math.min(1, t * 8) * (1 - t) ** 2;
      rippleR = ripple.r + t * 160;
    }
  }

  // Hover: only on the record, not over the app's screen (its own events
  // don't reach us there anyway) or with the touch switched off.
  const overScreen = hover.x > g.box.l && hover.x < g.box.r && hover.y > g.box.t && hover.y < g.box.b;
  const { r: hr, a: ha } = toRecord(hover.x, hover.y, g);
  const reach = touch !== 'off' && !overScreen && !quiet.on && hr > g.r0 && hr < g.R ? 1 : 0;
  if (reach) {
    if (hover.on < 0.02) Object.assign(hover, { r: hr, a: ha });
    const k = Math.min(1, dt * 7);
    hover.r += (hr - hover.r) * k;
    hover.a += Math.atan2(Math.sin(ha - hover.a), Math.cos(ha - hover.a)) * k;
  }
  hover.on += (reach - hover.on) * Math.min(1, dt * (reach ? 3 : 1.6));

  const st = STYLES[style];
  gl.viewport(0, 0, w, h);
  gl.uniform2f(U.uSize, w, h);
  gl.uniform1f(U.uDpr, w / canvas.clientWidth);
  gl.uniform2f(U.uCentre, g.cx, g.cy);
  gl.uniform2f(U.uGeo, g.d0, g.tilt);
  gl.uniform2f(U.uSpan, g.r0, g.R);
  gl.uniform1f(U.uSpin, spin % (Math.PI * 2));
  gl.uniform1f(U.uFacing, FACING + DRIFT * Math.min(1, T.life) * Math.sin((drift * 2 * Math.PI) / DRIFT_S));
  gl.uniform3f(U.uStyle, st.lines, st.satin, st.level);
  gl.uniform1f(U.uSheen, st.sheen);
  gl.uniform1f(U.uGlint, st.glint ?? 1.6);
  gl.uniform3f(U.uHover, hover.r, hover.a, still ? 0 : hover.on);
  gl.uniform1f(U.uSwell, swell);
  gl.uniform2f(U.uNeedle, needle.r, needleOn * T.needle);
  gl.uniform2f(U.uRipple, rippleR, rippleOn * T.needle);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function draw(now) {
  if (reduced.matches || !visible) {
    running = false;
    if (reduced.matches) frame(now, true);
    return;
  }
  frame(now, false);
  requestAnimationFrame(draw);
}

const tune = window.tune;
const again = () => { geo = null; measured = 0; wake(); };
tune?.slider({ id: 'rec-drop', label: 'Hero record: lower by', min: 0, max: 260, step: 4, value: T.drop, unit: 'px', onInput: (v) => { T.drop = v; if (prog) again(); } });
tune?.slider({ id: 'rec-needle', label: 'Hero record: needle strength', min: 0, max: 1.5, step: 0.05, value: T.needle, onInput: (v) => { T.needle = v; if (prog) wake(); } });
tune?.slider({ id: 'rec-life', label: 'Hero record: motion at rest', min: 0, max: 3, step: 0.1, value: T.life, onInput: (v) => { T.life = v; if (prog) wake(); } });

try {
  if (init()) {
    // Nothing to draw while the hero is scrolled out of view.
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      wake();
    }).observe(canvas);
    reduced.addEventListener('change', wake);
    addEventListener('resize', () => reduced.matches && wake());
    wake();
  }
} catch (err) {
  console.warn('hero-fx:', err);
}
