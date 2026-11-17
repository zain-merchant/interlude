// The name in the footer, and what it does under the pointer. Faint at
// rest; nothing moves (or runs) until the pointer comes over the word.
//
// Drawn here, with WebGL (the word too, so it lines up exactly with its
// grooves; the page's text stays for layout and is hidden):
//   stylus  the pointer is a needle in the grooves: they part round it on a
//           spring, and where it has just been they ring and settle, like a
//           plucked string; the tip glows warm
//   lamp    a lamp you carry over the record: the grooves under it catch a
//           long streak of light running across them, as on real vinyl,
//           with a cool and a warm fringe; it trails the pointer a little
//   sound   the pointer plays: soft rings of sound run out from it through
//           the grooves, bending them as they pass
//   wave    the music shows in the grooves round the pointer: they wiggle
//           as a record's groove does, scrolling as it plays, pulsing on
//           the beat and warming at the loud parts
//   lamp-stylus  the lamp's streak, and a needle just ahead of it parting
//           the grooves (less than Stylus, on a springier follow of its own)
// The ones shown before (restored to compare):
//   grooves the first version: long, shallow arcs round a centre below the
//           word, shown round the pointer; their spacing is set by eye
//   record  the hero record's grooves, bands and reflections in the letters,
//           shown round the pointer, turning while it's there
//   streak  the record's grooves always faintly there; the ones under the
//           pointer catch the light along their arc
// And drawn by style.css, eased from here (the word's own text, with
// custom properties): "css" is the very first version exactly as it was
// first shown, and the "old-" ones are the earlier Try panel's.
//
// Every one keeps inside the letters. The pointer is followed on a spring,
// so nothing jumps; the loop stops once everything has settled, so a still
// pointer (or none) costs nothing. Reduced motion keeps the light and the
// reveal, but nothing travels: no rings, wakes, wiggles or turning.
//
// How the word looks at rest is its treatment (the new styles only; see
// TREATS). The text colour, groove colour and the lamp's two fringes can be
// set, and the text's brightness apart from how much the grooves show.
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
export const T = {
  mode: 'lamp', pitch: 8, rest: 0.4, cut: 0.33,
  treat: 'faint', ink: [1, 1, 1], inkK: 1, groove: [1, 1, 1], bg: [0.035, 0.035, 0.043],
  blue: [0.239, 0.706, 1], orange: [1, 0.608, 0.271], stroke: 1.5,
};
// How the word looks at rest (a number each, in the shader):
//   faint     the text colour, very faint, light grooves (as it was)
//   ink       the text colour, solid; the grooves cut darker into it
//   hollow    filled with the background, a fine line in the text colour
//             round each letter; grooves faint
//   outline   no fill, the line round each letter, the grooves inside
//   grooves   no fill, the grooves alone, brighter
//   metal     a chrome-like ramp in the text colour, dark at the horizon,
//             a bright band near the top, a faint brushing
//   vinyl     black letters with a gloss: two soft wedges of light across
//             the grooves, and a faint rim
//   duotone   the lamp's blue running into its orange across the word
export const TREATS = { faint: 0, ink: 1, hollow: 2, outline: 3, grooves: 4, metal: 5, vinyl: 6, duotone: 7 };
// How many frames have been drawn (for checking it stops when idle).
export const stats = { frames: 0 };

// Which number each drawn style has in the shader. Anything else is CSS.
const GL_MODES = { record: 0, streak: 1, grooves: 2, stylus: 3, lamp: 4, sound: 5, wave: 6, 'lamp-stylus': 7 };
export const isGL = (m) => m in GL_MODES;

// How each style follows the pointer: a spring's stiffness and damping
// ratio. Under 1 it overshoots a touch and settles, like a needle's
// cantilever; the lamp is heavy and lags; the first three follow exactly.
const SPRING = { stylus: [260, 0.55], lamp: [42, 0.9], sound: [90, 1], wave: [70, 0.9], 'lamp-stylus': [42, 0.9] };
// Lamp-stylus's needle, followed on its own (Stylus's) spring.
const TIP_SPRING = [260, 0.55];

