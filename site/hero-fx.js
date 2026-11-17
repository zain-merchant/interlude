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
// pointer stops, so nothing ever looks selected.
const T = {
  drop: 8, needle: 0.8, life: 0.1, persp: 0.85, cue: 'dust', cueAmt: 1, res: 0.85,
  soft: 1, glintAmt: 1, chroma: 'none', chromaAmt: 0.6, speck: 'hyphen',
  size: 1, up: 0, mask: 0, warp: 'none', warpAmt: 0.5, tint: 0.4, hover: 'arc', still: 1.2,
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
const FRAG = `
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
  for (const n of ['uSize', 'uDpr', 'uCentre', 'uGeo', 'uHoles', 'uHoleCount', 'uHoleR', 'uSpan', 'uSpin', 'uFacing', 'uStyle', 'uSheen', 'uGlint', 'uHover', 'uSwell', 'uNeedle', 'uRipple', 'uTouch', 'uHz', 'uCue', 'uTracks', 'uTrackCount',
    'uOuter', 'uGlintAmt', 'uChroma', 'uSpeck', 'uTint', 'uWarp', 'uLens', 'uHoverMode', 'uPtr', 'uPts', 'uTime']) U[n] = gl.getUniformLocation(prog, n);
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
  const dpr = Math.min(2, devicePixelRatio || 1) * T.res;
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

const tune = window.tune;
const again = () => { geo = null; measured = 0; wake(); };
tune?.slider({ id: 'rec-drop', label: 'Hero record: lower by', min: -300, max: 400, step: 4, value: T.drop, unit: 'px', onInput: (v) => { T.drop = v; if (prog) again(); } });
tune?.slider({ id: 'rec-needle', label: 'Hero record: needle and hover strength', min: 0, max: 2, step: 0.05, value: T.needle, onInput: (v) => { T.needle = v; if (prog) wake(); } });
tune?.slider({ id: 'rec-life', label: 'Hero record: spin speed', min: 0, max: 3, step: 0.1, value: T.life, onInput: (v) => { T.life = v; if (prog) wake(); } });
tune?.slider({ id: 'rec-persp', label: 'Hero record: perspective', min: 0.3, max: 3, step: 0.05, value: T.persp, onInput: (v) => { T.persp = v; if (prog) again(); } });
tune?.select({ id: 'rec-cue', label: 'Hero record: what shows the spin', value: T.cue, onInput: (v) => { T.cue = v; if (prog) wake(); }, options: [['dust', 'Dust specks'], ['glints', 'Glints'], ['warp', 'Pressing warp'], ['spokes', 'Spokes'], ['soft', 'Soft glints (as among the dust)']] });
tune?.slider({ id: 'rec-res', label: 'Hero record: render resolution', min: 0.3, max: 1, step: 0.05, value: T.res, onInput: (v) => { T.res = v; if (prog) again(); } });
tune?.slider({ id: 'rec-cue-amt', label: 'Hero record: spin cue strength', min: 0, max: 3, step: 0.05, value: T.cueAmt, onInput: (v) => { T.cueAmt = v; if (prog) wake(); } });
// Newer: the glints, their colour and the dust; the record's reach up the
// page and the bend at its top; its colour; and what the pointer does.
const redraw = (k) => (v) => { T[k] = v; if (prog) wake(); };
const reshape = (k) => (v) => { T[k] = v; if (prog) again(); };
tune?.slider({ label: 'Hero record: soft glints strength', min: 0, max: 3, step: 0.05, value: T.soft, onInput: redraw('soft') });
tune?.slider({ label: 'Hero record: glints mode strength', min: 0, max: 3, step: 0.05, value: T.glintAmt, onInput: redraw('glintAmt') });
tune?.select({ label: 'Hero record: glint colour', value: T.chroma, onInput: redraw('chroma'), options: [['none', 'None'], ['film', 'Thin film (oil slick)'], ['prism', 'Prism split'], ['lamp', 'Lamp (blue / orange)'], ['grating', 'Diffraction rainbow'], ['pearl', 'Pearl'], ['fringe', 'Lens fringe']] });
tune?.slider({ label: 'Hero record: glint colour amount', min: 0, max: 1, step: 0.05, value: T.chromaAmt, onInput: redraw('chromaAmt') });
tune?.select({ label: 'Hero record: speck style', value: T.speck, onInput: redraw('speck'), options: [['hyphen', 'Dashes (first)'], ['motes', 'Dust motes'], ['scratches', 'Hairline scratches'], ['scuffs', 'Scuffs'], ['sparkle', 'Sparkle'], ['lint', 'Lint'], ['smudge', 'Smudges']] });
tune?.slider({ label: 'Hero record: rings all round', min: 0.7, max: 2, step: 0.05, value: T.size, onInput: reshape('size') });
tune?.slider({ label: 'Hero record: more rings up top', min: 0, max: 1, step: 0.05, value: T.up, onInput: reshape('up') });
tune?.slider({ label: 'Hero record: show to the top (mask)', min: 0, max: 1, step: 0.05, value: T.mask, onInput: reshape('mask') });
tune?.select({ label: 'Hero record: top warp', value: T.warp, onInput: reshape('warp'), options: [['none', 'None'], ['mirror', 'Mirror the sweep'], ['barrel', 'Barrel'], ['lens', 'Lens bulge'], ['flip', 'Flipped perspective']] });
tune?.slider({ label: 'Hero record: top warp strength', min: 0, max: 1, step: 0.05, value: T.warpAmt, onInput: reshape('warpAmt') });
tune?.slider({ label: 'Hero record: lamp colour', min: 0, max: 1, step: 0.05, value: T.tint, onInput: redraw('tint') });
tune?.select({ label: 'Hero record: hover style', value: T.hover, onInput: redraw('hover'), options: [['arc', 'Arc (first)'], ['lamp', 'Lamp'], ['stylus', 'Stylus'], ['prism', 'Prism'], ['spot', 'Spotlight'], ['ripples', 'Colour ripples']] });
tune?.slider({ label: 'Hero record: hover fades after still', min: 0.3, max: 10, step: 0.1, value: T.still, unit: 's', onInput: redraw('still') });

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
