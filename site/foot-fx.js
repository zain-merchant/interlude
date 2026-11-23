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
//   ripples       rings run out through the grooves, bending them a
//                 little and catching the lamp's colours; how they're set
//                 off is the ripple style (see STYLES)
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
// (The context is made when the footer comes near, in init(): making one
// costs the page a good 100ms, for something at its very end.)
let gl = null;
const canGL = (() => { try { return !!window.WebGLRenderingContext && !!document.createElement('canvas').getContext; } catch { return false; } })();

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
  rippleStyle: 'breathe', // how rings are set off (see STYLES)
  rippleReach: 2.2,  // how far a ring runs before it has faded, em
  rippleWidth: 0.07, // a ring's width where it starts, em (it widens as it runs)
  rippleSpacing: 0.6, // wake and trail: pointer travel between rings, em
  rippleInterval: 0.95, // breathe and interference: time between rings, s
  rippleSpread: 0.45, // interference: how far apart its sources are, em
  fade: 0.5,         // how long the whole effect takes to come and go, s
  clickReach: 1.6,   // how far a click's ring runs, as a share of the ripple reach
  clickBend: 4,      // how much harder a click's ring bends the grooves than a hover's
  clickGreen: false, // a click's ring shows green (a test that clicks land)
  knock: 0.8,        // a click's lens: how much it magnifies (0.8: 5x, 0.9: 10x; under 1)
  knockSize: 0.4,    // its size, em
  wakeSpacing: 0.12, // dragged: a ripple left every this far, em
  wakeReach: 0.6,    // how far each of those runs, as a share of the ripple reach
  dragStretch: 1.2,  // how far the lens is drawn out the way it's dragged (0: not at all)
  knockTime: 1.5,    // how long it takes to spring back, s
  knockHold: 0.45,   // a quick click holds it at full this long, s
  knockBounce: 0.15, // how much it swings in and out as it does (0: none)
  knockWave: 0.3,    // its wave: how hard it bends, a share of the lens
  knockReach: 1,     // how far the wave runs before it's gone, em
  knockSpeed: 1.6,   // how fast it runs, em a second
  lineWidth: 1.25,   // groove line width, CSS px
  arc: 'flat',       // flat: long shallow arcs; record: round arcs of a record's grooves, its middle below the word
  songs: 0,          // grooves per song, with a smooth gap between songs (0: one long song, no gaps)
  songGap: 1.6,      // a song gap's width, in grooves
  trigger: 'follow', // follow: there while the pointer is; once: starts when it comes near, plays out, then fades on its own
  hold: 2.5,         // once: how long it plays before it fades, s
  scale: 1,          // the effect's size (lamp, rings, lens) against the word's: 1 as tuned on a Mac
  letter: [1, 1, 1, 11 / 255],
  gap: [0, 0, 0, 0],
  line: [1, 1, 1, 19 / 255],
  outline: [1, 1, 1, 1],
};
// How many frames have been drawn (for checking it stops when idle).
export const stats = { frames: 0 };