/** Any CSS colour, as [r, g, b] from 0 to 1 (or null if it isn't one). */
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
export function rgb(css) {
  if (!probe || typeof css !== 'string') return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

const FRAG = `
precision highp float;
uniform sampler2D uText;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uCentre;   // record centre, CSS px from the canvas's top left
uniform float uAspect;  // how much the record is foreshortened (y squeezed)
uniform float uPitch;   // groove spacing, CSS px (on the word's middle row)
uniform float uSpin;
uniform vec3 uHover;    // pointer x, y (spring-followed), strength
uniform float uMode;    // see GL_MODES
uniform float uRest;    // how much of the grooves show at rest
uniform float uEm;      // the word's font size, CSS px: effects scale with it
uniform float uTime;    // seconds, while running
uniform float uSpeed;   // how fast the pointer is moving, 0 to 1
uniform vec2 uFar;      // the lamp's streak points away from here
uniform vec3 uPts[8];   // stylus: where it has been (x, y, when); sound: rings (x, y, when)
uniform vec2 uTip;      // lamp-stylus: the needle (its own, springier follower)
uniform float uTreat;   // how the word looks at rest (see TREATS)
uniform vec3 uInk;      // text colour
uniform float uInkK;    // text brightness, x the treatment's own
uniform vec3 uGroove;   // groove colour
uniform vec3 uBg;       // the footer's background
uniform vec3 uBlue;     // the lamp's cool fringe
uniform vec3 uOrange;   // and warm one
uniform float uBase;    // the word's baseline, CSS px from the canvas top
uniform vec2 uSpan;     // the word's left and right edges, CSS px
uniform float uStroke;  // outline width, CSS px

const float PI = 3.14159265;
const vec3 SAND = vec3(0.941, 0.863, 0.753);  // #f0dcc0
float sq(float x) { return x * x; }
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

// A sketch of music: a few partials, so it never repeats too evenly.
float music(float u) {
  return 0.55 * sin(u) + 0.3 * sin(2.71 * u + 1.3) + 0.15 * sin(6.13 * u + 0.4);
}

// Stylus: the grooves part round the tip (a gentle lens, never folding
// over), and each place it has just been rings and settles. A is how far.
float stylusPush(vec2 px, vec2 tp, float on, float s, float A) {
  vec2 dp = px - tp;
  float push = A * on * (dp.y / s) * exp(-dot(dp, dp) / (s * s));
  for (int i = 0; i < 8; i++) {
    vec3 p = uPts[i];
    float age = uTime - p.z;
    if (age < 0.0 || age > 2.5) continue;
    vec2 q = px - p.xy;
    float sw = s * (1.0 + age * 1.6);
    float ring = exp(-3.0 * age) * cos(13.0 * age) * min(1.0, age * 20.0);
    push += 0.7 * A * on * ring * (q.y / sw) * exp(-dot(q, q) / (sw * sw));
  }
  return push;
}

// Lamp. On grooved vinyl a lamp's reflection is a streak running across
// the grooves (along a radius), not a spot. It leans away from a point well
// below the word, so it fans out a little at the sides.
void lampLight(vec2 dp, vec2 hp, float on, out float lit, out vec3 tint) {
  vec2 dir = normalize(hp - uFar);
  vec2 nrm = vec2(-dir.y, dir.x);
  float u = dot(dp, nrm);
  float t = dot(dp, dir);
  float w = 0.055 * uEm;
  float along = exp(-t * t / (0.75 * 0.75 * uEm * uEm));
  float core = exp(-u * u / (w * w));
  float glow = exp(-u * u / (16.0 * w * w));
  float cool = exp(-(u + 1.5 * w) * (u + 1.5 * w) / (w * w));
  float warm = exp(-(u - 1.5 * w) * (u - 1.5 * w) / (w * w));
  tint = (vec3(1.0) * (core + 0.28 * glow) + uBlue * 0.55 * cool + uOrange * 0.55 * warm)
    / max(core + 0.28 * glow + 0.55 * cool + 0.55 * warm, 1e-3);
  lit = on * along * (core + 0.28 * glow + 0.4 * (cool + warm));
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uSize;
  float text = texture2D(uText, uv).r;
  if (text < 0.003) { gl_FragColor = vec4(0.0); return; }
  vec2 px = uv * uSize / uDpr;
  vec2 d = px - uCentre;
  d.y *= uAspect;
  float r = length(d);
  float a = atan(-d.y, d.x);
  vec2 hp = uHover.xy;
  float on = uHover.z;
  vec2 dp = px - hp;
  float dist = length(dp);
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  // The new styles: the first version's hairlines, bent, lit and coloured.
  if (uMode > 2.5) {
    // How far the grooves are pushed, in CSS px up the page (radius is
    // squeezed, so it's scaled by the aspect).
    float push = 0.0;
    float lit = 0.0;       // extra light on the grooves, 0 to 1
    vec3 tint = vec3(1.0);
    float field = on * exp(-dist * dist / (0.9 * 0.9 * uEm * uEm)); // the grooves round the pointer
    float s = 0.17 * uEm;
    float A = min(0.8 * s, 2.2 * uPitch + 0.02 * uEm);

    if (uMode < 3.5) {
      // Stylus; the tip glows warm.
      push = stylusPush(px, hp, on, s, A);
      float tip = exp(-dist * dist / (0.06 * 0.06 * uEm * uEm)) * on;
      lit = tip * (0.45 + 0.55 * uSpeed);
      tint = mix(vec3(1.0), uOrange, clamp(tip * 1.3, 0.0, 1.0));
    } else if (uMode < 4.5) {
      lampLight(dp, hp, on, lit, tint);
      field *= 0.5;
    } else if (uMode < 5.5) {
      // Sound. Each ring runs out from where the pointer was when it
      // sounded, widening and fading; the grooves lift as it passes.
      float sum = 0.0;
      for (int i = 0; i < 8; i++) {
        vec3 p = uPts[i];
        float age = uTime - p.z;
        if (age < 0.0 || age > 2.6) continue;
        float R = 0.85 * uEm * age;
        float w = 0.07 * uEm * (1.0 + age * 0.8);
        float x = (length(px - p.xy) - R) / w;
        float band = exp(-x * x) * pow(1.0 - age / 2.6, 1.6) * min(1.0, age * 8.0);
        sum += band;
        push += (0.012 * uEm + 0.9 * uPitch) * x * band;
      }
      push *= on;
      lit = on * min(1.0, sum);
      tint = mix(vec3(1.0), SAND, 0.7);
      field *= 0.6;
    } else if (uMode < 6.5) {
      // Wave. A groove carries the music as a wiggle along its length;
      // here it shows round the pointer, kept under half a groove's width
      // so lines never cross, and pulses on a 124 BPM beat.
      float env = exp(-dist * dist / (0.55 * 0.55 * uEm * uEm)) * on;
      float beat = 0.5 + 0.5 * exp(-fract(uTime * 124.0 / 60.0) * 5.0);
      // Neighbouring grooves wiggle nearly in step (as a cut groove's
      // turns do), so they read as lines, not a weave.
      float k = 2.0 * PI / (0.24 * uEm);
      float m = music(px.x * k + (r / (uPitch * uAspect)) * 0.12 - uTime * 6.0);
      push += env * beat * 0.45 * uPitch * m;
      float loud = env * beat * smoothstep(0.3, 0.85, abs(m));
      lit = 0.75 * loud;
      tint = mix(vec3(1.0), uOrange, clamp(loud * 1.4, 0.0, 1.0));
    } else {
      // Lamp and stylus: the lamp's streak, trailing as it does, and a
      // needle just ahead of it on its own springier follow, parting the
      // grooves a little less than Stylus does and ringing behind it.
      lampLight(dp, hp, on, lit, tint);
      push = stylusPush(px, uTip, on, 1.15 * s, 0.6 * A);
      vec2 tq = px - uTip;
      field = 0.5 * on * exp(-dot(tq, tq) / (0.9 * 0.9 * uEm * uEm));
    }

    // The grooves, from the bent radius (filtered by how fast that changes
    // across a pixel, so bending them never makes them shimmer).
    float rr = r + push * uAspect;
    float P = uPitch * uAspect;
    float fg = max(fwidth(rr), 1e-3) / P;
    float lines = grooveLines(rr / P, fg, max(0.45 / uPitch, 0.8 * fg));
    float duty = min(1.0, 1.25 / uPitch);
    float groove = clamp((1.0 + lines) * duty, 0.0, 1.0);

    // How the word looks at rest (see TREATS): a fill, an outline inside
    // its edge, how much the grooves at rest show (x), whether they cut
    // dark into the fill, and any light of its own on the grooves.
    vec3 fc = uInk;
    float fa = 0.0;
    vec3 oc = uInk;
    float oa = 0.0;
    float rk = 1.0;
    float cut = 0.0;
    float sheen = 0.0;
    float yy = clamp((uBase - px.y) / (0.74 * uEm), 0.0, 1.0); // 0 on the baseline, 1 at the cap height
    float xx = clamp((px.x - uSpan.x) / max(uSpan.y - uSpan.x, 1.0), 0.0, 1.0);
    if (uTreat < 0.5) {
      // Faint: as it was.
      fa = 0.045 * uInkK;
    } else if (uTreat < 1.5) {
      // Ink: solid colour, the grooves cut darker into it.
      fa = 0.3 * uInkK;
      cut = 2.0;
      rk = 0.3;
    } else if (uTreat < 2.5) {
      // Hollow: filled with the background, a fine line round each letter.
      fc = uBg;
      fa = 1.0;
      oa = 0.6 * uInkK;
      rk = 0.45;
    } else if (uTreat < 3.5) {
      // Outline, grooves inside.
      oa = 0.55 * uInkK;
      rk = 1.35;
    } else if (uTreat < 4.5) {
      // Grooves only, brighter.
      fa = 0.012 * uInkK;
      rk = 2.2;
    } else if (uTreat < 5.5) {
      // Metal: a chrome-like ramp, dark at the horizon, bright near the top.
      float sh = 0.3 + 0.7 * smoothstep(0.05, 0.95, yy);
      sh -= 0.3 * exp(-sq((yy - 0.46) / 0.07));
      sh += 0.45 * exp(-sq((yy - 0.84) / 0.05));
      sh *= 0.9 + 0.1 * sin(xx * 23.0 + 2.0 * sin(xx * 7.0));
      fc = mix(uInk, vec3(1.0), 0.25 * smoothstep(0.75, 0.9, yy));
      fa = 0.28 * uInkK * sh;
      oc = mix(uInk, vec3(1.0), 0.6);
      oa = 0.16 * uInkK;
      rk = 0.6;
    } else if (uTreat < 6.5) {
      // Vinyl: black letters with a gloss, two soft wedges of light across
      // the grooves (as a record's surface catches a light overhead) and a
      // faint rim.
      fc = vec3(0.008, 0.008, 0.012);
      fa = 1.0;
      float dev = atan(d.x, -d.y);
      float w1 = exp(-sq((dev - 0.07) / 0.035));
      float w2 = exp(-sq((dev + 0.11) / 0.025));
      sheen = uInkK * (0.5 * w1 + 0.3 * w2) * (0.3 + 0.7 * groove) + 0.06 * uInkK * smoothstep(0.55, 1.0, yy) * groove;
      oc = uInk;
      oa = 0.24 * uInkK;
      rk = 0.55;
    } else {
      // Duotone: the lamp's blue to its orange, across the word.
      fc = mix(uBlue, uOrange, smoothstep(0.08, 0.92, xx));
      fa = 0.24 * uInkK;
      rk = 0.75;
    }

    float show = max(field * 0.55, uRest * 0.6 * rk);
    float glow = groove * (show + lit * 0.9) + sheen;
    vec3 gc = mix(uGroove, tint, clamp(lit * 1.5, 0.0, 1.0));
    fa = clamp(fa, 0.0, 1.0) * text;
    vec3 pre = fc * fa * (1.0 - clamp(cut * groove * uRest, 0.0, 0.9));
    float al = fa;
    // The outline: inside the letters, where the letters end within
    // uStroke (from the letters' own shape, so overlapping contours in the
    // font don't show).
    float oA = 0.0;
    if (oa > 0.0) {
      float inner = 1.0;
      vec2 rad = uStroke * uDpr / uSize;
      for (int i = 0; i < 12; i++) {
        float t = float(i) * PI / 6.0;
        inner = min(inner, texture2D(uText, uv + rad * vec2(cos(t), sin(t))).r);
      }
      oA = clamp(oa, 0.0, 1.0) * text * (1.0 - inner);
    }
    pre = oc * oA + pre * (1.0 - oA);
    al = oA + al * (1.0 - oA);
    float gA = clamp(glow, 0.0, 1.0) * text;
    pre = gc * gA + pre * (1.0 - gA);
    al = gA + al * (1.0 - gA);
    gl_FragColor = vec4(pre + n, clamp(al + n, 0.0, 1.0));
    return;
  }

  float fr = max(fwidth(r), 1e-3);
  float P = uPitch * uAspect;
  float g = r / P;
  float fg = fr / P;
  // The first version's grooves are hairlines about a pixel wide.
  float sig = uMode > 1.5 ? max(0.45 / uPitch, 0.8 * fg) : clamp(0.8 * fg, 0.03, 0.12);
  float lines = grooveLines(g, fg, sig);

  // The first version: plain hairlines, 60% white, shown round the pointer
  // and fading out 320px from it. Filtered like the rest, they stay whole
  // arcs at any spacing (their average is the same as the lines' own).
  if (uMode > 1.5) {
    float duty = min(1.0, 1.25 / uPitch);
    float groove = clamp((1.0 + lines) * duty, 0.0, 1.0);
    float near = clamp(1.0 - dist / 320.0, 0.0, 1.0) * on;
    float a0 = text * (0.045 + max(near, uRest) * 0.6 * groove);
    gl_FragColor = vec4(vec3(1.0) * a0 + n, clamp(a0 + n, 0.0, 1.0));
    return;
  }

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
  float show = uRest;
  float lit = 0.0;
  if (uMode < 0.5) {
    float dd = dist / 300.0;
    show = max(show, on * exp(-dd * dd * 2.2));
  } else {
    show = max(show, 0.32);
    vec2 hd = hp - uCentre;
    hd.y *= uAspect;
    float hr = length(hd);
    float ha = atan(-hd.y, hd.x);
    float dr = (r - hr) / (2.6 * P);
    float da = atan(sin(a - ha), cos(a - ha)) * max(hr, 100.0) / 200.0;
    lit = on * exp(-dr * dr - da * da) * (0.35 + 0.65 * (1.0 + lines) * 0.5);
  }

  float alpha = text * (0.045 + show * 0.16 * L + lit * 0.55);
  gl_FragColor = vec4(vec3(0.9, 0.92, 0.96) * alpha + n, clamp(alpha + n, 0.0, 1.0));
}`;

let prog = null;
let U = {};
let tex = null;
let geo = null;
let running = false;
let spin = 0;
let last = 0;
let clock = 0; // seconds the loop has run (it only counts while running)
// Where the pointer is (tx, ty), where the effect is (x, y, moving at vx,
// vy), and how much it shows (on, easing toward want).
const hover = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, on: 0, want: 0, speed: 0 };
// Lamp-stylus's needle (it follows the pointer too, on its own spring).
const tip = { x: 0, y: 0, vx: 0, vy: 0 };
// Stylus: where the tip has been; sound: rings. Each [x, y, when].
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
  for (const n of ['uText', 'uSize', 'uDpr', 'uCentre', 'uAspect', 'uPitch', 'uSpin', 'uHover', 'uMode', 'uRest',
    'uEm', 'uTime', 'uSpeed', 'uFar', 'uPts', 'uTip', 'uTreat', 'uInk', 'uInkK', 'uGroove', 'uBg', 'uBlue', 'uOrange',
    'uBase', 'uSpan', 'uStroke']) U[n] = gl.getUniformLocation(prog, n);
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
  const ink = x.measureText(word.dataset.text);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t);
  // The record's centre: well below the word, so its grooves arc gently
  // across the letters, foreshortened as if lying back.
  // The first version's (and the new styles'): the CSS ellipse "100% 50%
  // at 50% 135%" of the word's own box, so its arcs are long and shallow.
  const box = word.getBoundingClientRect();
  geo = { w, h, dpr, em: size, cx: c.width / 2, cy: baseline + size * 0.55, aspect: 2.0,
    first: { cy: box.top - c.top + box.height * 1.35, aspect: box.width / (box.height * 0.5) },
    // The lamp's streaks lean away from here.
    far: { x: c.width / 2, y: baseline + size * 2.6 },
    width: c.width, baseline,
    span: [tx - ink.actualBoundingBoxLeft, tx + ink.actualBoundingBoxRight] };
  return geo;
}

