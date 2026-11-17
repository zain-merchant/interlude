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

/** A point on the page (CSS pixels from the canvas's top left) on the disc.
 *  The same sum as the shader's discQ, warps and all. */
function toRecord(x, y, g) {
  const { cx, cy, hz, d0, tilt } = g;
  const mode = WARPS[T.warp] ?? 0;
  const k = T.warpAmt;
  // More rings above: the top half seen from further back.
  // (Scaled out from the centre, more the higher it is, so the rim stays
  // an arc rather than flattening.)
  if (y < cy && g.up > 0) {
    const s = 1 + g.up * ((cy - y) / cy) ** 2;
    x = cx + (x - cx) * s;
    y = Math.max(cy + (y - cy) * s, -0.7 * hz);
  }
  if (mode === 2) {
    const dx = x - cx;
    const dy = y - cy;
    // (tanh, so it never folds over however far out.)
    const c = 0.9 * k * Math.hypot(dx, dy) / g.half;
    const s = c > 1e-4 ? Math.tanh(c) / c : 1;
    x = cx + dx * s;
    y = cy + dy * s;
  } else if (mode === 3) {
    const dx = x - g.lens[0];
    const dy = y - g.lens[1];
    const s = 1 - 0.45 * k * Math.exp(-(dx * dx + dy * dy) / (g.lens[2] * g.lens[2]));
    x = g.lens[0] + dx * s;
    y = g.lens[1] + dy * s;
  }
  const f = d0 / Math.max(1, y + hz);
  let qx = (x - cx) * f;
  let qy = ((1 - f) * d0) / tilt;
  if (y < cy && mode === 1) {
    const fm = d0 / (2 * cy - y + hz);
    qx += ((x - cx) * fm - qx) * k;
    qy += (-((1 - fm) * d0) / tilt - qy) * k;
  } else if (y < cy && mode === 4) {
    qx += ((x - cx) / f - qx) * k;
  }
  return { r: Math.hypot(qx, qy), a: Math.atan2(qy, qx) };
}
// One turn every 40 seconds: slow, but its reflections can be seen moving.
const TURN = (Math.PI * 2) / 40;
// Set by eye with the Tune panel (see the end of this file): how far the
// whole record sits lower, how strong the needle's light is, and how much
// it moves on its own (the turn, and the lamp's light drifting slowly to
// and fro across it, so it's never quite still).
// persp: how strongly it's drawn in perspective (1 is the horizon at
// HORIZON; 2 brings it twice as close, so the far side narrows harder).
// cue: what shows it turning (a circle spinning looks still on its own),
// and cueAmt how much.
// soft: the soft glints every cue has (the ones among the dust specks);
// glintAmt: the extra glints of the "glints" cue. chroma: a colour in the
// glints (see CHROMA), chromaAmt how much. speck: what the dust is.
// size: the whole record, bigger all round; up: more rings above only (the
// top half drawn as if seen from further back, the bottom left as it is).
// mask: how far the page's fade at the very top is lifted (0 leaves
// style.css's own), so the far rim and the rings near it show up there.
// warp/warpAmt: other ways to bend the top (see WARPS). tint: the lamp's
// blue and orange in the sheen, as on the footer's word. hover: what the
// pointer does (see HOVERS); still: it fades this many seconds after the
// pointer stops, so nothing ever looks selected. look: the style it's
// drawn in (see LOOK).
const T = {
  drop: 108, needle: 0.8, life: 0.2, persp: 0.85, cue: 'dust', cueAmt: 1, res: 0.85,
  soft: 1, glintAmt: 1, chroma: 'none', chromaAmt: 0.6, speck: 'hyphen',
  size: 1, up: 0, mask: 0, warp: 'none', warpAmt: 0.5, tint: 0, hover: 'arc', still: 1.2,
  look: 'current',
};
const CUES = { glints: 0, dust: 1, warp: 2, spokes: 3, soft: 4 };
const CHROMA = { none: 0, film: 1, prism: 2, lamp: 3, grating: 4, pearl: 5, fringe: 6 };
const SPECKS = { hyphen: 0, motes: 1, scratches: 2, scuffs: 3, sparkle: 4, lint: 5, smudge: 6 };
const WARPS = { none: 0, mirror: 1, barrel: 2, lens: 3, flip: 4 };
const HOVERS = { arc: 0, lamp: 1, stylus: 2, prism: 3, spot: 4, ripples: 5 };
// How each hover follows the pointer: a spring's stiffness and damping (as
// the footer's do). Under 1 it overshoots a touch, like a stylus.
const SPRING = { lamp: [42, 0.9], stylus: [260, 0.55], prism: [90, 1], spot: [60, 0.9], ripples: [120, 1] };
const horizon = () => HORIZON / T.persp;
// The lamp drifts this far either way (radians), once every this many seconds.
const DRIFT = 0.32;
const DRIFT_S = 22;
// A dropped needle's groove lights over NEEDLE_IN (s), stays lit this long,
// then fades over this long: gone within 1.8s of the click, so the groove
// never looks selected. Its ring runs out over RIPPLE_S.
const NEEDLE_IN = 0.12;
const NEEDLE_HOLD = 0.3;
const NEEDLE_FADE = 1.4;
const RIPPLE_S = 1.8;
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
// sx, sy: where the newer hover styles are, following the pointer on a
// spring (vx, vy); moved: when the pointer last moved (ms).
const hover = { r: 0, a: 0, on: 0, x: -1e4, y: -1e4, sx: 0, sy: 0, vx: 0, vy: 0, speed: 0, moved: 0 };
// Stylus: where the tip has just been; ripples: where each ring started.
// Each [x, y, record radius, when (s on clock)].
const pts = Array.from({ length: 8 }, () => [0, 0, 0, -99]);
let nextPt = 0;
const lastPt = { x: 0, y: 0, t: -99 };
let clock = 0;
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
// The shader comes in parts: HEAD (uniforms, helpers, and discQ, where a
// point on the page lies on the disc) is shared; MAIN is the current look,
// LOOKS the other styles (see LOOKS below), one compiled per style with
// LOOK defined, so each only pays for its own drawing.
const HEAD = `
precision highp float;
uniform vec2 uSize;      // canvas, device pixels
uniform float uDpr;
uniform vec2 uCentre;    // record centre, CSS pixels from the canvas's top left
uniform vec2 uGeo;       // distance from the centre to the horizon, and the tilt
uniform vec4 uHoles[4];  // the hero's buttons, where nothing may show through
uniform float uHoleCount;
uniform float uHoleR;     // the buttons' corner radius
uniform vec2 uSpan;      // inner radius, and the radius the groove spacing is set by
uniform vec2 uOuter;     // outer radius: round most of it, and up top
uniform float uSpin;
uniform float uFacing;
uniform vec3 uStyle;     // lines, satin, level
uniform float uSheen;
uniform float uGlint;
uniform vec2 uGlintAmt;  // the soft glints, and the glints cue's own
uniform vec2 uChroma;    // colour in the glints (see CHROMA), and how much
uniform float uSpeck;    // what the dust is (see SPECKS)
uniform float uTint;     // the lamp's blue and orange in the sheen
uniform vec4 uWarp;      // how the top is bent (see WARPS), how much, more rings up top, half the width
uniform vec3 uLens;      // the lens bulge: centre and radius, CSS px
uniform vec3 uHover;     // pointer radius, angle, strength
uniform float uHoverMode;
uniform vec3 uPtr;       // the hover's own place (on its spring), CSS px, and its speed
uniform vec4 uPts[8];    // stylus trail / colour ripples: x, y, record radius, when
uniform float uTime;
uniform float uSwell;
uniform vec2 uNeedle;    // radius, strength
uniform vec2 uRipple;    // radius, strength
uniform float uTouch;    // how strong the pointer's light is
uniform float uHz;       // the horizon, CSS px above the canvas
uniform vec2 uCue;       // what shows the turn, and how much
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
const vec3 BASE = vec3(0.86, 0.89, 0.95);
// The footer's colours.
const vec3 ORANGE = vec3(1.0, 0.608, 0.271);  // #ff9b45
const vec3 BLUE = vec3(0.239, 0.706, 1.0);    // #3db4ff
const vec3 SAND = vec3(0.941, 0.863, 0.753);  // #f0dcc0

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 hue(float t) { return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67))); }
float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }
float near(float v, float k) { return step(abs(v - k), 0.5); }

// A point on the page onto the disc, in perspective, with the top's bends
// (toRecord in the script does the same sum).
vec2 discQ(vec2 px) {
  float cx = uCentre.x;
  float cy = uCentre.y;
  float k = uWarp.y;
  // More rings up top: the top half as if seen from further back.
  // (Scaled out from the centre, more the higher it is, so the rim stays
  // an arc rather than flattening.)
  if (px.y < cy && uWarp.z > 0.0) {
    float s = 1.0 + uWarp.z * (cy - px.y) * (cy - px.y) / (cy * cy);
    px = uCentre + (px - uCentre) * s;
    px.y = max(px.y, -0.7 * uHz);
  }
  if (near(uWarp.x, 2.0) > 0.5) {
    // Barrel: the middle swollen as through a fisheye, the edges crowded.
    vec2 d = px - uCentre;
    // (tanh, so it never folds over however far out.)
    float c = 0.9 * k * length(d) / uWarp.w;
    float e2 = exp(-2.0 * c);
    px = uCentre + d * (c > 1e-4 ? (1.0 - e2) / (1.0 + e2) / c : 1.0);
  } else if (near(uWarp.x, 3.0) > 0.5) {
    // A lens over the top half, magnifying behind the words.
    vec2 d = px - uLens.xy;
    px = uLens.xy + d * (1.0 - 0.45 * k * exp(-dot(d, d) / (uLens.z * uLens.z)));
  }
  float f = uGeo.x / max(1.0, px.y + uHz);
  vec2 q = vec2((px.x - cx) * f, (1.0 - f) * uGeo.x / uGeo.y);
  if (px.y < cy && near(uWarp.x, 1.0) > 0.5) {
    // Mirror: the top drawn as the near side is, its arcs sweeping round.
    float fm = uGeo.x / (2.0 * cy - px.y + uHz);
    q = mix(q, vec2((px.x - cx) * fm, -(1.0 - fm) * uGeo.x / uGeo.y), k);
  } else if (px.y < cy && near(uWarp.x, 4.0) > 0.5) {
    // Flipped: the far side widening instead of narrowing.
    q.x = mix(q.x, (px.x - cx) / f, k);
  }
  return q;
}
`;
const MAIN = `
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  vec2 q = discQ(px);
  float r = length(q);
  // How the disc moves under a device pixel (for things drawn to the
  // screen's own scale: specks, the pointer's light).
  vec2 dqx = dFdx(q);
  vec2 dqy = dFdy(q);
  // How many record pixels one device pixel covers here (larger where the
  // disc is flattest), across the grooves and along them.
  float fr = max(fwidth(r), 1e-3);
  vec2 tdir = vec2(-q.y, q.x) / max(r, 1e-3);
  float ft = max(length(vec2(dot(dqx, tdir), dot(dqy, tdir))), 1e-3);
  float a = atan(q.y, q.x);
  // The outer edge: up top it may run further out than round the rest.
  float farSide = smoothstep(0.15, 0.7, -q.y / max(r, 1.0));
  float R = mix(uOuter.x, uOuter.y, farSide);

  // Stylus: the grooves part round the tip (a gentle lens, never folding
  // over), and each place it has just been rings and settles.
  float on = uHover.z;
  vec2 dp = px - uPtr.xy;
  float dist = length(dp);
  float push = 0.0;
  if (on > 0.0 && near(uHoverMode, 2.0) > 0.5) {
    float s = 30.0;
    float sR = s * fr * uDpr;
    float A = 0.6 * sR;
    push += A * on * ((r - uHover.x) / sR) * exp(-dist * dist / (s * s));
    for (int i = 0; i < 8; i++) {
      vec4 p = uPts[i];
      float age = uTime - p.w;
      if (age < 0.0 || age > 2.5) continue;
      vec2 d = px - p.xy;
      float sw = s * (1.0 + age * 1.6);
      float ring = exp(-3.0 * age) * cos(13.0 * age) * min(1.0, age * 20.0);
      push += 0.5 * A * on * ring * ((r - p.z) / (sw * fr * uDpr)) * exp(-dot(d, d) / (sw * sw));
    }
  }
  float rr = r - push;
  float frr = max(fwidth(rr), 1e-3);

  if (r > max(uOuter.x, uOuter.y) + 2.0 * fr) { gl_FragColor = vec4(0.0); return; }
  // The disc, with a crisp edge, and the label hidden behind the screen.
  float edge = smoothstep(uSpan.x, uSpan.x + 40.0, r) * (1.0 - smoothstep(R - fr, R + fr, r));
  // Out at the rim: a smooth lead-in with no grooves, then the raised lip.
  float lead = smoothstep(R - 34.0, R - 26.0, r);

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
  float g = log(1.0 + pb * rr / PITCH) / pb;     // grooves counted out from the centre
  float fg = frr / (PITCH + pb * rr);            // grooves per device pixel
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
  // way highlights slide round a record under a lamp. Kept apart from L
  // (Lg, and Gv its colour) so they can take a colour of their own.
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
  // What shows the turn. A plain circle spinning looks still, so
  // something fixed on the disc has to be seen going round.
  float cueAmt = uCue.y * (1.0 - lead) * edge;
  float gAmt = uGlintAmt.x;
  // The glints cue: stronger glints, nothing more. (The soft-glints cue
  // is those alone, as among the dust.)
  if (uCue.x < 0.5) gAmt += uGlintAmt.y * cueAmt * 1.2;
  float gk = uGlint * (0.25 + 0.75 * lamp) * onLines * (1.0 - lead) * gAmt;
  vec3 gv = vec3(glint);
  vec3 tv = vec3(1.0);
  float ce = uChroma.x;
  if (ce > 0.5) {
    if (near(ce, 1.0) > 0.5) {
      // Thin film, like oil on water: the hue shifts with the angle the
      // light meets it at and across the glint.
      tv = mix(vec3(1.0), hue(0.55 * cos(a - uFacing) + r / 650.0 + 0.12 * du), 0.8);
    } else if (near(ce, 2.0) > 0.5) {
      // Prism: the glint split along its length, red leading, blue trailing.
      vec3 sh = vec3(0.55, 0.0, -0.55);
      vec3 x = arc + sh;
      gv = mix(gv, exp(-x * x - du * du) * inSong, uChroma.y);
    } else if (near(ce, 3.0) > 0.5) {
      // The footer's lamp: a white core with a cool and a warm side.
      float side = clamp(arc * 1.2, -1.0, 1.0);
      tv = mix(mix(BLUE, ORANGE, 0.5 + 0.5 * side), vec3(1.0), exp(-arc * arc * 2.5) * 0.45);
    } else if (near(ce, 4.0) > 0.5) {
      // A diffraction grating's rainbow, as on a CD: it runs along the
      // glint and shifts as the glint turns through the light.
      tv = hue(0.28 * arc + 0.18 * du + 0.9 * (a - uFacing));
    } else if (near(ce, 5.0) > 0.5) {
      // Pearl: soft pink, mint and lilac drifting over each other.
      tv = mix(vec3(1.0, 0.74, 0.9), vec3(0.7, 1.0, 0.9), 0.5 + 0.5 * sin(3.0 * du + 2.0 * a));
      tv = mix(tv, vec3(0.8, 0.76, 1.0), 0.5 - 0.5 * cos(arc * 1.4));
    } else {
      // Fringe: as through a lens that doesn't quite focus every colour,
      // red spreads wider and softer, blue stays tight.
      vec3 sc = vec3(0.6, 1.0, 1.5);
      vec3 xa = arc * sc;
      vec3 xu = du * sc;
      gv = mix(gv, exp(-xa * xa - xu * xu) * inSong * vec3(0.95, 1.0, 1.15), uChroma.y);
    }
    tv /= max(maxc(tv), 1e-3);
  }
  float Lg = gk * (gv.r + gv.g + gv.b) / 3.0;
  vec3 Gv = gk * gv * mix(BASE, tv * 0.95, uChroma.y * step(0.5, ce));

  if (uCue.x > 0.5 && uCue.x < 1.5) {
    // Dust: specks lying on the disc, carried round with it, each one
    // catching the lamp as it passes through the light.
    if (uSpeck < 0.5) {
      // Short dashes (the angle taken on the disc itself, so its seam
      // turns with it).
      vec2 cell = vec2(r / 7.0, mod(b, 2.0 * PI) * r / 7.0);
      vec2 id = floor(cell);
      float hsh = hash(id + 13.0);
      if (hsh > 0.99) {
        vec2 at = fract(cell) - 0.5 - 0.3 * (vec2(hash(id + 1.7), hash(id + 5.3)) - 0.5);
        float dot0 = exp(-dot(at, at) * 40.0);
        float tw = 0.35 + 0.65 * lamp;
        L += 16.0 * dot0 * tw * (0.4 + 0.6 * fract(hsh * 61.0)) * cueAmt;
      }
    } else {
      // The others are laid out on the disc in cells (a few to a ring,
      // their neighbours looked at too, so none is cut off) and drawn at
      // the screen's own scale, so they keep their shape however the disc
      // is foreshortened.
      float det = dqx.x * dqy.y - dqy.x * dqx.y;
      float CR = 12.0;
      float CT = 12.0;
      float th = 0.988;
      float K = 9.0;
      if (uSpeck < 1.5) { CR = 12.0; CT = 12.0; th = 0.986; K = 10.0; }       // motes
      else if (uSpeck < 2.5) { CR = 10.0; CT = 140.0; th = 0.95; K = 9.0; }   // scratches
      else if (uSpeck < 3.5) { CR = 34.0; CT = 10.0; th = 0.975; K = 6.0; }   // scuffs
      else if (uSpeck < 4.5) { CR = 18.0; CT = 18.0; th = 0.988; K = 13.0; }  // sparkle
      else if (uSpeck < 5.5) { CR = 60.0; CT = 60.0; th = 0.9; K = 7.0; }    // lint
      else { CR = 260.0; CT = 260.0; th = 0.6; K = 4.0; }                      // smudge
      float th0 = mod(b, 2.0 * PI);
      float row0 = floor(r / CR);
      float sp = 0.0;
      for (int j = -1; j <= 1; j++) {
        float row = row0 + float(j);
        float rc = (row + 0.5) * CR;
        if (rc <= 0.0) continue;
        float col0 = floor(th0 * rc / CT);
        for (int i = -1; i <= 1; i++) {
          vec2 id = vec2(row, col0 + float(i));
          float h = hash(id + 13.0 + uSpeck * 7.0);
          if (h < th) continue;
          float h1 = hash(id + 1.7);
          float h2 = hash(id + 5.3);
          float h3 = hash(id + 9.1);
          float rs = (row + 0.2 + 0.6 * h1) * CR;
          float ang = (id.y + 0.2 + 0.6 * h2) * CT / rc + uSpin;
          vec2 rh = vec2(cos(ang), sin(ang));
          vec2 D = q - rs * rh;
          // The same offset on the screen, CSS px.
          vec2 v = vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr);
          float ls = 0.5 + 0.5 * cos(2.0 * (ang - uFacing));
          ls *= ls;
          float bright = 0.4 + 0.6 * fract(h * 61.0);
          if (uSpeck < 1.5) {
            // Motes: round, soft specks of dust, a pixel or two across.
            float rad = 0.55 + 0.9 * h3;
            sp += exp(-dot(v, v) / (rad * rad)) * bright * (0.3 + 0.7 * ls);
          } else if (uSpeck < 2.5) {
            // Scratches: fine hairlines following the grooves round,
            // showing as they come into the light.
            float drc = (r - rs) / (fr * uDpr);
            float along = r * atan(sin(a - ang), cos(a - ang));
            float len = 20.0 + 70.0 * h3;
            sp += exp(-drc * drc / 0.45) * (1.0 - smoothstep(0.45 * len, len, abs(along))) * bright * (0.15 + 0.85 * ls);
          } else if (uSpeck < 3.5) {
            // Scuffs: short marks across the grooves.
            float acr = dot(D, vec2(-rh.y, rh.x)) / (ft * uDpr);
            float len = 8.0 + 16.0 * h3;
            sp += exp(-acr * acr / 0.35) * (1.0 - smoothstep(0.4 * len, len, abs(dot(D, rh)))) * bright * (0.3 + 0.7 * ls);
          } else if (uSpeck < 4.5) {
            // Sparkle: points that flash into small stars as they pass the
            // lamp, and are barely there the rest of the way round.
            float d2 = dot(v, v);
            float tw = pow(ls, 3.0) * (0.65 + 0.35 * sin(uSpin * 40.0 + h3 * 6.28));
            float rays = (exp(-abs(v.x) * 0.45 - v.y * v.y * 2.5) + exp(-abs(v.y) * 0.45 - v.x * v.x * 2.5)) * exp(-d2 / 70.0);
            sp += exp(-d2 / 0.5) * (0.12 + 0.88 * tw) * bright + 1.1 * rays * tw * bright;
          } else if (uSpeck < 5.5) {
            // Lint: the odd fine fibre, gently curved, lying any which way;
            // matte, so it hardly changes in the light.
            float phi = h3 * PI;
            vec2 dd = vec2(cos(phi), sin(phi));
            float ua = dot(v, dd);
            float wa = dot(v, vec2(-dd.y, dd.x)) - (h1 - 0.5) * 0.1 * ua * ua;
            float len = 5.0 + 9.0 * h2;
            sp += exp(-wa * wa / 0.3) * (1.0 - smoothstep(0.7 * len, len, abs(ua))) * (0.5 + 0.3 * lamp);
          } else {
            // Smudges: a fingerprint's faint sheen, whorls of ridges
            // showing only as they turn into the light.
            float dd = length(D);
            float blob = exp(-dd * dd / (80.0 * 80.0));
            float ridge = 0.5 + 0.5 * sin(dd * 0.33 + h3 * 6.28 + 2.0 * sin(atan(D.y, D.x) + h1 * 6.0));
            sp += blob * (0.3 + 0.7 * ridge) * ls * bright;
          }
        }
      }
      L += K * sp * cueAmt;
    }
  }
  float after = 1.0;
  if (uCue.x > 1.5 && uCue.x < 2.5) {
    // The pressing's warp, deeper: the light swells and dips as it turns.
    after = 1.0 + 1.6 * warp * cueAmt;
  } else if (uCue.x > 2.5 && uCue.x < 3.5) {
    // Spokes: a few faint radial streaks in the vinyl, going round.
    float spk = 0.5 + 0.5 * cos(7.0 * b + sin(r / 120.0) * 0.6);
    after = 1.0 + 0.28 * pow(spk, 6.0) * cueAmt;
  }
  L *= after;
  Lg *= after;
  Gv *= after;
  // The lip at the very edge catches the light: a fine bright line that
  // shows the disc's outline, brightest where the lamp falls.
  float dl = (r - (R - 2.5)) / max(1.3, fr * 1.2);
  L += 1.1 * exp(-dl * dl) * (0.45 + 0.55 * lamp) * mix(0.35, 1.0, clamp((uGeo.x / max(1.0, px.y + uHz) - 1.0) * 4.0, 0.0, 1.0));

  // The pointer. Hv is light of its own colour, Hs how much it adds.
  vec3 Hv = vec3(0.0);
  float Hs = 0.0;
  if (on > 0.0) {
    float shine = mix(1.0, clamp(0.25 + 0.75 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
    float da = atan(sin(a - uHover.y), cos(a - uHover.y));
    float k = uTouch * on * mix(0.6, 1.0, inSong);
    if (uHoverMode < 0.5) {
      // Arc: the grooves at its radius catch the light along their own
      // run, a narrow streak following the arc either side of it rather
      // than a round glow, shining on the grooves themselves.
      float dr = (r - uHover.x) / 34.0;
      float s = da * max(uHover.x, 100.0) / 240.0;
      float streak = exp(-dr * dr) * exp(-s * s);
      L += 11.0 * uTouch * on * streak * (0.45 + 0.55 * shine) * mix(0.6, 1.0, inSong);
    } else if (uHoverMode < 1.5) {
      // Lamp: a lamp carried over the record. On grooved vinyl its
      // reflection is a streak running across the grooves, out along a
      // radius, with a cool fringe one side and a warm one the other.
      float along = (r * cos(da) - uHover.x) / 240.0;
      float s = r * sin(da) / (ft * uDpr);
      float w = 3.2;
      float core = exp(-s * s / (w * w));
      float glow = exp(-s * s / (16.0 * w * w));
      float cool = exp(-(s + 1.6 * w) * (s + 1.6 * w) / (w * w));
      float warm = exp(-(s - 1.6 * w) * (s - 1.6 * w) / (w * w));
      float e = 9.0 * k * exp(-along * along) * step(0.0, cos(da)) * (0.4 + 0.6 * shine);
      Hv = e * (BASE * (core + 0.25 * glow) + BLUE * 0.5 * cool + ORANGE * 0.5 * warm);
      Hs = e * (core + 0.25 * glow + 0.5 * (cool + warm));
    } else if (uHoverMode < 2.5) {
      // Stylus (the parting is above): the grooves round the tip lift a
      // little, and the tip glows warm, brighter as it moves.
      float field = exp(-dist * dist / (60.0 * 60.0));
      float tip = exp(-dist * dist / 30.0);
      float halo = exp(-dist * dist / 400.0);
      float e = 9.0 * k;
      vec3 glow = ORANGE * (tip * (0.5 + 0.5 * uPtr.z) + 0.12 * halo * shine);
      Hv = e * (BASE * 0.3 * field * shine + glow);
      Hs = e * (0.3 * field * shine + maxc(glow));
    } else if (uHoverMode < 3.5) {
      // Prism: a short caustic on the grooves at its radius, its colours
      // split across them, red inside, blue out.
      float drc = (r - uHover.x) / (fr * uDpr);
      float s = da * max(uHover.x, 100.0) / 170.0;
      float w = 7.0;
      vec3 x = (drc + vec3(1.1, 0.0, -1.1) * w) / w;
      vec3 band = exp(-x * x) * exp(-s * s) * shine;
      float e = 5.0 * k;
      Hv = e * band;
      Hs = e * (band.r + band.g + band.b) / 3.0;
    } else if (uHoverMode < 4.5) {
      // Spot: a warm spotlight on the grooves, with a cool rim.
      float core = exp(-dist * dist / (52.0 * 52.0));
      float rim = exp(-(dist - 78.0) * (dist - 78.0) / (14.0 * 14.0));
      float e = 4.5 * k * shine;
      Hv = e * (mix(SAND, ORANGE, 0.3) * core + BLUE * 0.7 * rim);
      Hs = e * (core + 0.7 * rim);
    } else {
      // Ripples: rings of colour running out through the grooves from
      // where the pointer passes, each a shade on from the last.
      for (int i = 0; i < 8; i++) {
        vec4 p = uPts[i];
        float age = uTime - p.w;
        if (age < 0.0 || age > 2.2) continue;
        float x = (length(px - p.xy) - (20.0 + 120.0 * age)) / (6.0 + 7.0 * age);
        float band = exp(-x * x) * pow(1.0 - age / 2.2, 1.5) * min(1.0, age * 8.0);
        vec3 c = mix(vec3(1.0), hue(float(i) * 0.137 + age * 0.12), 0.7);
        Hv += c * band;
        Hs += band;
      }
      float e = 6.0 * k * shine;
      Hv *= e;
      Hs *= e;
    }
  }

  float lift = uStyle.z * edge * (1.0 + 0.08 * uSwell);
  float alpha = lift * L;
  // The lamp's colour, as on the footer's word: either side of the light
  // falling across the record, a cool side and a warm side, white between.
  vec3 base = BASE;
  if (uTint > 0.0) {
    float side = sin(a - uFacing);
    vec3 c = side < 0.0 ? BLUE : ORANGE;
    base = mix(BASE, 0.95 * c, clamp(0.85 * uTint * smoothstep(0.1, 0.9, abs(side)), 0.0, 1.0));
  }
  vec3 col = base * alpha + lift * (Gv + Hv);
  alpha += lift * max(max(Lg, maxc(Gv)), 0.0) + lift * max(Hs, maxc(Hv));

  // The needle's groove: lit warm, a narrow band riding on the grooves.
  vec3 warm = vec3(0.95, 0.86, 0.74);
  if (uNeedle.y > 0.0) {
    float d = (r - uNeedle.x) / max(3.0, fr * 1.2);
    float band = exp(-d * d * 0.5) * uNeedle.y * edge;
    float onl = mix(1.0, clamp(0.35 + 0.65 * (1.0 + lines) * 0.5, 0.0, 1.2), uStyle.x);
    float w = 0.45 * band * onl;
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

// The other styles: the same disc, songs, turn, pointer, needle and music,
// each drawn as a different kind of picture. None costs more than the
// current look: no groove harmonics, a pass or two over the songs, a
// handful of sums.
//
// What keeps them crisp however the disc is foreshortened:
// - Every edge is antialiased to the device pixel (stroke, span, wedge),
//   and the line styles draw at the screen's full resolution (see STYLE).
// - Lines that run round the disc are thinned out by octaves where they'd
//   crowd closer than a few pixels (lodLines): every other one fades as
//   they near it, so the far side, foreshortened hard behind the headline,
//   never beats into moire or a grey band.
// - Things meant to be round (dots, stars, flecks) are measured
//   on the screen, not on the disc (toPx), so the perspective and the top's
//   bends never squash them; screens (halftone, hatching) are laid out on
//   the screen too.
const LOOKS = `
const float GAPW = ${GAP}.0;
// Which song a radius is in: x, y its edges, z its number; w 1 inside one.
vec4 songAt(float r) {
  vec4 s = vec4(0.0, 0.0, 0.0, 0.0);
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    if (float(i) >= uTrackCount) break;
    vec2 t = uTracks[i];
    if (r >= t.x - 0.5 * GAPW && r < t.y + 0.5 * GAPW) s = vec4(t, float(i), 1.0);
  }
  return s;
}
// How much of a line w device pixels wide covers a pixel d device pixels off it.
float stroke(float d, float w) { return clamp(0.5 * w - abs(d) + 0.5, 0.0, 1.0); }
// 1 between two radii, its edges a device pixel soft (fr: record px per device px).
float span(float r, float lo, float hi, float fr) { return clamp((r - lo) / fr + 0.5, 0.0, 1.0) * clamp((hi - r) / fr + 0.5, 0.0, 1.0); }
// How far inside the turn from "from" through "len" radians, device px
// (negative outside; ft: record px per device px along the grooves).
float wedgeD(float b, float from, float len, float r, float ft) {
  float x = mod(b - from, 2.0 * PI);
  return (x < len ? min(x, len - x) : -min(x - len, 2.0 * PI - x)) * r / ft;
}
float wrap(float x) { return atan(sin(x), cos(x)); }
// Light, added; and ink, laid over (both premultiplied).
void add(inout vec4 o, vec3 c, float k) { o += vec4(c * k, k); }
void over(inout vec4 o, vec3 c, float k) { o = vec4(c * k, k) + o * (1.0 - k); }
// Lines every P0 of v (fv: v per device px), w device px wide, thinned out
// by octaves so they're never closer than gap device px.
float lodLines(float v, float fv, float P0, float gap, float w) {
  float lv = max(log2(gap * fv / P0), 0.0);
  float t = smoothstep(0.0, 1.0, fract(lv));
  float P = P0 * exp2(floor(lv));
  float n = floor(v / P + 0.5);
  return stroke((v - n * P) / fv, w) * (mod(n, 2.0) > 0.5 ? 1.0 - t : 1.0);
}
// A halftone dot screen at an angle, cell CSS px: how much ink at px for tone t.
float screenDot(vec2 p, float ang, float cell, float t) {
  vec2 rp = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p / cell;
  float d = length(fract(rp) - 0.5) * cell;
  float ink = 0.92 + 0.16 * hash(floor(rp));          // the ink takes a little unevenly
  return clamp((0.72 * cell * sqrt(clamp(t * ink, 0.0, 1.0)) - d) * uDpr + 0.5, 0.0, 1.0);
}