// Which number each mode has in the shader.
const MODES = { lamp: 0, 'lamp-warp': 1, ripples: 2, 'lamp-ripples': 3 };
export const isGL = (m) => m in MODES;
const hasLamp = (m) => m !== 'ripples';
const hasRipples = (m) => m === 'ripples' || m === 'lamp-ripples';
// How the ripples are set off. Every ring starts at nothing, grows in over
// its first stretch, runs out at the ripple speed and fades away before
// it has run its reach, so none pops in or is cut off.
//   wake          from the eased pointer, one ring each time it has moved
//                 a ring's spacing; none while it's still
//   drop          one ring where the pointer comes to rest (and one where
//                 it comes in), like a drop in water
//   breathe       rings one after another from the eased pointer, at the
//                 ripple interval, while it's over the word
//   trail         small rings left along the pointer's own path, a ring's
//                 spacing apart, each running only a third of the reach
//   interference  three sources round the eased pointer, slowly turning,
//                 taking turns at the interval, so their rings cross
export const STYLES = ['wake', 'drop', 'breathe', 'trail', 'interference'];
const TRAIL_REACH = 1 / 3;

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
uniform float uLineW;   // groove line width, CSS px
uniform vec3 uHover;    // pointer x, y (spring-followed), strength
uniform float uLamp;    // 1 with the lamp
uniform float uWarp;    // the warp's most, CSS px (0: none)
uniform float uRipples; // 1 with rings
uniform vec4 uRing;     // most bend, reach, width, grow-in distance (all CSS px)
uniform float uEm;      // the word's font size, CSS px: effects scale with it
uniform vec2 uFar;      // the lamp's streak points away from here
uniform vec4 uPts[16];  // rings: x, y, how far it has run (-1: none), its share of the reach (negative: a click's)
uniform vec2 uClick;    // a click's ring: how many times the bend, 1 to show it green (a test)
uniform vec4 uKnock;    // a click's lens: x, y, how much it magnifies now (0 to 0.95; < 0 shrinks), its size (CSS px)
uniform vec3 uKnockDir; // a dragged lens: which way it's going (x, y), how far it's drawn out along that way
uniform vec4 uKnock2;   // its wave: how far out it has run, its width, how far it moves them now (all CSS px)
uniform vec4 uLetter;   // the letters' fill
uniform vec4 uGap;      // between the grooves
uniform vec4 uLine;     // the groove lines
uniform vec4 uOutline;  // round the letters
uniform float uStroke;
uniform vec2 uSongs;    // grooves per song (0: none), the gap's width in grooves  // outline width, CSS px

const float PI = 3.14159265;
// The lamp's fringes: cool on one side, warm on the other.
const vec3 COOL = vec3(0.239, 0.706, 1.0);
const vec3 WARM = vec3(1.0, 0.608, 0.271);
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// The 1.25px lines, as a sum of a few harmonics, each faded as it nears
// the pixel size, so their average never changes and nothing shimmers. g
// counts grooves; fg is how many grooves one pixel covers; sig is the
// line's softness. Gives the lines there, and the same half-way between
// two (where the lines are lowest).
void grooveLines(float g, float fg, float sig, out float lines, out float trough) {
  float norm = 0.0;
  lines = 0.0;
  trough = 0.0;
  float sgn = -1.0;
  for (int k = 1; k <= 12; k++) {
    float fk = float(k);
    float coef = exp(-2.0 * PI * PI * sig * sig * fk * fk);
    norm += 2.0 * coef;
    float c = 2.0 * coef * exp(-7.0 * fk * fk * fg * fg) * (1.0 - smoothstep(0.3, 0.48, fk * fg));
    lines += c * cos(2.0 * PI * fk * g);
    trough += c * sgn;
    sgn = -sgn;
  }
  lines /= norm;
  trough /= norm;
}