// Everything goes back to rest (a new style starts clean).
function reset() {
  for (const p of pts) p[2] = -99;
  lastPt.t = -99;
  hover.vx = hover.vy = 0;
  Object.assign(tip, { x: hover.x, y: hover.y, vx: 0, vy: 0 });
  spin = 0;
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

// The earlier, CSS-drawn ones: the word's custom properties, eased here.
const old = { born: 0, from: { x: 0, y: 0 }, speed: 0, spin: 0, lit: 0, gx: 0, gy: 0, sx: 0, sy: 0, a: -60 };
// Eases one toward its target; within eps (too little to see) it lands.
const ease = (k, target, rate, dt, eps = 0.002) => {
  old[k] += (target - old[k]) * (1 - Math.exp(-dt * rate));
  if (Math.abs(target - old[k]) < eps) old[k] = target;
  return old[k] !== target;
};
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
function frameCSS(now, dt) {
  const set = (k, v) => word.style.setProperty(k, v);
  const box = word.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  // The pointer, in the word's own box.
  const wx = hover.tx + c.left - box.left;
  const wy = hover.ty + c.top - box.top;
  const nx = Math.max(-1, Math.min(1, (wx / box.width) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, (wy / box.height) * 2 - 1));
  const over = hover.want > 0;
  const m = mode;
  if (m === 'css') {
    set('--x', `${wx}px`);
    set('--y', `${wy}px`);
    set('--on', over ? '1' : '0');
    return false;
  }
  let busy = false;
  if (m === 'old-swing') {
    // The light swings round to face the pointer, easing there.
    const want = over ? (Math.atan2(wy - box.height * 0.7, wx - box.width / 2) * 180) / Math.PI + 90 - 24 : old.a;
    const delta = ((((want - old.a) % 360) + 540) % 360) - 180;
    old.a += delta * Math.min(1, dt * 7.2);
    busy = Math.abs(delta) > 0.2;
    set('--a', `${old.a.toFixed(1)}deg`);
    set('--on', over ? '1' : '0');
  } else if (m === 'old-spin') {
    busy = ease('speed', over && !reduced.matches ? 24 : 0, over ? 1.4 : 1, dt, 0.3) || old.speed > 0;
    old.spin = (old.spin + old.speed * dt) % 360;
    set('--spin', `${old.spin.toFixed(2)}deg`);
    set('--fx', (old.speed / 24).toFixed(3));
  } else if (m === 'old-tonearm') {
    const t = Math.min(1, (now - old.born) / 2600);
    set('--sweep', `${(-68 + 136 * inOut(t)).toFixed(2)}deg`);
    set('--fx', (Math.sin(Math.PI * t) ** 0.8).toFixed(3));
    busy = t < 1;
  } else if (m === 'old-ripple') {
    const t = Math.min(1, (now - old.born) / 2400);
    set('--wx', `${old.from.x.toFixed(0)}px`);
    set('--wy', `${old.from.y.toFixed(0)}px`);
    set('--wave', `${(1500 * (1 - (1 - t) ** 2.4)).toFixed(1)}px`);
    set('--fx', ((1 - t) ** 1.3 * Math.min(1, t * 12)).toFixed(3));
    busy = t < 1;
  } else if (m === 'old-platter') {
    busy = ease('lit', over ? 1 : 0, over ? 1.6 : 2.2, dt);
    set('--lit', old.lit.toFixed(4));
    set('--fx', Math.min(1, old.lit * 2.5).toFixed(3));
  } else if (m === 'old-depth') {
    const k = over ? 1 : 0;
    busy = ease('gx', -8 * nx * k, 2, dt, 0.1) | ease('gy', -4 * ny * k, 2, dt, 0.1) | ease('sx', 46 * nx * k, 2, dt, 0.2) | ease('sy', 18 * ny * k, 2, dt, 0.2);
    set('--gx', `${old.gx.toFixed(2)}px`);
    set('--gy', `${old.gy.toFixed(2)}px`);
    set('--sx', `${old.sx.toFixed(2)}px`);
    set('--sy', `${old.sy.toFixed(2)}px`);
    set('--fx', Math.max(Math.abs(old.sx) / 46, Math.abs(old.sy) / 18).toFixed(3));
  }
  // Tonearm and Ripple play once per visit; Reduced motion skips them.
  if (reduced.matches && (m === 'old-tonearm' || m === 'old-ripple')) { set('--fx', '0'); busy = false; }
  return busy;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  stats.frames++;
  if (mode !== T.mode) { mode = T.mode; reset(); }
  // The CSS-drawn ones don't need the canvas (it's hidden for them).
  if (!isGL(mode)) {
    demoAt = 0;
    hover.on = hover.want;
    return frameCSS(now, dt);
  }
  if (!geo) layout();
  if (!geo) return false;
  if (demoAt) demoPoint(now);
  clock += dt;
  const still = reduced.matches;

  // Shows over a quarter second or so; goes over about a second.
  hover.on += (hover.want - hover.on) * Math.min(1, dt * (hover.want ? 5 : 2.6));
  if (Math.abs(hover.on - hover.want) < 0.01) hover.on = hover.want;

  // Follow the pointer on a spring (in small steps, so it's steady at any
  // frame rate). The first three follow it exactly, as they always did.
  const sp = SPRING[mode];
  const px = hover.x;
  const py = hover.y;
  const follow = (f, [k, z]) => {
    const c = 2 * z * Math.sqrt(k);
    for (let s = 0, n = Math.ceil(dt / (1 / 240)); s < n; s++) {
      const h = dt / n;
      f.vx += (k * (hover.tx - f.x) - c * f.vx) * h;
      f.vy += (k * (hover.ty - f.y) - c * f.vy) * h;
      f.x += f.vx * h;
      f.y += f.vy * h;
    }
  };
  if (!sp || still) {
    hover.x = tip.x = hover.tx;
    hover.y = tip.y = hover.ty;
    hover.vx = hover.vy = tip.vx = tip.vy = 0;
  } else {
    follow(hover, sp);
    follow(tip, TIP_SPRING);
  }
  // How fast it's going, as a share of a brisk sweep, eased.
  const v = dt > 0 ? Math.hypot(hover.x - px, hover.y - py) / dt / (geo.em * 4) : 0;
  hover.speed += (Math.min(1, v) - hover.speed) * Math.min(1, dt * 8);

  // Stylus: drop a point where the tip passes, every so often while it moves.
  const needle = mode === 'lamp-stylus' ? tip : hover;
  if ((mode === 'stylus' || mode === 'lamp-stylus') && !still && hover.want) {
    const moved = Math.hypot(needle.x - lastPt.x, needle.y - lastPt.y);
    if (moved > geo.em * 0.09 && clock - lastPt.t > 0.035) {
      pts[next] = [needle.x, needle.y, clock];
      next = (next + 1) % pts.length;
      Object.assign(lastPt, { x: needle.x, y: needle.y, t: clock });
    }
  }
  // Sound: a ring every beat or so while it's over the word, and sooner
  // once it has moved a fair way.
  if (mode === 'sound' && !still && hover.want) {
    const moved = Math.hypot(hover.x - lastPt.x, hover.y - lastPt.y);
    if (clock - lastPt.t > 0.95 || (moved > geo.em * 0.6 && clock - lastPt.t > 0.3)) {
      pts[next] = [hover.x, hover.y, clock];
      next = (next + 1) % pts.length;
      Object.assign(lastPt, { x: hover.x, y: hover.y, t: clock });
    }
  }
  // B turns only while the pointer is on it.
  if (!still) spin += dt * hover.on * ((Math.PI * 2) / 30);

  gl.viewport(0, 0, geo.w, geo.h);
  gl.uniform1i(U.uText, 0);
  gl.uniform2f(U.uSize, geo.w, geo.h);
  gl.uniform1f(U.uDpr, geo.dpr);
  const first = GL_MODES[mode] >= 2;
  gl.uniform2f(U.uCentre, geo.cx, first ? geo.first.cy : geo.cy);
  gl.uniform1f(U.uAspect, first ? geo.first.aspect : geo.aspect);
  gl.uniform1f(U.uPitch, T.pitch);
  gl.uniform1f(U.uSpin, spin);
  gl.uniform3f(U.uHover, hover.x, hover.y, hover.on);
  gl.uniform1f(U.uMode, GL_MODES[mode]);
  gl.uniform1f(U.uRest, T.rest);
  gl.uniform1f(U.uEm, geo.em);
  gl.uniform1f(U.uTime, clock);
  gl.uniform1f(U.uSpeed, hover.speed);
  gl.uniform2f(U.uFar, geo.far.x, geo.far.y);
  gl.uniform3fv(U.uPts, pts.flat());
  gl.uniform2f(U.uTip, tip.x, tip.y);
  gl.uniform1f(U.uTreat, TREATS[T.treat] ?? 0);
  gl.uniform3fv(U.uInk, T.ink);
  gl.uniform1f(U.uInkK, T.inkK);
  gl.uniform3fv(U.uGroove, T.groove);
  gl.uniform3fv(U.uBg, T.bg);
  gl.uniform3fv(U.uBlue, T.blue);
  gl.uniform3fv(U.uOrange, T.orange);
  gl.uniform1f(U.uBase, geo.baseline);
  gl.uniform2f(U.uSpan, geo.span[0], geo.span[1]);
  gl.uniform1f(U.uStroke, T.stroke);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Keep going while anything is still moving: the fade, the spring, a
  // wake or ring still dying out, or (while shown) a style that plays.
  if (demoAt) return true;
  if (hover.on !== hover.want) return true;
  if (hover.on === 0) return false;
  if (!still && (mode === 'record' || mode === 'wave')) return true;
  const moving = (f) => Math.abs(hover.tx - f.x) > 0.2 || Math.abs(hover.ty - f.y) > 0.2 || Math.hypot(f.vx, f.vy) > 2;
  if (sp && !still && (moving(hover) || (mode === 'lamp-stylus' && moving(tip)))) return true;
  if (hover.speed > 0.01) return true;
  if ((mode === 'stylus' || mode === 'lamp-stylus' || mode === 'sound') && pts.some((p) => clock - p[2] < 2.6)) return true;
  if (mode === 'sound' && hover.want && !still) return true;
  return false;
}

function loop(now) {
  if (frame(now)) requestAnimationFrame(loop);
  else running = false;
}
export function wake() {
  if (!prog && isGL(T.mode)) return;
  if (running) return;
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
      hover.x = tip.x = p.x;
      hover.y = tip.y = p.y;
      hover.vx = hover.vy = tip.vx = tip.vy = 0;
      Object.assign(lastPt, { x: p.x, y: p.y, t: -99 });
    }
    if (hover.want === 0) {
      // The earlier Tonearm and Ripple play once per visit.
      const now = performance.now();
      if (now - old.born > 1200) old.born = now;
      const c = canvas.getBoundingClientRect();
      const box = word.getBoundingClientRect();
      old.from = { x: p.x + c.left - box.left, y: p.y + c.top - box.top };
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
  const t0 = geo.width * 0.14;
  hover.x = hover.tx = t0;
  hover.y = hover.ty = geo.baseline - geo.em * 0.36;
  Object.assign(tip, { x: hover.x, y: hover.y, vx: 0, vy: 0 });
  lastPt.t = -99;
  wake();
}

try {
  if (init()) {
    ready = true;
    new ResizeObserver(relayout).observe(word);
    document.fonts?.ready.then(relayout);
  }
} catch (err) {
  console.warn('foot-fx:', err);
}