// The pointer, the same for every style, which each draws its own way.
// x: its main light, y: a second one (a beam's glow, a split's other
// colour, a spot's ring, the stylus's trail), z: a mark at the pointer.
vec3 hoverField(vec2 px, float r, float a, float fr, float ft) {
  vec3 h = vec3(0.0);
  float on = uHover.z * uTouch;
  if (on <= 0.0) return h;
  float da = wrap(a - uHover.y);
  float dist = length(px - uPtr.xy);
  float run = da * max(uHover.x, 100.0);
  if (uHoverMode < 0.5) {
    // Arc: the grooves at its radius, along their run.
    float dr = (r - uHover.x) / max(12.0, 4.0 * fr * uDpr);
    float s = run / 240.0;
    h.x = exp(-dr * dr - s * s);
  } else if (uHoverMode < 1.5) {
    // Beam: a streak across the grooves, out along the radius.
    float along = (r * cos(da) - uHover.x) / 200.0;
    float s = r * sin(da) / (ft * uDpr) / 6.0;
    float f = exp(-along * along) * step(0.0, cos(da));
    h.x = f * exp(-s * s);
    h.y = f * exp(-s * s / 9.0);
  } else if (uHoverMode < 2.5) {
    // Stylus: a tip, and the dots where it has just been.
    h.z = clamp((3.2 - dist) * uDpr + 0.5, 0.0, 1.0);
    h.x = exp(-dist * dist / 2500.0);
    for (int i = 0; i < 8; i++) {
      vec4 p = uPts[i];
      float age = uTime - p.w;
      if (age < 0.0 || age > 1.2) continue;
      float k = 1.0 - age / 1.2;
      h.y = max(h.y, clamp((2.2 * k - length(px - p.xy)) * uDpr + 0.5, 0.0, 1.0) * k);
    }
  } else if (uHoverMode < 3.5) {
    // Split: two arcs side by side across the grooves.
    float dr = (r - uHover.x) / (fr * uDpr);
    float s = run / 170.0;
    float e = exp(-s * s);
    h.x = e * exp(-(dr + 5.0) * (dr + 5.0) / 12.0);
    h.y = e * exp(-(dr - 5.0) * (dr - 5.0) / 12.0);
  } else if (uHoverMode < 4.5) {
    // Spot: a disc with a clean edge, and a ring round it.
    h.x = clamp((50.0 - dist) / 4.0 + 0.5, 0.0, 1.0);
    h.y = stroke((dist - 62.0) * uDpr, 1.5 * uDpr);
  } else {
    // Ripples: rings running out from where the pointer passed.
    for (int i = 0; i < 8; i++) {
      vec4 p = uPts[i];
      float age = uTime - p.w;
      if (age < 0.0 || age > 2.2) continue;
      float x = (length(px - p.xy) - (16.0 + 110.0 * age)) / (2.0 + 2.5 * age);
      float band = exp(-x * x) * pow(1.0 - age / 2.2, 1.5) * min(1.0, age * 8.0);
      if (mod(float(i), 2.0) < 0.5) h.x += band; else h.y += band;
    }
  }
  return h * on;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  vec2 q = discQ(px);
  float r = length(q);
  vec2 dqx = dFdx(q);
  vec2 dqy = dFdy(q);
  // Record px per device px, across the grooves and along them.
  float fr = max(length(vec2(dFdx(r), dFdy(r))), 1e-3);
  vec2 tdir = vec2(-q.y, q.x) / max(r, 1e-3);
  float ft = max(length(vec2(dot(dqx, tdir), dot(dqy, tdir))), 1e-3);
  if (r > max(uOuter.x, uOuter.y) + 3.0 * fr) { gl_FragColor = vec4(0.0); return; }
  float det = dqx.x * dqy.y - dqy.x * dqx.y;
  vec2 hp = px;
  float a = atan(q.y, q.x);
  float b = a - uSpin;                 // the angle on the disc itself, turning with it
  float farSide = smoothstep(0.15, 0.7, -q.y / max(r, 1.0));
  float R = mix(uOuter.x, uOuter.y, farSide);
  vec4 s = songAt(r);
  float idx = s.z;
  float u = s.w > 0.5 ? clamp((r - s.x) / (s.y - s.x), 0.0, 1.0) : 0.0;
  float mid = s.w > 0.5 ? 0.5 * (s.x + s.y) : r;
  // How much of this pixel is in a song (the quiet runs between are not),
  // and how tall the song is on the screen here, CSS px.
  float inS = s.w * span(r, s.x, s.y, fr);
  float room = s.w * (s.y - s.x) / (fr * uDpr);
  float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
  float cue = uCue.y;
  float sw = uSwell;
  vec3 hv = hoverField(hp, r, a, fr, ft);
  // The CSS px a line one record px across covers here, to fade detail
  // that has no room.
  float rp = 1.0 / (fr * uDpr);
  vec4 o = vec4(0.0);

#if LOOK == 1
  // ORBIT: line art from a star chart. Each song an orbit in a fine
  // luminous line, dashed orbits between, a polar grid fixed over it all,
  // stars in the black between, and a satellite riding each orbit with its
  // trail, carried round by the turn. Ticks round the rim turn with it.
  vec3 ICE = vec3(0.62, 0.87, 1.0);
  vec3 VIO = vec3(0.76, 0.66, 1.0);
  float glow = (0.72 + 0.28 * lamp) * (1.0 + 0.4 * sw);
  float roomy = smoothstep(6.0, 14.0, room);
  if (s.w > 0.5) {
    add(o, ICE, 0.6 * glow * mix(0.55, 1.0, roomy) * stroke((r - s.x) / fr, uDpr));
    if (mod(idx, 2.0) < 0.5) {
      float ph = fract(b * mid / 22.0 + idx * 0.37);
      float dash = clamp((0.3 - abs(ph - 0.5)) * 22.0 / ft + 0.5, 0.0, 1.0);
      add(o, ICE, 0.42 * glow * roomy * dash * stroke((r - mid) / fr, uDpr));
    }
    // The satellite (round on the screen) and its trail.
    float sa = fract(sin(idx * 91.7) * 4375.5) * 2.0 * PI;
    float x = wrap(b - sa);
    vec2 v = vec2((r - mid) / fr, x * r / ft) / uDpr;
    float dv = length(v);
    float sat = clamp((2.2 - dv) * uDpr + 0.5, 0.0, 1.0) + 0.5 * stroke((dv - 5.5) * uDpr, uDpr);
    float trail = stroke((r - mid) / fr, 1.2 * uDpr) * clamp(-x * r / ft + 0.5, 0.0, 1.0) * exp(x * mid / 240.0);
    add(o, mix(ICE, vec3(1.0), 0.6), cue * roomy * (0.95 * sat + 0.45 * trail) * (0.8 + 0.2 * lamp));
  }
  {
    // Stars, turning with it, where there's room to draw them round.
    vec2 c = vec2(r / 14.0, mod(b, 2.0 * PI) * r / 14.0);
    vec2 id = floor(c);
    float h = hash(id + 3.1);
    float roomS = smoothstep(7.0, 12.0, 14.0 * rp);
    if (h > 0.93 && roomS > 0.0) {
      vec2 at = (fract(c) - 0.5 - 0.3 * (vec2(hash(id + 1.7), hash(id + 5.3)) - 0.5)) * 14.0;
      float d = length(vec2(at.x / fr, at.y / ft)) / uDpr;
      float tw = 0.65 + 0.35 * sin(uSpin * 30.0 + h * 400.0);
      add(o, vec3(0.9, 0.95, 1.0), roomS * clamp((1.1 - d) * uDpr + 0.5, 0.0, 1.0) * (0.35 + 0.65 * fract(h * 61.0)) * tw);
    }
  }
  // The grid: a spoke every 30 degrees, fixed, as on an instrument.
  float sp = (fract(a / (PI / 6.0) + 0.5) - 0.5) * (PI / 6.0);
  add(o, ICE, 0.12 * stroke(sp * r / ft, uDpr) * span(r, 0.0, R - 16.0, fr));
  // The rim, and its ticks every 5 degrees going round with the disc.
  add(o, mix(ICE, vec3(1.0), 0.4), glow * stroke((r - (R - 1.5)) / fr, 1.4 * uDpr));
  float tk = (fract(b / (PI / 36.0) + 0.5) - 0.5) * (PI / 36.0);
  float tlen = mod(floor(b / (PI / 36.0) + 0.5), 6.0) < 0.5 ? 16.0 : 9.0;
  add(o, ICE, 0.6 * glow * cue * smoothstep(3.0, 6.0, tlen * rp) * stroke(tk * r / ft, uDpr) * span(r, R - 4.0 - tlen, R - 4.0, fr));
  // The pointer: the fine grooves light up white under it; its second
  // light, the mark and the needle in violet.
  float fine = lodLines(r, fr, 6.0, 4.0 * uDpr, uDpr);
  add(o, vec3(1.0), clamp(hv.x, 0.0, 1.0) * (0.15 + 0.85 * fine));
  add(o, VIO, clamp(hv.y, 0.0, 1.0) * (0.15 + 0.85 * fine) + hv.z);
  add(o, mix(VIO, vec3(1.0), 0.4), 0.95 * uNeedle.y * stroke((r - uNeedle.x) / fr, 1.6 * uDpr));
  add(o, VIO, 0.7 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 2
  // BAUHAUS: flat fields of red, yellow and blue and a warm paper white,
  // ruled with fine lines, and a few round dots, no shading at all. Most
  // songs carry a block of colour part of the way round, so the straight
  // edges of the fields show the turn. A block passing up behind the words
  // turns to a hatched screen, so the words always read.
  vec3 RED = vec3(0.89, 0.24, 0.16);
  vec3 YEL = vec3(0.98, 0.78, 0.18);
  vec3 BLU = vec3(0.16, 0.38, 0.82);
  vec3 PAP = vec3(0.94, 0.91, 0.85);
  float d45 = (fract((px.x + px.y) / 7.0 + 0.5) - 0.5) * 7.0 * 0.7071;
  float hatch = stroke(d45 * uDpr, uDpr);
  vec3 hc = RED;
  if (s.w > 0.5) {
    float thick = mod(idx, 3.0) < 0.5 ? 3.0 : 1.0;
    over(o, PAP, (thick > 2.0 ? 0.55 : 0.3) * stroke((r - s.x) / fr, thick * uDpr));
    float k = mod(idx, 5.0);
    float h1 = fract(sin(idx * 37.1) * 9431.7);
    float h2 = fract(sin(idx * 61.3) * 2741.9);
    vec3 bc = k < 0.5 ? RED : k < 1.5 ? BLU : k < 2.5 ? YEL : k < 3.5 ? PAP : RED;
    float len = (k > 2.5 && k < 3.5) ? 0.25 + 0.3 * h2 : 0.45 + 1.0 * h2;
    float from = h1 * 2.0 * PI;
    if (k < 3.5 || h1 > 0.5) {
      float wD = wedgeD(b, from, len, r, ft);
      float inW = clamp(wD + 0.5, 0.0, 1.0);
      float top = 1.0 - smoothstep(-0.55, -0.2, sin(from + 0.5 * len + uSpin));
      float rim = max(stroke(wD, 1.5 * uDpr) * inS, inW * max(stroke((r - s.x) / fr, 1.5 * uDpr), stroke((r - s.y) / fr, 1.5 * uDpr)));
      over(o, bc, (k > 2.5 && k < 3.5 ? 0.75 : 0.9) * (1.0 + 0.1 * sw) * max(inS * inW * mix(1.0, 0.4 * hatch, top), rim * top));
    }
    // A dot riding round in some songs, round on the screen.
    if (mod(idx, 3.0) > 1.5 && room > 8.0) {
      float ang = fract(sin(idx * 17.3) * 9631.1) * 2.0 * PI + uSpin;
      vec2 D = q - mid * vec2(cos(ang), sin(ang));
      float dd = length(vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr));
      float rad = min(14.0, 0.42 * room);
      float top = 1.0 - smoothstep(-0.55, -0.2, sin(ang));
      vec3 dc = k < 1.5 ? YEL : k < 2.5 ? BLU : RED;
      over(o, dc, 0.95 * cue * mix(clamp((rad - dd) * uDpr + 0.5, 0.0, 1.0), stroke((dd - rad) * uDpr, 1.5 * uDpr), top));
    }
    hc = k < 0.5 || k > 3.5 ? YEL : RED;
  }
  // The pointer: a flat shape of colour, cut clean (the song's own band).
  over(o, hc, 0.92 * clamp((hv.x - 0.45) * 10.0, 0.0, 1.0) * max(inS, step(3.5, uHoverMode)));
  over(o, BLU, 0.92 * clamp((hv.y - 0.45) * 10.0, 0.0, 1.0));
  over(o, PAP, hv.z);
  over(o, PAP, 0.3 * stroke((r - (R - 1.5)) / fr, 1.5 * uDpr));
  // The needle: a bold yellow ring; the drop, a fine paper one.
  over(o, YEL, 0.9 * uNeedle.y * stroke((r - uNeedle.x) / fr, 4.0 * uDpr));
  over(o, PAP, 0.5 * uRipple.y * stroke((r - uRipple.x) / fr, 1.5 * uDpr));
#elif LOOK == 3
  // RISO: a two-colour risograph print, fluorescent pink and blue, each a
  // halftone screen laid on the page at its own angle, a touch out of
  // register. The pink follows the lamp's light, a clean ramp; the blue
  // prints a flat tint per song and heavy blocks that turn with the disc.
  vec3 PINK = vec3(1.0, 0.3, 0.62);
  vec3 BLUE2 = vec3(0.16, 0.56, 1.0);
  float h1 = fract(sin(idx * 37.1) * 9431.7);
  float h2 = fract(sin(idx * 61.3) * 2741.9);
  float tint = mod(idx, 3.0) < 0.5 ? 0.1 : mod(idx, 3.0) < 1.5 ? 0.3 : 0.0;
  float blk = clamp(wedgeD(b, h1 * 2.0 * PI, 0.5 + 0.9 * h2, r, ft) + 0.5, 0.0, 1.0) * step(0.4, h2);
  float tB = inS * max(tint, 0.62 * blk * cue) * (1.0 + 0.25 * sw);
  float tP = inS * (0.03 + 0.5 * pow(lamp, 3.0)) * (1.0 + 0.3 * sw);
  // The pointer presses the inks in harder; the drop's ring prints blue.
  tP += 0.7 * (hv.x + hv.z) * max(inS, 0.5);
  tB += 0.7 * hv.y;
  float dr = (r - uRipple.x) / 24.0;
  tB += 0.6 * uRipple.y * exp(-dr * dr);
  float inkB = screenDot(px + vec2(1.2, -0.8), 1.31, 6.0, tB);
  float inkP = screenDot(px, 0.26, 6.0, tP);
  add(o, BLUE2, 0.55 * inkB);
  add(o, PINK, 0.6 * inkP);
  // Solid strokes: each song's edge, the rim, and the needle's groove
  // (with its blue a hair off).
  add(o, PINK, 0.35 * smoothstep(4.0, 9.0, room) * stroke((r - s.x) / fr, uDpr));
  add(o, PINK, 0.45 * stroke((r - (R - 1.5)) / fr, 1.4 * uDpr));
  add(o, PINK, 0.85 * uNeedle.y * stroke((r - uNeedle.x) / fr, 2.4 * uDpr));
  add(o, BLUE2, 0.65 * uNeedle.y * stroke((r - uNeedle.x) / fr - 2.2 * uDpr, 1.6 * uDpr));
#elif LOOK == 4
  // ENGRAVING: a banknote's guilloche. In each song two families of fine
  // engraved lines weave round in waves, crossing into a lattice; the
  // lines swell where the lamp falls, as an engraver's do. The waves are
  // cut into the disc, so they turn with it. Double rules part the songs.
  vec3 IVORY = vec3(0.95, 0.9, 0.79);
  vec3 COPPER = vec3(0.98, 0.6, 0.34);
  float nd = (r - uNeedle.x) / 14.0;
  float hot = clamp(hv.x + hv.y + hv.z + uNeedle.y * exp(-nd * nd), 0.0, 1.5);
  if (s.w > 0.5) {
    float hw = 0.5 * (s.y - s.x);
    float N = floor(mid / 9.0);
    float A = min(11.0, 0.35 * hw) * sin(PI * u);
    float wv = sin(N * b + idx * 1.3);
    float g1 = r + A * wv;
    float g2 = r - A * wv;
    float f1 = max(fwidth(g1), 1e-3);
    float f2 = max(fwidth(g2), 1e-3);
    float wd = ((0.55 + 0.9 * lamp * lamp) * (1.0 + 0.35 * sw) + 1.3 * hot) * uDpr;
    float line = max(lodLines(g1, f1, 7.0, 5.0 * uDpr, wd), lodLines(g2, f2, 7.0, 5.0 * uDpr, wd));
    over(o, mix(IVORY, COPPER, clamp(hot * 1.3, 0.0, 1.0)), 0.5 * line * inS * (0.4 + 0.6 * cue) * smoothstep(5.0, 10.0, room));
    float rules = stroke((r - s.x - 2.5) / fr, uDpr) + stroke((r - s.y + 2.5) / fr, uDpr);
    over(o, IVORY, 0.34 * min(rules, 1.0) * mix(0.5, 1.0, smoothstep(4.0, 9.0, room)));
  }
  over(o, IVORY, 0.5 * stroke((r - (R - 1.5)) / fr, 1.4 * uDpr));
  over(o, IVORY, 0.3 * stroke((r - (R - 6.0)) / fr, uDpr) * smoothstep(1.0, 3.0, 4.5 * rp));
  // The needle's groove: one copper line cut deep; the drop, a fine ring.
  over(o, COPPER, 0.9 * uNeedle.y * stroke((r - uNeedle.x) / fr, 1.8 * uDpr));
  over(o, COPPER, 0.5 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 5
  // CHROME: liquid metal. Each song a polished bead, its face turning from
  // up to down across it, so it mirrors a plain studio: a pale sky over a
  // crisp horizon, a dark floor beneath. The horizon runs along every song
  // as a sharp bright edge; a slow wobble in the pressing, turning with the
  // disc, sends it wandering; the lamp is a hard white sun in the sky. The
  // pointer bends the metal, so the reflections flow round it. Where a song
  // is too thin on the screen for its bands, it settles to its mean grey.
  vec3 SKY0 = vec3(0.8, 0.86, 0.95);
  vec3 SKY1 = vec3(0.4, 0.48, 0.62);
  vec3 FLOOR0 = vec3(0.22, 0.2, 0.19);
  vec3 FLOOR1 = vec3(0.05, 0.05, 0.06);
  float k1 = floor(mid / 140.0) + 3.0;
  float wob = 0.25 * cue * sin(k1 * b + idx * 2.3) + 0.1 * sin(2.0 * (a - uFacing));
  float y = (u - 0.5) * 2.3 + wob + 0.7 * (hv.x - hv.y) - 0.15 * sw;
  float fy = max(fwidth(y), 1e-4);
  vec3 c = mix(mix(FLOOR0, FLOOR1, clamp(-1.4 * y, 0.0, 1.0)), mix(SKY1, SKY0, clamp(1.2 * y, 0.0, 1.0)), clamp(y / fy + 0.5, 0.0, 1.0));
  c = mix(c, vec3(1.0), 0.85 * clamp(1.6 - abs(y) / fy, 0.0, 1.0));
  float sunv = min(lamp - 0.955, 0.16 - abs(y - 0.62));
  c = mix(c, vec3(1.0), clamp(sunv / max(fwidth(sunv), 1e-4) + 0.5, 0.0, 1.0));
  c = mix(vec3(0.36, 0.38, 0.43), c, smoothstep(4.0, 10.0, room));
  over(o, c, 0.96 * inS);
  over(o, vec3(0.92, 0.95, 1.0), (0.5 + 0.5 * lamp) * stroke((r - (R - 1.5)) / fr, 1.5 * uDpr));
  over(o, vec3(1.0, 0.86, 0.6), hv.z);
  // The needle: its groove a line of warm light; the drop, a fine ring.
  over(o, vec3(1.0, 0.86, 0.6), 0.95 * uNeedle.y * stroke((r - uNeedle.x) / fr, 1.8 * uDpr));
  over(o, vec3(1.0), 0.6 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 6
  // TINTED: translucent cherry vinyl, the light coming through it. The
  // body a clear flat red; the quiet runs between songs clearer still; the
  // grooves fine lines that catch the lamp; its reflection two clean-edged
  // wedges where the grooves light up pale; flecks in the vinyl carried
  // round, glinting as they pass through the light.
  vec3 TINT = vec3(0.92, 0.1, 0.24);
  vec3 HI = vec3(1.0, 0.8, 0.84);
  float wedge = smoothstep(0.78, 0.84, lamp);
  add(o, TINT, mix(0.15, 0.3, inS) * (1.0 + 0.15 * sw));
  float gro = lodLines(r, fr, 5.0, 3.5 * uDpr, 0.9 * uDpr) * inS;
  add(o, mix(TINT, HI, wedge), (0.1 + 0.32 * wedge) * gro);
  add(o, HI, 0.05 * wedge * inS);
  add(o, HI, 0.5 * wedge * smoothstep(3.0, 8.0, room) * stroke((r - s.x) / fr, uDpr));
  {
    vec2 c = vec2(r / 40.0, mod(b, 2.0 * PI) * r / 40.0);
    vec2 id = floor(c);
    float h = hash(id + 7.7);
    float roomF = smoothstep(12.0, 20.0, 40.0 * rp);
    if (h > 0.8 && roomF > 0.0) {
      vec2 ctr = (id + 0.5 + 0.5 * (vec2(hash(id + 1.7), hash(id + 5.3)) - 0.5)) * 40.0;
      float ang = ctr.y / ((id.x + 0.5) * 40.0) + uSpin;
      vec2 D = q - ctr.x * vec2(cos(ang), sin(ang));
      float dd = length(vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr));
      float rad = 0.9 + 1.0 * fract(h * 37.0);
      float ls = 0.5 + 0.5 * cos(2.0 * (ang - uFacing));
      add(o, HI, roomF * cue * clamp((rad - dd) * uDpr + 0.5, 0.0, 1.0) * (0.25 + 0.75 * ls * ls));
    }
  }
  add(o, HI, (0.4 + 0.5 * lamp) * stroke((r - (R - 1.5)) / fr, 1.4 * uDpr));
  // The pointer: light through the vinyl, the grooves under it lit pale.
  add(o, HI, clamp(hv.x, 0.0, 1.0) * (0.12 + 0.7 * gro));
  add(o, TINT, 0.35 * hv.x);
  add(o, vec3(1.0, 0.7, 0.4), clamp(hv.y, 0.0, 1.0) * (0.15 + 0.6 * gro));
  add(o, HI, hv.z);
  add(o, vec3(1.0, 0.92, 0.8), 0.9 * uNeedle.y * stroke((r - uNeedle.x) / fr, 1.6 * uDpr));
  add(o, HI, 0.6 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 7
  // CONTOUR: a topographic map. The disc a gentle basin, each song a ridge
  // whose peaks rise and fall round it and turn with the disc; drawn as
  // contour lines, an index line every fourth, coloured by height in a
  // few clean steps (sea teal, sage, sand, snow).
  vec3 LOW = vec3(0.32, 0.72, 0.72);
  vec3 MID = vec3(0.68, 0.82, 0.52);
  vec3 HIGH = vec3(0.97, 0.82, 0.56);
  vec3 TOP = vec3(1.0, 0.97, 0.92);
  vec3 ACC = vec3(1.0, 0.42, 0.28);
  float hill = 0.0;
  if (s.w > 0.5) {
    float k = floor(mid / 110.0) + 2.0;
    float sn = sin(PI * u);
    // (Flattened where the song is too thin on the screen to show its ridge.)
    hill = 1.5 * sn * sn * (0.55 + 0.45 * cue * sin(k * b + idx * 2.1)) * (1.0 + 0.1 * sw) * smoothstep(8.0, 20.0, room);
  }
  float h = r / 85.0 + hill + 0.3 * sin(3.0 * b + r / 140.0 + 1.0);
  float fh = max(fwidth(h), 1e-4);
  float minor = lodLines(h, fh, 0.2, 4.0 * uDpr, 0.8 * uDpr);
  float index = lodLines(h, fh, 0.8, 9.0 * uDpr, 1.5 * uDpr);
  float e = hill / 1.5;
  vec3 col = e < 0.2 ? LOW : e < 0.55 ? MID : e < 0.85 ? HIGH : TOP;
  float hl = clamp(hv.x + hv.z, 0.0, 1.0);
  col = mix(col, ACC, hl);
  float line = max(0.26 * minor, 0.62 * index) * (1.0 + 0.6 * hl);
  add(o, col, line);
  add(o, LOW, 0.6 * clamp(hv.y, 0.0, 1.0) * max(minor, index));
  add(o, ACC, hv.z);
  add(o, MID, 0.55 * stroke((r - (R - 1.5)) / fr, 1.2 * uDpr));
  // The needle: a dashed route along its groove; the drop, a fine ring.
  float dash = clamp((0.28 - abs(fract(b * r / 14.0) - 0.5)) * 14.0 / ft + 0.5, 0.0, 1.0);
  add(o, ACC, 0.95 * uNeedle.y * dash * stroke((r - uNeedle.x) / fr, 2.0 * uDpr));
  add(o, ACC, 0.5 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 8
  // NEON: a few glass tubes bent into rings, every third song, each its
  // own colour: a white-hot core, the coloured tube, and its glow on the
  // dark. Each tube has a break or two (the bends between its sections),
  // which turn with the disc.
  vec3 NP = vec3(1.0, 0.24, 0.6);
  vec3 NC = vec3(0.2, 0.88, 1.0);
  vec3 NA = vec3(1.0, 0.66, 0.2);
  vec3 NV = vec3(0.64, 0.42, 1.0);
  float shine = (0.85 + 0.15 * lamp) * (1.0 + 0.35 * sw);
  float halo = 0.0;
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    if (float(i) >= uTrackCount) break;
    if (mod(float(i), 3.0) > 0.5) continue;
    float T = uTracks[i].x - 0.5 * GAPW;
    float dcss = (r - T) / (fr * uDpr);
    if (abs(dcss) > 40.0) continue;
    float k = mod(float(i) / 3.0, 4.0);
    vec3 c = k < 0.5 ? NP : k < 1.5 ? NC : k < 2.5 ? NA : NV;
    float g0 = fract(sin(float(i) * 41.3) * 7919.1) * 2.0 * PI;
    float gl1 = abs(wrap(b - g0)) * T / (ft * uDpr);
    float gl2 = abs(wrap(b - g0 - 2.3)) * T / (ft * uDpr);
    float gap = min(gl1, gl2) - 5.0 * cue;
    float lit = clamp(gap * uDpr + 0.5, 0.0, 1.0);
    float tube = stroke(dcss * uDpr, 3.6 * uDpr);
    float core = stroke(dcss * uDpr, 1.2 * uDpr);
    float glo = 0.28 * exp(-dcss * dcss / 90.0) + 0.22 * exp(-dcss * dcss / 9.0);
    add(o, c, shine * lit * (0.85 * tube + glo));
    add(o, vec3(1.0), 0.8 * shine * lit * core);
    // The electrodes at the break, dim stubs of glass.
    add(o, c, 0.25 * tube * (1.0 - lit) * clamp((gap + 3.0) * uDpr + 0.5, 0.0, 1.0));
  }
  {
    float dcss = (r - (R - 6.0)) / (fr * uDpr);
    add(o, NP, 0.6 * shine * (0.8 * stroke(dcss * uDpr, 2.4 * uDpr) + 0.25 * exp(-dcss * dcss / 50.0)));
  }
  // The pointer: its light in pink, the second in cyan, a white-hot mark.
  float hx = clamp(hv.x, 0.0, 1.0);
  add(o, NP, 0.45 * hx);
  add(o, vec3(1.0), 0.7 * hx * hx * hx);
  add(o, NC, 0.5 * clamp(hv.y, 0.0, 1.0));
  add(o, vec3(1.0), hv.z);
  // The needle: a new tube lights in its groove; the drop, a violet ring.
  float nd = (r - uNeedle.x) / (fr * uDpr);
  add(o, NC, uNeedle.y * (0.85 * stroke(nd * uDpr, 3.2 * uDpr) + 0.3 * exp(-nd * nd / 60.0)));
  add(o, vec3(1.0), 0.8 * uNeedle.y * stroke(nd * uDpr, uDpr));
  add(o, NV, 0.6 * uRipple.y * stroke((r - uRipple.x) / fr, 1.5 * uDpr));
  o = min(o, vec4(1.0));
#elif LOOK == 9
  // ENAMEL: cloisonne. Each song a band of glossy enamel in a jewel
  // colour, parted from the next by a gold wire; every other band set with
  // round flowers of another enamel ringed in gold, turning with the disc;
  // the lamp's reflection a clean narrow gleam across it.
  vec3 GOLD = vec3(0.84, 0.66, 0.3);
  vec3 GOLDHI = vec3(1.0, 0.92, 0.66);
  float k = mod(idx, 6.0);
  vec3 col = k < 0.5 ? vec3(0.12, 0.26, 0.64) : k < 1.5 ? vec3(0.06, 0.56, 0.6) : k < 2.5 ? vec3(0.88, 0.36, 0.3)
    : k < 3.5 ? vec3(0.13, 0.46, 0.34) : k < 4.5 ? vec3(0.94, 0.66, 0.18) : vec3(0.62, 0.24, 0.42);
  vec3 col2 = k < 0.5 ? vec3(0.94, 0.66, 0.18) : k < 1.5 ? vec3(0.88, 0.36, 0.3) : k < 2.5 ? vec3(0.06, 0.56, 0.6)
    : k < 3.5 ? vec3(0.95, 0.9, 0.8) : k < 4.5 ? vec3(0.12, 0.26, 0.64) : vec3(0.94, 0.66, 0.18);
  float lit = 1.0 + 0.3 * clamp(hv.x, 0.0, 1.0) + 0.08 * sw;
  over(o, min(col * lit, vec3(1.0)), 0.94 * inS);
  if (s.w > 0.5 && mod(idx, 2.0) < 0.5 && room > 7.0) {
    float N = max(6.0, floor(2.0 * PI * mid / 34.0));
    float n = floor(mod(b, 2.0 * PI) / (2.0 * PI) * N);
    float ang = (n + 0.5) * 2.0 * PI / N + uSpin;
    vec2 D = q - mid * vec2(cos(ang), sin(ang));
    float dd = length(vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr));
    float rad = min(5.0, 0.3 * room);
    float fit = smoothstep(4.0, 7.0, 2.0 * PI * mid / N / (ft * uDpr) - 2.0 * rad) * cue;
    over(o, col2, fit * inS * clamp((rad - dd) * uDpr + 0.5, 0.0, 1.0));
    over(o, mix(GOLD, GOLDHI, 0.3), fit * inS * stroke((dd - rad) * uDpr, 1.2 * uDpr));
  }
  // The wires: the quiet runs between songs, gold, at least a hair wide.
  float wire = max(1.0 - inS, stroke((r - (s.x - 0.5 * GAPW)) / fr, 1.4 * uDpr) * s.w);
  float gl = smoothstep(0.72, 0.76, lamp);
  vec3 wc = mix(GOLD, GOLDHI, max(gl, clamp(hv.x + hv.y, 0.0, 1.0)));
  over(o, wc, 0.96 * wire * step(uSpan.x, r));
  over(o, GOLDHI, stroke((r - (R - 1.5)) / fr, 2.0 * uDpr));
  // The gleam: the lamp's reflection, narrow and clean-edged.
  add(o, vec3(1.0), 0.16 * smoothstep(0.955, 0.965, lamp) * inS);
  over(o, GOLDHI, clamp(hv.y, 0.0, 1.0) * 0.8 * (1.0 - inS) + hv.z);
  over(o, GOLDHI, 0.95 * uNeedle.y * stroke((r - uNeedle.x) / fr, 2.2 * uDpr));
  over(o, GOLDHI, 0.6 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#elif LOOK == 10
  // PAPERCUT: layers of coloured card cut into rings, each song one, its
  // inner edge cut in scallops; each layer lies on the one inside it and
  // casts a small soft shadow onto it. The scallops turn with the disc.
  vec3 CREAM = vec3(0.95, 0.9, 0.8);
  vec3 sh = vec3(0.0);
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    if (float(i) >= uTrackCount) break;
    vec2 t = uTracks[i];
    float n = max(5.0, floor(t.x / 26.0));
    float amp = 9.0 * (0.35 + 0.65 * cue);
    float ph = float(i) * 1.7;
    float sc = 0.5 + 0.5 * cos(n * b + ph);
    float inner = t.x - GAPW - amp * sc;
    // Device px inside this layer's edge (its slope round the disc too).
    float slope = amp * 0.5 * n * sin(n * b + ph) / max(r, 1.0) * ft;
    float d = (r - inner) / length(vec2(fr, slope));
    if (d < -40.0 * uDpr) break;
    float m = mod(float(i), 5.0);
    vec3 c = m < 0.5 ? vec3(0.2, 0.25, 0.38) : m < 1.5 ? vec3(0.22, 0.42, 0.44) : m < 2.5 ? vec3(0.62, 0.31, 0.23)
      : m < 3.5 ? vec3(0.72, 0.56, 0.3) : vec3(0.4, 0.29, 0.46);
    // Its shadow on what's beneath, just outside its edge.
    o *= 1.0 - 0.5 * exp(min(d, 0.0) / (5.0 * uDpr)) * step(d, 0.0);
    float cov = clamp(d + 0.5, 0.0, 1.0);
    // The cut edge catches the light.
    vec3 cc = mix(c, CREAM, 0.45 * stroke(d - 1.0 * uDpr, 1.2 * uDpr) * (0.3 + 0.7 * lamp));
    over(o, cc * (1.0 + 0.08 * sw), 0.97 * cov);
  }
  // The pointer: a window cut in cream card, a cream ring, a cream mark.
  over(o, CREAM, 0.9 * clamp((hv.x - 0.45) * 10.0, 0.0, 1.0));
  over(o, vec3(0.62, 0.31, 0.23), 0.9 * clamp((hv.y - 0.45) * 10.0, 0.0, 1.0));
  over(o, CREAM, hv.z);
  // The needle: a stitched thread along its groove; the drop, a fine one.
  float stitch = clamp((0.3 - abs(fract(b * r / 10.0) - 0.5)) * 10.0 / ft + 0.5, 0.0, 1.0);
  over(o, CREAM, 0.95 * uNeedle.y * stitch * stroke((r - uNeedle.x) / fr, 1.6 * uDpr));
  over(o, CREAM, 0.6 * uRipple.y * stroke((r - uRipple.x) / fr, uDpr));
#endif

  // A step quieter up behind the words, so they read easily over it.
#if LOOK == 1 || LOOK == 8
  const float CALM = 0.75;
#elif LOOK == 2
  const float CALM = 1.0;   // flat fields stay flat (they're hatched up there)
#elif LOOK == 9 || LOOK == 10
  const float CALM = 0.4;
#elif LOOK == 5
  const float CALM = 0.3;   // bright metal
#else
  const float CALM = 0.55;
#endif
  o *= mix(CALM, 1.0, smoothstep(uCentre.y - 330.0, uCentre.y - 90.0, px.y));
  // The label hides behind the app's screen; and nothing past the rim.
  o *= smoothstep(uSpan.x, uSpan.x + 40.0, r) * clamp((R - r) / fr + 0.5, 0.0, 1.0);
  // Nothing shows through the hero's buttons (one is see-through).
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 h = uHoles[i];
    vec2 hc2 = 0.5 * (h.xy + h.zw);
    vec2 hq = abs(px - hc2) - (0.5 * (h.zw - h.xy) - uHoleR);
    float sd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - uHoleR;
    o *= smoothstep(-1.0, 0.0, sd);
  }
  o.a = clamp(o.a, 0.0, 1.0);
  o.rgb = min(o.rgb, vec3(o.a));
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(o.rgb + n, 0.0), clamp(o.a + n, 0.0, 1.0));
}`;
// The styles, by name: n is its program (0 the current look, the others
// LOOK in LOOKS). crisp: drawn at the screen's full resolution whatever
// the render resolution, since fine lines, dots and cells go soft when
// the browser scales them up (each still costs less than the current
// look does at its own resolution).
const STYLE_LIST = [
  ['current', 'Current (dark vinyl)', { n: 0 }],
  ['orbit', 'Orbit (star-chart line art)', { n: 1, crisp: true }],
  ['bauhaus', 'Bauhaus', { n: 2, crisp: true }],
  ['riso', 'Risograph', { n: 3, crisp: true }],
  ['engraving', 'Engraving (guilloche)', { n: 4, crisp: true }],
  ['chrome', 'Chrome (liquid metal)', { n: 5, crisp: true }],
  ['tinted', 'Tinted vinyl (translucent cherry)', { n: 6, crisp: true }],
  ['contour', 'Contour map', { n: 7, crisp: true }],
  ['neon', 'Neon tubes', { n: 8, crisp: true }],
  ['enamel', 'Enamel (cloisonne)', { n: 9, crisp: true }],
  ['papercut', 'Paper cut-out', { n: 10, crisp: true }],
];
const LOOK = Object.fromEntries(STYLE_LIST.map(([k, , d]) => [k, d.n]));
const STYLE = Object.fromEntries(STYLE_LIST.map(([k, , d]) => [k, d]));

let prog = null;
let U = {};
let geo = null;

// One program per style, compiled the first time it's shown.
const NAMES = ['uSize', 'uDpr', 'uCentre', 'uGeo', 'uHoles', 'uHoleCount', 'uHoleR', 'uSpan', 'uSpin', 'uFacing', 'uStyle', 'uSheen', 'uGlint', 'uHover', 'uSwell', 'uNeedle', 'uRipple', 'uTouch', 'uHz', 'uCue', 'uTracks', 'uTrackCount',
  'uOuter', 'uGlintAmt', 'uChroma', 'uSpeck', 'uTint', 'uWarp', 'uLens', 'uHoverMode', 'uPtr', 'uPts', 'uTime'];
const progs = new Map();
let shown = -1;
function build(n) {
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  // WebGL 1 needs the derivatives extension switched on in the shader.
  const frag = '#extension GL_OES_standard_derivatives : enable\n' + (n ? `#define LOOK ${n}\n${HEAD}${LOOKS}` : HEAD + MAIN);
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (const k of NAMES) u[k] = gl.getUniformLocation(p, k);
  return { p, u };
}
/** Switch to style n (see LOOK); a style that won't compile shows the current one. */
function use(n) {
  if (n === shown) return;
  let e = progs.get(n);
  if (!e) {
    try {
      e = build(n);
    } catch (err) {
      if (!n) throw err;
      console.warn('hero-fx:', err);
      e = progs.get(0) ?? build(0);
    }
    progs.set(n, e);
  }
  prog = e.p;
  U = e.u;
  gl.useProgram(prog);
  shown = n;
  // Each program keeps its own uniforms: lay everything out afresh.
  geo = null;
  measured = 0;
}