// Lines b grooves wide with hard edges, as much of each as the pixel
// covers (fg grooves across): crisp at any width, and nothing at all
// between the lines.
float boxLines(float g, float fg, float b) {
  float x0 = g + 0.5 * b - 0.5 * fg;
  float x1 = x0 + fg;
  float i0 = floor(x0) * b + min(fract(x0), b);
  float i1 = floor(x1) * b + min(fract(x1), b);
  return clamp((i1 - i0) / fg, 0.0, 1.0);
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
    for (int i = 0; i < 16; i++) {
      vec4 p = uPts[i];
      float R = p.z;
      // A click's ring (share < 0) bends the grooves much harder and is
      // wider, so it reads as a knock rather than a breath.
      float hit = p.w < 0.0 ? 1.0 : 0.0;
      float reach = uRing.y * abs(p.w);
      if (R < 0.0 || R > reach) continue;
      // Grows in over its first stretch, fades over the last two thirds.
      float fade = smoothstep(0.0, min(uRing.w, 0.3 * reach), R) * (1.0 - smoothstep(0.3 * reach, reach, R));
      float w = uRing.z * (1.0 + 0.95 * R / uEm) * (1.0 + 0.8 * hit);
      float x = (length(px - p.xy) - R) / w;
      push += on * uRing.x * mix(1.0, uClick.x, hit) / 0.4289 * x * exp(-x * x) * fade;
      float l;
      vec3 c;
      prism(x * 1.6, l, c);
      if (hit > 0.5 && uClick.y > 0.5) { l = max(l, exp(-x * x)); c = vec3(0.2, 1.0, 0.4); }
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
  // A click is a lens on the grooves: right where it landed they bulge
  // out (convex) and spring back past flat to pull in (concave), in every
  // direction, and a wave of the same bend runs out from it.
  vec2 gp = px;
  if (uKnock.z != 0.0 || uKnock2.z != 0.0) {
    vec2 kp = px - turn(uKnock.xy);
    float kd = length(kp);
    vec2 kn = kp / max(kd, 1e-3);
    float s = uKnock.w;
    // A magnifying glass: inside it the grooves are drawn larger (by
    // 1 / (1 - m), m = uKnock.z), flat across its middle, with a quick
    // edge where they bunch up again. (m under 1, so they never fold.)
    // (Dragged, it's drawn out along the way it's going: its size measured
    // with the distance along that way shortened by the stretch.)
    float along = dot(kp, uKnockDir.xy);
    float u = length(kp - uKnockDir.xy * along * (1.0 - 1.0 / max(1.0, uKnockDir.z))) / s;
    float lens = clamp(uKnock.z, -0.8, 0.95) * kd * exp(-u * u * u * u);
    float x = (kd - uKnock2.x) / uKnock2.y;
    float wave = uKnock2.z / 0.4289 * x * exp(-x * x);
    gp -= kn * (lens + wave);
  }
  vec2 d = gp - uCentre;
  d.y *= uAspect;
  float r = length(d);
  float rr = r + push * uAspect;
  float P = uPitch * uAspect;
  float fg = max(fwidth(rr), 1e-3) / P;
  // The 1.25px line as it has always been drawn (soft, from the sum of
  // waves), measured from its trough (half-way between two lines) to its
  // crest: the space between the lines takes none of the line colour (it's
  // the gap colour's alone), and a crest takes all of it, so the line
  // colour's opacity is the lines' own. Where the lines are too fine to
  // draw apart, an even share. Any other width is drawn exactly, with hard
  // edges (it takes over within half a pixel of 1.25). Never wider than
  // the spacing (then it's solid).
  float lw = min(uLineW, uPitch);
  float hard = clamp(abs(lw - 1.25) / 0.5, 0.0, 1.0);
  float groove = 0.0;
  if (hard < 1.0) {
    float lines, trough;
    grooveLines(rr / P, fg, max(0.45 / uPitch, 0.8 * fg), lines, trough);
    float duty = min(1.0, 1.25 / uPitch);
    float apart = 1.0 - smoothstep(0.3, 0.48, fg);
    float shaped = clamp((lines - trough) / max(1.0 - trough, 1e-3), 0.0, 1.0);
    groove = clamp(mix(duty, shaped, apart), 0.0, 1.0);
  }
  if (hard > 0.0) groove = mix(groove, boxLines(rr / P, fg, lw / uPitch), hard);
  // The gaps between songs: every so many grooves, a smooth band with no
  // lines, the way a record shows where one track ends and the next starts.
  if (uSongs.x > 0.0) {
    float k = mod(rr / P, uSongs.x);
    float g = uSongs.y;
    float band = smoothstep(0.0, 0.4, k) * (1.0 - smoothstep(g - 0.4, g, k));
    groove *= 1.0 - band;
  }

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
// on runs evenly from 0 to 1 over the fade time and is eased where it's
// used, so the effect comes and goes smoothly.
const hover = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, on: 0, want: 0 };
// Rings, each [x, y, how far it has run (CSS px; -1: none), its share of
// the reach]. A new ring takes a free slot; with none free it waits.
const pts = Array.from({ length: 16 }, () => [0, 0, -1, 1]);
// What sets the rings off: how far the pointer has gone since the last
// (wake, trail), where the trail last was, the time since the last
// (breathe, interference), which source is next, and for drop whether
// it's moved since it last came to rest, and how long it's been still.
const emit = { dist: 0, px: 0, py: 0, time: 0, src: 0, armed: false, rest: 0 };
// The phone's one-off play-through: when it started (ms), or 0.
let demoAt = 0;
// A click's warp: where, and when (ms; 0: none).
const knock = { x: 0, y: 0, at: 0, held: false, from: 0, wave: false, letGo: 0, vx: 0, vy: 0, t: 0, trail: 0 };
// How far the warp pushes now: a spring let go from the full push, with
// T.knockBounce of wobble, settling over T.knockTime (and a 30ms rise, so
// it doesn't jump in).
function knockNow(now) {
  if (!knock.at) return 0;
  // Held (the button still down, maybe dragging): at full push, after a
  // 30ms rise. Let go: it springs back from where it was.
  // (A quick click is held until it has pushed all the way, so a tap gets
  // the whole thing, then let go.)
  if (knock.held && knock.letGo && now >= knock.letGo) {
    knock.from = T.knock; knock.held = false; knock.at = knock.letGo; knock.letGo = 0;
  }
  if (knock.held) return T.knock * (1 - Math.exp(-(now - knock.at) / 60));
  const t = (now - knock.at) / 1000, dur = Math.max(0.1, T.knockTime);
  if (t > dur * 2.5 && !knock.wave) { knock.at = 0; return 0; }
  const w = (2 * Math.PI) / dur, z = 1 - Math.min(0.95, Math.max(0, T.knockBounce));
  const rise = knock.from ? 1 : 1 - Math.exp(-t / 0.03);
  const env = z < 1 ? Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t) : Math.exp(-w * t) * (1 + w * t);
  return (knock.from || T.knock) * rise * env;
}
let mode = T.mode;

// The shader is compiled only once the footer is getting near (the page
// has nothing to spend on it before), and where the browser can, off the
// page's thread (KHR_parallel_shader_compile): asking whether it linked
// before it's done would make the page wait for it.
function init() {
  gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) { fail(new Error('no WebGL')); return false; }
  gl.getExtension('OES_standard_derivatives');
  const par = gl.getExtension('KHR_parallel_shader_compile');
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const p = gl.createProgram();
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }');
  const fs = sh(gl.FRAGMENT_SHADER, '#extension GL_OES_standard_derivatives : enable\n' + FRAG);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  const done = () => {
    try {
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p));
      finish(p);
      wake();
    } catch (err) { fail(err); }
  };
  if (!par) { done(); return true; }
  const poll = () => (gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR) ? done() : setTimeout(poll, 16));
  poll();
  return true;
}
// No effect after all: the page's own CSS version of the word.
function fail(err) {
  ready = false;
  document.documentElement.dataset.foot = 'css';
  document.documentElement.toggleAttribute('data-foot-gl', false);
  console.warn('foot-fx:', err);
}
function finish(p) {
  prog = p;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uText', 'uSize', 'uDpr', 'uCentre', 'uAspect', 'uPivot', 'uRot', 'uPitch', 'uHover', 'uLamp', 'uWarp',
    'uRipples', 'uRing', 'uClick', 'uKnock', 'uKnock2', 'uKnockDir', 'uEm', 'uFar', 'uLineW', 'uPts', 'uLetter', 'uGap', 'uLine', 'uOutline', 'uStroke', 'uSongs']) U[n] = gl.getUniformLocation(prog, n);
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return true;
}

// Where each letter of the word starts, from the first: by the font's own
// advances (measured with no spacing set, kerning and all), then the letter
// spacing and the adjustment after the first letter, both in em. (The fit,
// index.html, works them out the same way.)
export function wordAt(x, name, size, track, first) {
  return [...name].map((_, i) => x.measureText(name.slice(0, i + 1)).width - x.measureText(name[i]).width + i * track * size + (i ? first * size : 0));
}

// The letters, drawn into a texture the size of the canvas, on the same
// baseline and in the same type as the page's word.
function layout() {
  if (!tex) return null;
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
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  // From the start of the word's box (its indent is the fit's, index.html),
  // each letter set by itself, so every browser spaces them alike: Safari
  // drew the spacing looser, and starts a range over the word at its second
  // letter once the first has a style of its own (::first-letter).
  x.fillStyle = '#fff';
  const name = word.dataset.text, em = (v) => (parseFloat(v) || 0) / size;
  const at = wordAt(x, name, size, em(cs.letterSpacing), parseFloat(cs.getPropertyValue('--wm-in')) || 0);
  const tx = word.getBoundingClientRect().left + (parseFloat(cs.textIndent) || 0) - c.left;
  [...name].forEach((ch, i) => x.fillText(ch, tx + at[i], baseline));
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t);
  // The grooves: arcs of the CSS ellipse "100% 50% at 50% 135%" of the
  // word's own box, so they're long and shallow, nearly level.
  const box = word.getBoundingClientRect();
  // Or, as record: true circles round a middle well below the word, so
  // the arcs bend the way a record's grooves do.
  const rec = T.arc === 'record';
  geo = { w, h, dpr, em: size, cx: c.width / 2,
    cy: rec ? baseline + c.width * 1.1 : box.top - c.top + box.height * 1.35, aspect: rec ? 1 : box.width / (box.height * 0.5),
    // The tilt turns them round the middle of the letters.
    pivot: { x: c.width / 2, y: baseline - size * 0.36 },
    // The lamp's streaks lean away from here.
    far: { x: c.width / 2, y: baseline + size * 2.6 },
    width: c.width, baseline };
  return geo;
}