function init() {
  if (!gl) return false;
  gl.getExtension('OES_standard_derivatives');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  use(LOOK[T.look] ?? 0);
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
  const hz = horizon();
  const d0 = cy + hz;
  const tilt = Math.max(0.2, ((d0 / (RIM_TOP + T.drop + hz) - 1) * d0) / R);
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
  const key = [c.width, c.height, Math.round(cx), Math.round(cy), Math.round(end), T.drop, T.persp, T.size, T.up, T.warp, T.warpAmt, T.mask].join();
  gl.uniform4fv(U.uHoles, new Float32Array([...holes.flat(), ...new Array(16 - holes.length * 4).fill(0)]));
  gl.uniform1f(U.uHoleCount, holes.length);
  const btn = document.querySelector('.hero .btn');
  gl.uniform1f(U.uHoleR, btn ? parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 0 : 0);
  if (geo?.key === key) return Object.assign(geo, { box });
  // The bends up top (see toRecord): more rings above, as a share of the
  // half above the centre; the lens's place and size.
  const g = { cx, cy, hz, d0, tilt, up: T.up, half: c.width / 2, lens: [cx, RIM_TOP + T.drop + (cy - RIM_TOP - T.drop) * 0.45, Math.max(200, c.width * 0.3)] };
  // How far out it runs: all round, and (with more rings above) up top as
  // far as the rings now reach at the top of the canvas.
  const out = R * T.size;
  const top = T.up > 0 ? Math.max(out, toRecord(cx, RIM_TOP + T.drop, g).r) : out;
  const Rmax = Math.max(out, top);
  const tracks = [];
  for (let a = r0, i = 0; a < Rmax - 40 && tracks.length < MAX_TRACKS; i++) {
    const b = Math.min(Rmax - 34, a + 60 + rand(i, 9) * 80);
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
  // And the canvas ends where the record does, not 2000px down.
  canvas.style.height = `${Math.ceil(end + 8)}px`;
  topFade();
  geo = { ...g, key, R, r0, box, out, top, Rmax };
  return geo;
}

const local = (e) => {
  const c = canvas.getBoundingClientRect();
  return { x: e.clientX - c.left, y: e.clientY - c.top };
};
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const p = local(e);
  Object.assign(hover, p, { moved: performance.now() });
  if (quiet.on && Math.hypot(p.x - quiet.x, p.y - quiet.y) > 40) quiet.on = false;
  wake();
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => Object.assign(hover, { x: -1e4, y: -1e4 }));
addEventListener('pointerdown', (e) => {
  if (touch !== 'needle' || !geo || e.target.closest('a, button, input, select, summary, iframe, .shot, .dialkit-root')) return;
  const p = local(e);
  const { r } = toRecord(p.x, p.y, geo);
  if (r < geo.r0 || r > geo.Rmax) return;
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
  // Drawn at T.res of the screen's pixels and scaled up by the browser: the
  // grooves are soft light, so full Retina resolution buys little and costs
  // four times the pixels.
  const dpr = Math.min(2, devicePixelRatio || 1) * (STYLE[T.look]?.crisp ? 1 : T.res);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    geo = null;
  }
  use(LOOK[T.look] ?? 0);
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
    needleOn = Math.min(1, age / NEEDLE_IN) * (1 - Math.min(1, Math.max(0, (age - NEEDLE_IN - NEEDLE_HOLD) / NEEDLE_FADE)) ** 2);
    if (age >= NEEDLE_IN + NEEDLE_HOLD + NEEDLE_FADE) { needle.on = false; needleOn = 0; }
  }
  let rippleOn = 0;
  let rippleR = 0;
  if (ripple.on) {
    const t = (now - ripple.born) / (RIPPLE_S * 1000);
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
  // And only while the pointer moves: a little after it stops, its light
  // fades away, so no groove is left looking selected under a still pointer.
  const lively = T.still >= 10 || now - hover.moved < T.still * 1000;
  const reach = touch !== 'off' && !overScreen && !quiet.on && lively && hr > g.r0 && hr < g.Rmax ? 1 : 0;
  const mode = HOVERS[T.hover] ?? 0;
  const sp = SPRING[T.hover];
  if (reach) {
    if (hover.on < 0.02) {
      // Coming in from nothing, it starts right there.
      Object.assign(hover, { r: hr, a: ha, sx: hover.x, sy: hover.y, vx: 0, vy: 0 });
      Object.assign(lastPt, { x: hover.x, y: hover.y, t: -99 });
    }
    const k = Math.min(1, dt * 7);
    hover.r += (hr - hover.r) * k;
    hover.a += Math.atan2(Math.sin(ha - hover.a), Math.cos(ha - hover.a)) * k;
  }
  // Fades in over a third of a second or so, out over a second (quicker
  // once the needle drops, which takes the pointer's light off).
  hover.on += (reach - hover.on) * Math.min(1, dt * (reach ? 3 : quiet.on ? 3.5 : 2.2));
  if (!reach && hover.on < 0.01) hover.on = 0;
  if (hover.on > 0) clock += dt;
  // The newer styles follow on a spring (in small steps, so it's steady at
  // any frame rate), only while they show.
  if (sp && hover.on > 0) {
    const [k, z] = sp;
    const c = 2 * z * Math.sqrt(k);
    const ox = hover.sx;
    const oy = hover.sy;
    for (let s = 0, n = Math.ceil(dt / (1 / 240)); s < n; s++) {
      const h = dt / n;
      hover.vx += (k * (hover.x - hover.sx) - c * hover.vx) * h;
      hover.vy += (k * (hover.y - hover.sy) - c * hover.vy) * h;
      hover.sx += hover.vx * h;
      hover.sy += hover.vy * h;
    }
    const v = dt > 0 ? Math.hypot(hover.sx - ox, hover.sy - oy) / dt / 600 : 0;
    hover.speed += (Math.min(1, v) - hover.speed) * Math.min(1, dt * 8);
    const at = toRecord(hover.sx, hover.sy, g);
    hover.r = at.r;
    hover.a = at.a;
    // The stylus leaves a trail where its tip passes; ripples start a ring
    // every so often while it moves.
    const moved = Math.hypot(hover.sx - lastPt.x, hover.sy - lastPt.y);
    if (reach && ((mode === 2 && moved > 9 && clock - lastPt.t > 0.035) || (mode === 5 && moved > 28 && clock - lastPt.t > 0.22))) {
      pts[nextPt] = [hover.sx, hover.sy, at.r, clock];
      nextPt = (nextPt + 1) % pts.length;
      Object.assign(lastPt, { x: hover.sx, y: hover.sy, t: clock });
    }
  }

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
  // A still frame (reduced motion) may be the last one drawn for a while, so
  // nothing passing (the needle, its ring, the pointer's light) goes in it.
  gl.uniform2f(U.uNeedle, needle.r, still ? 0 : needleOn * T.needle);
  gl.uniform2f(U.uRipple, rippleR, still ? 0 : rippleOn * T.needle);
  gl.uniform1f(U.uTouch, T.needle);
  gl.uniform1f(U.uHz, g.hz);
  gl.uniform2f(U.uCue, CUES[T.cue] ?? 1, T.cueAmt);
  gl.uniform2f(U.uOuter, g.out, g.top);
  gl.uniform2f(U.uGlintAmt, T.soft, T.glintAmt);
  gl.uniform2f(U.uChroma, CHROMA[T.chroma] ?? 0, T.chromaAmt);
  gl.uniform1f(U.uSpeck, SPECKS[T.speck] ?? 0);
  gl.uniform1f(U.uTint, T.tint);
  gl.uniform4f(U.uWarp, WARPS[T.warp] ?? 0, T.warpAmt, g.up, g.half);
  gl.uniform3f(U.uLens, ...g.lens);
  gl.uniform1f(U.uHoverMode, mode);
  gl.uniform3f(U.uPtr, sp ? hover.sx : hover.x, sp ? hover.sy : hover.y, hover.speed);
  gl.uniform4fv(U.uPts, pts.flat());
  gl.uniform1f(U.uTime, clock);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function draw(now) {
  if (reduced.matches || !visible) {
    running = false;
    // Stopping: the last frame left showing is a still one, with nothing
    // passing lit in it.
    frame(now, true);
    return;
  }
  // At rest (no pointer light, no needle) the record only turns slowly, so
  // 30 frames a second is plenty; the pointer's light gets the full 60.
  const busy = hover.on > 0.01 || needle.on || ripple.on;
  if (busy || now - last >= 1000 / 30 - 2) frame(now, false);
  requestAnimationFrame(draw);
}

// The page's mask fades the canvas's top 230px out (style.css); lifted, the
// record shows nearer the top. The rest of the mask is as style.css has it.
function topFade() {
  if (!T.mask) { canvas.style.removeProperty('--fx-mask'); return; }
  const v = T.mask;
  const full = Math.round(230 * (1 - 0.8 * v));
  canvas.style.setProperty('--fx-mask', `linear-gradient(to bottom, rgb(0 0 0 / ${(0.75 * v).toFixed(2)}) 0, #000 ${full}px, #000 var(--fx-top), rgb(0 0 0 / 0.75) var(--fx-mid), rgb(0 0 0 / 0.75) calc(var(--fx-end) - 110px), transparent var(--fx-end))`);
}

// Tune. The style comes first; then the rest in folders, each control only
// in the panel while it does something to the style picked (or to what's
// picked above it): the spin cue's, glints' and dust's controls, the lamp
// colour and the render resolution belong to the current look; everything
// else works in every style, each drawing it its own way (see LOOKS and
// hoverField). Labels are what the panel saves values under, so they stay.
const tune = window.tune;
const again = () => { geo = null; measured = 0; wake(); };
const redraw = (k) => (v) => { T[k] = v; if (prog) wake(); };
const reshape = (k) => (v) => { T[k] = v; if (prog) again(); };
const panel = () => tune?.refresh?.('Hero record');
// ...and the panel follows it.
const thenPanel = (f) => (v) => { f(v); panel(); };
const cur = () => T.look === 'current';
// ?record=orbit (or any style's name) in the address picks one over the
// panel, for testing.
const forced = new URLSearchParams(location.search).get('record');
tune?.select({ label: 'Hero record: style', value: T.look, options: STYLE_LIST.map(([k, t]) => [k, t]),
  onInput: (v) => { T.look = forced in LOOK ? forced : v; if (prog) again(); panel(); } });

const look = { folder: 'Look' };
tune?.select({ ...look, label: 'Hero record: what shows the spin', value: T.cue, show: cur, onInput: thenPanel((v) => { T.cue = v; if (prog) wake(); }), options: [['dust', 'Dust specks'], ['glints', 'Glints'], ['warp', 'Pressing warp'], ['spokes', 'Spokes'], ['soft', 'Soft glints (as among the dust)']] });
tune?.slider({ ...look, label: 'Hero record: spin cue strength', min: 0, max: 3, step: 0.05, value: T.cueAmt, onInput: redraw('cueAmt') });
tune?.select({ ...look, label: 'Hero record: speck style', value: T.speck, show: () => cur() && T.cue === 'dust', onInput: redraw('speck'), options: [['hyphen', 'Dashes (first)'], ['motes', 'Dust motes'], ['scratches', 'Hairline scratches'], ['scuffs', 'Scuffs'], ['sparkle', 'Sparkle'], ['lint', 'Lint'], ['smudge', 'Smudges']] });
tune?.slider({ ...look, label: 'Hero record: soft glints strength', min: 0, max: 3, step: 0.05, value: T.soft, show: cur, onInput: redraw('soft') });
tune?.slider({ ...look, label: 'Hero record: glints mode strength', min: 0, max: 3, step: 0.05, value: T.glintAmt, show: () => cur() && T.cue === 'glints', onInput: redraw('glintAmt') });
tune?.select({ ...look, label: 'Hero record: glint colour', value: T.chroma, show: cur, onInput: thenPanel(redraw('chroma')), options: [['none', 'None'], ['film', 'Thin film (oil slick)'], ['prism', 'Prism split'], ['lamp', 'Lamp (blue / orange)'], ['grating', 'Diffraction rainbow'], ['pearl', 'Pearl'], ['fringe', 'Lens fringe']] });
tune?.slider({ ...look, label: 'Hero record: glint colour amount', min: 0, max: 1, step: 0.05, value: T.chromaAmt, show: () => cur() && T.chroma !== 'none', onInput: redraw('chromaAmt') });
tune?.slider({ ...look, label: 'Hero record: lamp colour', min: 0, max: 1, step: 0.05, value: T.tint, show: cur, onInput: redraw('tint') });
tune?.slider({ ...look, label: 'Hero record: render resolution', min: 0.3, max: 1, step: 0.05, value: T.res, show: () => !STYLE[T.look]?.crisp, onInput: reshape('res') });

tune?.slider({ folder: 'Motion', label: 'Hero record: spin speed', min: 0, max: 3, step: 0.1, value: T.life, onInput: redraw('life') });

const touchF = { folder: 'Hover & needle' };
tune?.select({ ...touchF, label: 'Hero record: hover style', value: T.hover, onInput: redraw('hover'),
  // The same six everywhere; outside the current look, named for what
  // they do in every style.
  options: () => (cur()
    ? [['arc', 'Arc (first)'], ['lamp', 'Lamp'], ['stylus', 'Stylus'], ['prism', 'Prism'], ['spot', 'Spotlight'], ['ripples', 'Colour ripples']]
    : [['arc', 'Arc: along the groove'], ['lamp', 'Beam: across the grooves'], ['stylus', 'Stylus: tip and trail'], ['prism', 'Split: two arcs'], ['spot', 'Spot: disc and ring'], ['ripples', 'Ripples']]) });
tune?.slider({ ...touchF, label: 'Hero record: needle and hover strength', min: 0, max: 2, step: 0.05, value: T.needle, onInput: redraw('needle') });
tune?.slider({ ...touchF, label: 'Hero record: hover fades after still', min: 0.3, max: 10, step: 0.1, value: T.still, unit: 's', onInput: redraw('still') });

const lay = { folder: 'Layout' };
tune?.slider({ ...lay, label: 'Hero record: lower by', min: -300, max: 400, step: 4, value: T.drop, unit: 'px', onInput: reshape('drop') });
tune?.slider({ ...lay, label: 'Hero record: perspective', min: 0.3, max: 3, step: 0.05, value: T.persp, onInput: reshape('persp') });
tune?.slider({ ...lay, label: 'Hero record: rings all round', min: 0.7, max: 2, step: 0.05, value: T.size, onInput: reshape('size') });
tune?.slider({ ...lay, label: 'Hero record: more rings up top', min: 0, max: 1, step: 0.05, value: T.up, onInput: reshape('up') });
tune?.slider({ ...lay, label: 'Hero record: show to the top (mask)', min: 0, max: 1, step: 0.05, value: T.mask, onInput: reshape('mask') });
tune?.select({ ...lay, label: 'Hero record: top warp', value: T.warp, onInput: thenPanel(reshape('warp')), options: [['none', 'None'], ['mirror', 'Mirror the sweep'], ['barrel', 'Barrel'], ['lens', 'Lens bulge'], ['flip', 'Flipped perspective']] });
tune?.slider({ ...lay, label: 'Hero record: top warp strength', min: 0, max: 1, step: 0.05, value: T.warpAmt, show: () => T.warp !== 'none', onInput: reshape('warpAmt') });
if (forced in LOOK) T.look = forced;

try {
  if (init()) {
    // Nothing to draw once the hero's words and its screen are both
    // scrolled out of view (the canvas itself runs on far below them).
    const seen = new Map();
    const io = new IntersectionObserver((list) => {
      for (const e of list) seen.set(e.target, e.isIntersecting);
      visible = [...seen.values()].some(Boolean);
      wake();
    });
    for (const el of [document.querySelector('.hero'), screen]) if (el) io.observe(el);
    reduced.addEventListener('change', wake);
    addEventListener('resize', () => reduced.matches && wake());
    wake();
  }
} catch (err) {
  console.warn('hero-fx:', err);
}
export { T, again as relayout };