// Everything goes back to rest (a new mode starts clean).
function reset() {
  for (const p of pts) p[2] = -1;
  hover.vx = hover.vy = 0;
  Object.assign(emit, { dist: 0, time: 0, armed: false, rest: 0 });
}

// The size the effects are drawn at: the word's own size, times T.scale.
// (Pulled past the page's end it's drawn larger, so it takes in the word.)
const fxEm = () => geo.em * (pull.owns ? Math.max(1.8, T.scale || 1) * (1 + pull.wide * pull.k) : T.scale || 1);

// Pulled past the end of the page (the rubber band at the bottom, or a
// trackpad pushing on past it): the light comes up from under the word
// and rings well up through it, more and faster the further it's pulled.
// From the page (index.html), each time the pull changes; nothing runs
// when it isn't pulled.
const pull = { want: 0, k: 0, x: 0.5, wide: 1, time: 9, owns: false, rings: new Set(), lit: 2.6 };
export function surge(amount, x, wide, lit) {
  pull.want = Math.max(0, Math.min(1, amount || 0));
  if (x != null) pull.x = x;
  if (wide != null) pull.wide = wide;
  if (lit != null) pull.lit = lit;
  if (pull.want > 0 || pull.k > 0) wake();
}
function pullStep(dt) {
  // (Comes in a little eased; goes at once, with the page.)
  if (pull.want >= pull.k) pull.k += (pull.want - pull.k) * Math.min(1, dt * 24);
  else pull.k = pull.want;
  if (Math.abs(pull.want - pull.k) < 0.002) pull.k = pull.want;
  // (From the foot of the letters, where the page ends.)
  const x = geo.width * pull.x, y = Math.min(geo.h / geo.dpr, geo.baseline + fxEm() * 0.05);
  if (pull.k > 0.01) {
    // The light rises with the pull, from the foot of the word, only as
    // strong as the pull.
    if (!pull.owns && hover.want === 0 && hover.on < 0.02) Object.assign(hover, { x, y, vx: 0, vy: 0 });
    pull.owns = true;
    Object.assign(hover, { tx: x, ty: y - geo.em * (T.scale || 1) * 0.45 * pull.k, want: 1 });
    // Rings well up along the foot, one after another across it, closer
    // together the harder it's pulled.
    pull.time += dt;
    const every = 0.6 - 0.35 * pull.k;
    if (pull.time >= every) {
      pull.time = 0;
      pull.n = ((pull.n || 0) + 1) % 5;
      const rx = geo.width * (0.5 + [0, -0.3, 0.3, -0.15, 0.15][pull.n] * (0.4 + 0.6 * pull.k));
      if (!reduced.matches) { const p = ring(rx, y, -(0.7 + 0.9 * pull.k)); if (p) pull.rings.add(p); }
    }
  } else if (pull.owns) {
    // Let go: the light and its rings go with the page.
    pull.owns = false;
    pull.time = 9;
    hover.want = 0;
    hover.on = 0;
    for (const p of pull.rings) p[2] = -1;
    pull.rings.clear();
  }
}

// A new ring at x, y (unless every slot is still running one).
function ring(x, y, share = 1) {
  // (A click's ring may take the oldest slot, so a click always shows.)
  const p = pts.find((q) => q[2] < 0) ?? (share < 0 ? pts.reduce((a, q) => (q[2] > a[2] ? q : a)) : null);
  if (p) { p[0] = x; p[1] = y; p[2] = 0; p[3] = share; }
  return p;
}

// Sets rings off as the ripple style has it (see STYLES). Called each
// frame while the pointer is over the word; ox, oy is where the eased
// pointer was a frame ago.
function spawn(dt, ox, oy) {
  const em = fxEm();
  const style = STYLES.includes(T.rippleStyle) ? T.rippleStyle : 'breathe';
  const gap = Math.max(0.05, T.rippleSpacing) * em;
  if (style === 'wake') {
    emit.dist += Math.hypot(hover.x - ox, hover.y - oy);
    if (emit.dist >= gap) { emit.dist %= gap; ring(hover.x, hover.y); }
  } else if (style === 'trail') {
    // Along the pointer's own path, each ring where it was.
    const d = Math.hypot(hover.tx - emit.px, hover.ty - emit.py);
    if (d >= gap) {
      const n = Math.min(4, Math.floor(d / gap));
      for (let i = 1; i <= n; i++) {
        const f = (i * gap) / d;
        ring(emit.px + (hover.tx - emit.px) * f, emit.py + (hover.ty - emit.py) * f, TRAIL_REACH);
      }
      emit.px += ((hover.tx - emit.px) * n * gap) / d;
      emit.py += ((hover.ty - emit.py) * n * gap) / d;
    }
  } else if (style === 'drop') {
    // Moving at more than a tenth of an em a second counts as moving; a
    // fifth of a second slower than that, and it has come to rest.
    const v = Math.hypot(hover.vx, hover.vy) / em;
    if (v > 0.1) { emit.armed = true; emit.rest = 0; }
    else if (emit.armed && (emit.rest += dt) > 0.2) { emit.armed = false; ring(hover.x, hover.y); }
  } else {
    emit.time += dt;
    const every = Math.max(0.1, T.rippleInterval) / (style === 'interference' ? 3 : 1);
    if (emit.time >= every) {
      emit.time %= every;
      if (style === 'breathe') ring(hover.x, hover.y);
      else {
        // Three sources a third of a turn apart, turning once a minute.
        const a = (clock * Math.PI * 2) / 60 + (emit.src * Math.PI * 2) / 3;
        const r = (T.rippleSpread * em) / Math.sqrt(3);
        ring(hover.x + r * Math.cos(a), hover.y + r * Math.sin(a));
        emit.src = (emit.src + 1) % 3;
      }
    }
  }
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
  if (pull.want || pull.k) pullStep(dt);
  clock += dt;
  // Once: it has played its time, so it fades, wherever the pointer is.
  if (T.trigger === 'once' && hover.want && now >= onceUntil) hover.want = 0;
  const still = reduced.matches;

  // Comes and goes evenly over the fade time (eased where it's drawn).
  // (A pull comes and goes in well under a second, so it comes in quicker.)
  const step = T.fade > 0 ? dt / (pull.owns ? Math.min(0.15, T.fade) : T.fade) : 1;
  hover.on = hover.want ? Math.min(1, hover.on + step) : Math.max(0, hover.on - step);
  // (Pulled past the page's end: no stronger than the pull.)
  if (pull.owns) hover.on = Math.min(hover.on, Math.min(1, pull.k * pull.lit));

  // Follow the pointer on a critically damped spring (in small steps, so
  // it's steady at any frame rate).
  const k = SPRING[mode];
  const ox = hover.x;
  const oy = hover.y;
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

  // Rings run out at the ripple speed and are done once past their reach.
  const rings = hasRipples(mode) && !still;
  const reach = Math.max(0.1, T.rippleReach) * fxEm();
  for (const p of pts) {
    if (p[2] < 0) continue;
    // (A pull's rings run out faster than a hover's.)
    p[2] += T.rippleSpeed * fxEm() * dt * (pull.owns ? 1.5 : 1);
    if (p[2] > reach * Math.abs(p[3])) p[2] = -1;
  }
  if (rings && hover.want) spawn(dt, ox, oy);

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
  gl.uniform1f(U.uLineW, T.lineWidth);
  gl.uniform3f(U.uHover, hover.x, hover.y, hover.on * hover.on * (3 - 2 * hover.on));
  gl.uniform1f(U.uLamp, hasLamp(mode) ? 1 : 0);
  gl.uniform1f(U.uWarp, mode === 'lamp-warp' ? T.warp : 0);
  // (Rings show in the ripple modes, and in any mode while a click's ring runs.)
  gl.uniform1f(U.uRipples, hasRipples(mode) || pts.some((q) => q[2] >= 0) ? 1 : 0);
  gl.uniform4f(U.uRing, T.rippleBend, reach, Math.max(0.005, T.rippleWidth) * fxEm(), 0.3 * fxEm());
  gl.uniform1f(U.uEm, fxEm());
  const kz = knockNow(performance.now());
  gl.uniform4f(U.uKnock, knock.x, knock.y, kz, Math.max(0.02, T.knockSize) * fxEm());
  {
    // Drawn out the way it's dragged, more the faster (a speed of 3em a
    // second gives the whole stretch), easing back as it slows.
    knock.vx *= Math.exp(-dt * 6); knock.vy *= Math.exp(-dt * 6);
    const sp = Math.hypot(knock.vx, knock.vy);
    const st = 1 + T.dragStretch * Math.min(1, sp / (3 * fxEm()));
    gl.uniform3f(U.uKnockDir, sp > 1 ? knock.vx / sp : 1, sp > 1 ? knock.vy / sp : 0, st);
    if (sp > 2) knock.moving = true; else knock.moving = false;
  }
  {
    // The wave: from the lens's edge outward, fading as it goes.
    const t = knock.at ? (performance.now() - knock.at) / 1000 : 0;
    const start = Math.max(0.02, T.knockSize) * fxEm();
    const R = start + T.knockSpeed * fxEm() * t, reach = start + Math.max(0.05, T.knockReach) * fxEm();
    const f = knock.at ? Math.max(0, 1 - (R - start) / (reach - start)) : 0;
    const amp = T.knock * start * 0.5 * T.knockWave * f * f * Math.min(1, t / 0.05);
    gl.uniform4f(U.uKnock2, R, start * 0.6 * (1 + (R - start) / (2 * start)), amp, 0);
    if (f > 0) knock.wave = true; else knock.wave = false;
  }
  gl.uniform2f(U.uClick, T.clickBend ?? 4, T.clickGreen ? 1 : 0);
  gl.uniform2f(U.uFar, geo.far.x, geo.far.y);
  gl.uniform4fv(U.uPts, pts.flat());
  for (const v of [['uLetter', 'letter'], ['uGap', 'gap'], ['uLine', 'line'], ['uOutline', 'outline']]) col(v);
  gl.uniform1f(U.uStroke, T.stroke);
  gl.uniform2f(U.uSongs, T.songs, Math.min(T.songGap, Math.max(0, T.songs - 1)));
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Keep going while anything is still moving: the fade, the spring, a
  // ring still running out, or (while over the word) rings to come: on a
  // timer for breathe and interference; for drop, the rest still to come.
  if (demoAt || pull.want || pull.k) return true;
  if (knock.at || knock.wave || knock.held || knock.moving) return true;
  if (T.trigger === 'once' && hover.want) return true;
  if (hover.on !== hover.want) return true;
  if (hover.on === 0) return false;
  if (!still && (Math.abs(hover.tx - hover.x) > 0.2 || Math.abs(hover.ty - hover.y) > 0.2 || Math.hypot(hover.vx, hover.vy) > 2)) return true;
  if (pts.some((p) => p[2] >= 0)) return true;
  if (rings && hover.want && (T.rippleStyle === 'breathe' || T.rippleStyle === 'interference' || emit.armed)) return true;
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
let onceUntil = 0;
let near = false; // once: the pointer is still near since it last set it off
export function point(p) {
  if (T.trigger === 'once') {
    if (!p) { near = false; wake(); return; }
    // While it plays, it follows the pointer; leaving doesn't stop it.
    if (hover.want) { hover.tx = p.x; hover.ty = p.y; wake(); return; }
    // Set off only by coming near afresh, once it has faded right out.
    if (near || hover.on > 0.02) return;
    near = true;
    onceUntil = performance.now() + T.hold * 1000;
  }
  if (p) {
    // Coming in from nothing, start right there (not flying in from afar).
    if (hover.want === 0 && hover.on < 0.02) {
      hover.x = p.x;
      hover.y = p.y;
      hover.vx = hover.vy = 0;
      // Fresh: the first ring comes as the effect fades in (breathe and
      // interference at once, drop where it first rests).
      Object.assign(emit, { dist: 0, px: p.x, py: p.y, time: 1e3, armed: true, rest: 0 });
    }
    Object.assign(hover, { tx: p.x, ty: p.y, want: 1 });
    demoAt = 0;
  } else hover.want = 0;
  wake();
}

/** A click on the word: a ring runs out from there (canvas-local CSS px),
 *  in whatever mode, on the ripple settings, and as wide as a click's ring
 *  is set to (T.clickReach, a share of the ripple reach). */
export function click(p) {
  if (!geo && !layout()) return;
  ring(p.x, p.y, -(T.clickReach ?? 1.6));
  Object.assign(knock, { x: p.x, y: p.y, at: performance.now(), held: true, from: 0, letGo: 0, vx: 0, vy: 0, t: 0, trail: 0 });
  // The rings show through the effect's own light, so a click brings that
  // light on (and, in the play-once hover, starts it playing) if it's off.
  if (hover.want === 0 && hover.on < 0.02) Object.assign(hover, { x: p.x, y: p.y, vx: 0, vy: 0 });
  Object.assign(hover, { tx: p.x, ty: p.y, want: 1 });
  if (T.trigger === 'once') { onceUntil = performance.now() + T.hold * 1000; near = true; }
  wake();
}

/** A finger that touched the word and then scrolled the page: a ring
 *  from where it touched, and the light there for a moment (no lens: the
 *  page is moving under it). */
export function ping(p) {
  if (!geo && !layout()) return;
  ring(p.x, p.y, -1);
  if (hover.want === 0 && hover.on < 0.02) Object.assign(hover, { x: p.x, y: p.y, vx: 0, vy: 0 });
  Object.assign(hover, { tx: p.x, ty: p.y, want: 1 });
  wake();
}

/** Dragging with the button down: the lens goes with the pointer. */
export function drag(p) {
  if (!knock.held) return;
  const now = performance.now();
  const dt = Math.max(0.008, (now - (knock.t || now)) / 1000);
  const dx = p.x - knock.x, dy = p.y - knock.y;
  knock.t = now;
  // Its speed, smoothed over a few moves.
  knock.vx += (dx / dt - knock.vx) * 0.35;
  knock.vy += (dy / dt - knock.vy) * 0.35;
  knock.x = p.x; knock.y = p.y;
  // The wake: a ripple left every so far along the way, each bending the
  // grooves as a click's does and running out on its own.
  knock.trail += Math.hypot(dx, dy);
  const gap = Math.max(0.02, T.wakeSpacing) * (geo ? fxEm() : 200);
  if (T.wakeReach > 0 && knock.trail >= gap) { knock.trail %= gap; ring(p.x, p.y, -T.wakeReach); }
  Object.assign(hover, { tx: p.x, ty: p.y });
  wake();
}

/** Let go: the lens springs back where it is (and its wave runs out from there). */
export function release() {
  if (!knock.held) return;
  const now = performance.now();
  // A quick click still holds the lens at full for a moment (T.knockHold)
  // before it lets go, so the whole thing is seen.
  const hold = Math.max(150, T.knockHold * 1000);
  if (now - knock.at < hold) { knock.letGo = knock.at + hold; wake(); return; }
  knock.from = knockNow(now);
  knock.held = false;
  knock.at = now;
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
  Object.assign(emit, { dist: 0, px: hover.x, py: hover.y, time: 1e3, armed: true, rest: 0 });
  wake();
}

/** For checking: where the effect is now, and where it's headed. */
/** For checking: how far a click's lens pushes now. */
export const lens = () => knockNow(performance.now());

export const follower = () => ({ x: hover.x, y: hover.y, tx: hover.tx, ty: hover.ty, on: hover.on });

try {
  if (canGL) {
    ready = true;
    // Compiled when the footer is within about a screen and a half.
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      init();
    }, { rootMargin: '150% 0px' });
    io.observe(canvas);
    new ResizeObserver(relayout).observe(word);
    document.fonts?.ready.then(relayout);
  }
} catch (err) {
  console.warn('foot-fx:', err);
}
