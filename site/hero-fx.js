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
  // Tipped toward the pointer (the tilt hover), as the shader's discQ.
  const [tx, ty, sx, sy] = tiltNow;
  if (tx || ty || sx || sy) {
    const w = Math.max(0.3, 1 + tx * (x - cx) + ty * (y - cy));
    x = cx + (x - cx) / w - sx;
    y = cy + (y - cy) / w - sy;
  }
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
// cue: what else shows it turning (a circle spinning looks still on its
// own; the glints always go round), and cueAmt how much. speck: what the
// dust is. The glints' own controls are in the Glints folder (see GLINTS
// there): glints (brightness), gSize, gSharp, gCount, gRide, chroma (their
// colour, see CHROMA), gSpread, chromaAmt, gHue.
// size: the whole record, bigger all round; up: more rings above only (the
// top half drawn as if seen from further back, the bottom left as it is).
// fadeAt, fadeLen: the fade at the very top (see topFade).
// warp/warpAmt: other ways to bend the top (see WARPS). tint: the lamp's
// blue and orange in the sheen, as on the footer's word. hover: what the
// pointer does (see HOVERS); still: it fades this many seconds after the
// pointer stops, so nothing ever looks selected. look: the style it's
// drawn in (see LOOK). shape: the shape preset last picked (see SHAPES),
// or 'custom'. The rest set the vinyl style (see VINYLS, which has dark
// vinyl's values and the presets'): vinyl, finish: its colour (any CSS
// colour), 'solid' or 'chromatic'; body: how much that colour shows in it
// (0: the page's black); through: the lamp's light coming through it
// evenly; cone, wedge: its light in the lamp's cone, and the grooves there
// lit up pale (the cone's shape is in the Lamp folder, see LAMP); lineTint:
// the grooves in its colour; flecks: flecks inside it. pitch, pitchOut:
// groove spacing at the centre and how far it opens out by the rim (record
// px); lineW: line width; press: the pressing's warp; contrast, satin,
// level, sheen: the grooves' contrast, the songs' bands, their brightness
// and the fixed sheen, each times its usual; songLen: how long each song
// is (so how many there are).
const T = {
  fps: 30, // frames a second at rest
  busyFps: 30, // and while the pointer's light, the needle or a twist moves it (30: on the app's frames; 60: smoother)
  atRest: 'relit', // frames relit from a layer baked once (see RELIT), turned on from a full one at rest (see REPROJECT), or each worked out in full ('full')
  drop: 108, needle: 0.8, life: 0.2, persp: 0.85, cue: 'dust', cueAmt: 1, res: 0.85,
  speck: 'hyphen',
  twistRate: 12, twistMax: 20, twistEase: 0.6, // scrolling twists it: degrees per 1000px, at most, settling in s
  dragTilt: 0.35, // how far dragging on the record tips it (0: not at all)
  dust: 0, away: 1, awayB: 1, dustSize: 1, dustSoft: 0.5, dustGlow: 1, dustGlowSize: 1, dustBright: 1, dustLight: 1, dustVariety: 0.6, dustFibres: 0.5, // natural dust, on top of the rest (see uNat)
  bfStart: -110, bfEnd: 0, bfCurve: 'linear', bfShape: 'line', bfWidth: 0.6, bfCentre: -400, bfMid: 0.75,
  size: 1, up: 0, reach: 1, warp: 'none', warpAmt: 0.5, tint: 0, hover: 'arc', still: 1.2,
  look: 'vinyl', shape: 'custom', vinylPreset: 'dark',
  vinyl: '#1c1c20', finish: 'solid', body: 0, through: 0, lineTint: 0, flecks: 0,
  pitch: 6, pitchOut: 8, lineW: 1, press: 1, contrast: 1, satin: 1, level: 1, sheen: 1, songLen: 1,
  // The glints (see GLINTS below for what each does).
  glints: 1, gSize: 1, gSharp: 1, gCount: 3, gRide: 3, chroma: 'none', gSpread: 1, chromaAmt: 0.6, gHue: 0,
  // The lamp's cone (see LAMP below).
  cone: 0, wedge: 0, coneW: 36.8, coneSoft: 3.2, coneDir: 0, coneReach: 1, coneTint: '#ffffff', cones: 'two', lampMove: 'drift',
  // The pointer moving the light (hover styles light, cone, angle, colour,
  // tilt, all): how far each goes, and how long it takes to follow.
  hLight: 0.7, hCone: 0.8, hAngle: 0.6, hHue: 0.5, hTilt: 0.5, hFollow: 0.6,
  // The fade at the very top: fully shown below fadeAt (CSS px from the
  // canvas's top), fading to nothing over fadeLen above it.
  fadeAt: 230, fadeLen: 230,
};
const CUES = { glints: 0, dust: 1, warp: 2, spokes: 3, soft: 4 };
const CHROMA = { none: 0, film: 1, prism: 2, lamp: 3, grating: 4, pearl: 5, fringe: 6 };
const SPECKS = { hyphen: 0, motes: 1, scratches: 2, scuffs: 3, sparkle: 4, lint: 5, smudge: 6 };
const WARPS = { none: 0, mirror: 1, barrel: 2, lens: 3, flip: 4 };
const HOVERS = { arc: 0, lamp: 1, prism: 2, spectrum: 3, litarc: 4, glass: 5, glassprism: 6, light: 7, cone: 8, angle: 9, colour: 10, tilt: 11, all: 12 };
// The hovers that move the record's own light rather than drawing a light of their own.
const MOVERS = { light: ['light'], cone: ['cone'], angle: ['angle'], colour: ['colour'], tilt: ['tilt'], all: ['light', 'angle', 'colour', 'tilt'] };
// How each hover follows the pointer: a spring's stiffness and damping (as
// the footer's do). Under 1 it overshoots a touch. (The arc eases instead.)
const SPRING = { lamp: [42, 0.9], prism: [90, 1], spectrum: [90, 1], litarc: [90, 1], glass: [70, 0.9], glassprism: [70, 0.9] };
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
// Scrolling twists the record a little: down twists it on (clockwise, the
// way it plays), back up twists it back. The twist follows how far down
// the page is (so a fast scroll or a long one never sets it spinning),
// capped, and eased: twist eases toward twistAim on a critically damped
// spring.
let twist = 0;
let twistV = 0;
let drift = 0;
const needle = { on: false, r: 0, born: 0 };
// How far the glints have gone round (see T.gRide), and the lamp (when it
// turns with the record).
let glintSpin = 0;
let lampTurn = 0;
// The tilt toward the pointer this frame (toRecord uses it too).
let tiltNow = [0, 0, 0, 0];
// Dragging on the record tips it a little in 3D, the way it's dragged, and
// it springs back level when let go: drag.x, drag.y ease to drag.tx, ty
// (each -1 to 1 times T.dragTilt) on a soft spring.
const drag = { on: false, x0: 0, y0: 0, tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 };
// The hovers that move the record's own light (MOVERS): what the pointer
// asks of each now, and where each is on its spring (critically damped, so
// it glides there and back with no bounce). light, cone: radians the lamp
// and its cone swing; phase: radians the glints slide along their grooves;
// spread: their colours fanned wider or narrower (a share); hue: radians
// round the colour wheel; tx, ty: the tilt, -1..1 across and down.
const FX_KEYS = ['light', 'cone', 'phase', 'spread', 'hue', 'tx', 'ty'];
const fx = { want: {}, at: {}, v: {}, moving: false };
for (const k of FX_KEYS) fx.want[k] = fx.at[k] = fx.v[k] = 0;
const ripple = { on: false, r: 0, born: 0 };
// The pointer, in record terms (radius and angle), eased so the light on
// the grooves glides after it rather than jumping.
// sx, sy: where the newer hover styles are, following the pointer on a
// spring (vx, vy); moved: when the pointer last moved (ms).
const hover = { r: 0, a: 0, on: 0, x: -1e4, y: -1e4, sx: 0, sy: 0, vx: 0, vy: 0, speed: 0, moved: 0 };
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
// point on the page lies on the disc) is shared; MAIN is the vinyl style (dark vinyl and its other presets),
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
uniform vec4 uCover;     // where the app's screen always hides the record (CSS px)
uniform float uHoleR;     // the buttons' corner radius
uniform vec2 uSpan;      // inner radius, and the radius the groove spacing is set by
uniform vec2 uOuter;     // outer radius: round most of it, and up top
uniform float uSpin;
uniform float uFacing;
uniform vec3 uStyle;     // lines, satin, level
uniform float uSheen;
uniform float uGlint;
uniform vec2 uGlintAmt;  // the glints' brightness (y unused)
uniform vec2 uChroma;    // colour in the glints (see CHROMA), and how much
uniform vec4 uGlintShape; // the glints' size, sharpness, how many a turn, and how far they've turned
uniform float uGlintSpread; // how far the glints' colours fan apart
uniform mat3 uHueM;      // the glints' colours turned round the colour wheel
uniform vec4 uTilt;      // the record tipped toward the pointer: its tilt (per CSS px), and its shift (CSS px)
uniform vec4 uCone;      // the lamp's cone: where it points, its width's scale, its edges (on cos^4), how far in it reaches
uniform vec4 uConeTint;  // the cone's colour, and 1 for one cone (0: two, opposite)
uniform vec2 uConeEdge;  // the cone's edges, on cos^4 of the angle
uniform float uConeLight; // the lamp's light through the vinyl in the cone
uniform float uSpeck;    // what the dust is (see SPECKS)
uniform float uAway;     // colour amount away from the lamp, relative to where it faces (1: the same)
uniform float uAwayB;    // brightness away from the lamp, the same way
uniform vec2 uNat;       // natural dust (x, 0 to 1; on top of whatever shows the spin)
uniform vec4 uNat2;      // dust size, softness, glow, glow size
uniform vec4 uNat3;      // dust brightness, how much it needs the light, size variety, fibres
uniform float uTint;     // the lamp's blue and orange in the sheen
uniform vec4 uWarp;      // how the top is bent (see WARPS), how much, more rings up top, half the width
uniform vec3 uLens;      // the lens bulge: centre and radius, CSS px
uniform vec3 uHover;     // pointer radius, angle, strength
uniform float uHoverMode;
uniform vec3 uPtr;       // the hover's own place (on its spring), CSS px, and its speed
uniform vec4 uVinyl;     // the vinyl's colour, and how much its body shows (0: the page's black)
uniform float uVinylFin; // the vinyl's colour: 0 solid, 1 chromatic
uniform vec4 uThru;      // the vinyl: light through it, lamp wedges, grooves in its colour, flecks
uniform vec4 uGroove;    // groove spacing at the centre, how far it opens out by the rim, line width, pressing warp
uniform float uSwell;
uniform vec2 uNeedle;    // radius, strength
uniform vec2 uRipple;    // radius, strength
uniform float uTouch;    // how strong the pointer's light is
uniform float uHz;       // the horizon, CSS px above the canvas
uniform vec2 uCue;       // what shows the turn, and how much
uniform vec2 uTracks[${MAX_TRACKS}];
uniform float uTrackCount;
uniform float uRaw;      // 1: no buttons' holes and no dither (a frame kept to be turned, see REPROJECT)
uniform vec2 uOrigin;    // the canvas's corner in what's drawn to (device px; 0 but for the kept frame)

const float PI = 3.14159265;
const vec3 BASE = vec3(0.86, 0.89, 0.95);
// The footer's colours.
const vec3 ORANGE = vec3(1.0, 0.608, 0.271);  // #ff9b45
const vec3 BLUE = vec3(0.239, 0.706, 1.0);    // #3db4ff
const vec3 SAND = vec3(0.941, 0.863, 0.753);  // #f0dcc0

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// A steadier hash for big cell numbers (no sin, so no banding far out).
float hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hue(float t) { return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67))); }
float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }
float near(float v, float k) { return step(abs(v - k), 0.5); }
float wrap(float x) { return atan(sin(x), cos(x)); }

// A point on the page onto the disc, in perspective, with the top's bends
// (toRecord in the script does the same sum).
vec2 discQ(vec2 px) {
  // Tipped toward the pointer (a hover): the page seen through a tilted
  // pane, so one side comes nearer and the other falls away (toRecord
  // does the same).
#ifdef TILT
  vec2 dt = px - uCentre;
  px = uCentre + dt / max(0.3, 1.0 + dot(uTilt.xy, dt)) - uTilt.zw;
#endif
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

// Glass (a hover): a lens this wide (CSS px) resting on the record, and how
// much it magnifies the grooves under its middle.
const float GLASS = 72.0;
const float GLASS_M = 0.16;
// How much of the glass lies over a point on the page (0 with another hover).
float glassAt(vec2 px) {
  if (uHover.z <= 0.0 || uHoverMode < 4.5) return 0.0;
  vec2 d = px - uPtr.xy;
  return uHover.z * exp(-dot(d, d) / (GLASS * GLASS));
}

// A glint's shape, x2 its squared distance from its middle (in its own
// units): soft (sharpness under 1, long tails) to crisp (over 1, a flat
// top with a quicker edge).
// (Compiled in only when it's not 1, the plain bell curve: see variant.)
#ifdef SHARP
float glintProf(float x2) { return exp(-pow(max(x2, 0.0), uGlintShape.y)); }
vec3 glintProf3(vec3 x2) { return exp(-pow(max(x2, vec3(0.0)), vec3(uGlintShape.y))); }
#else
float glintProf(float x2) { return exp(-x2); }
vec3 glintProf3(vec3 x2) { return exp(-x2); }
#endif
// The glints' colours turned round the wheel (only compiled in when they are).
#ifdef HUE
#define HUED(v) (uHueM * (v))
#else
#define HUED(v) (v)
#endif

// The glints' colour (see CHROMA). arc, du: where in the glint, along it
// and across it; gv comes in as its shape and some colours split it per
// channel; tv is its tint. sp (uGlintSpread) is how far the colours fan
// apart across the glint, the same for every palette.
void glintColour(float arc, float du, float a, float r, float inSong, inout vec3 gv, out vec3 tv) {
  tv = vec3(1.0);
  float sp = uGlintSpread;
  // (Only the palette picked is compiled in: PAL, see variant and CHROMA.)
#if PAL == 1
  // Thin film, like oil on water: the hue shifts with the angle the
  // light meets it at and across the glint.
  tv = mix(vec3(1.0), hue(0.55 * cos(a - uFacing) + r / 650.0 + 0.12 * du * sp), 0.8);
#elif PAL == 2
  // Prism: the glint split along its length, red leading, blue trailing.
  vec3 sh = vec3(0.55, 0.0, -0.55) * sp;
  vec3 x = arc + sh;
  gv = mix(gv, glintProf3(x * x + du * du) * inSong, uChroma.y);
#elif PAL == 3
  // The footer's lamp: a white core with a cool and a warm side.
  float side = clamp(arc * 1.2 * sp, -1.0, 1.0);
  tv = mix(mix(BLUE, ORANGE, 0.5 + 0.5 * side), vec3(1.0), exp(-arc * arc * 2.5 * sp * sp) * 0.45);
#elif PAL == 4
  // A diffraction grating's rainbow, as on a CD: it runs along the
  // glint and shifts as the glint turns through the light.
  tv = hue((0.28 * arc + 0.18 * du) * sp + 0.9 * (a - uFacing));
#elif PAL == 5
  // Pearl: soft pink, mint and lilac drifting over each other.
  tv = mix(vec3(1.0, 0.74, 0.9), vec3(0.7, 1.0, 0.9), 0.5 + 0.5 * sin(3.0 * du * sp + 2.0 * a));
  tv = mix(tv, vec3(0.8, 0.76, 1.0), 0.5 - 0.5 * cos(arc * 1.4 * sp));
#elif PAL == 6
  // Fringe: as through a lens that doesn't quite focus every colour,
  // red spreads wider and softer, blue stays tight.
  vec3 sc = 1.0 + (vec3(0.6, 1.0, 1.5) - 1.0) * sp;
  vec3 xa = arc * sc;
  vec3 xu = du * sc;
  gv = mix(gv, glintProf3(xa * xa + xu * xu) * inSong * vec3(0.95, 1.0, 1.15), uChroma.y);
#endif
  tv /= max(maxc(tv), 1e-3);
}
// The glints' light at a place in one (along it, across it), in their
// colour: what the pointer's lights are painted with too, so they always
// match the glints.
vec3 paint(float x, float y, float a, float r) {
  vec3 gv = vec3(glintProf(x * x + y * y));
  vec3 tv;
  glintColour(x, y, a, r, 1.0, gv, tv);
  return max(HUED(gv * mix(BASE, tv * 0.95, uChroma.y * step(0.5, uChroma.x))), 0.0);
}
// Natural dust lying on the disc and turning with it, on top of whatever
// shows the spin, as it really sits on a record: mostly specks too small
// to make out, a few larger, none quite round, some in little clumps, the
// odd fibre; each catching the lamp as it turns through the light.
// uNat.x: how much; uNat2: size, softness, glow, glow size; uNat3:
// brightness, how much it needs the light, size variety, fibres. near: 1
// where any speck lies in the cells looked at (onlyNear: that alone).
// speckAt: one speck (its cell id, and h its first hash), what it adds at q
// (shared by natDust and the dust drawn as sprites, see RELIT).
float speckAt(vec2 id, float h, vec2 q, vec2 dqx, vec2 dqy, float det) {
      float CR = 9.0;
      float CT = 9.0;
      float rc = (id.x + 0.5) * CR;
      float row = id.x;
      float h1 = hash2(id * 1.3 + 2.9);
      float h2 = hash2(id * 0.7 + 6.1);
      float h3 = hash2(id * 1.9 + 8.3);
      float rs = (row + 0.2 + 0.6 * h1) * CR;
      float ang = (id.y + 0.2 + 0.6 * h2) * CT / rc + uSpin;
      vec2 rh = vec2(cos(ang), sin(ang));
      vec2 D = q - rs * rh;
      vec2 v = vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr);
      float ls = 0.5 + 0.5 * cos(2.0 * (ang - uFacing));
      ls *= ls;
      // Size: most tiny, a few larger, how unevenly set by the variety;
      // all scaled by the size.
      float size = (0.25 + 2.3 * pow(h3, mix(1.2, 5.0, uNat3.z))) * uNat2.x;
      float phi = h1 * PI;
      vec2 dd = vec2(cos(phi), sin(phi));
      float asp = 1.0 + 1.6 * h2 * h2;
      vec2 w = vec2(dot(v, dd) / asp, dot(v, vec2(-dd.y, dd.x)));
      float d2 = dot(w, w);
      float s2 = max(size * size, 0.0025);
      // Its core (sharper or softer), and its glow round it.
      float spec = mix(exp(-d2 / s2), exp(-d2 / (s2 * 2.6)) * 0.75, uNat2.y)
                 + uNat2.z * 0.35 * exp(-d2 / (s2 * uNat2.w * uNat2.w * 9.0));
      // A clump: a second speck beside it.
      if (fract(h * 37.0) > 0.68) {
        vec2 o = (vec2(h2, h1) - 0.5) * size * 2.6;
        vec2 w2 = v - o;
        spec += 0.55 * exp(-dot(w2, w2) / (s2 * 0.45));
      }
      // The odd fibre: thin, gently curved, lying any which way.
      if (fract(h * 53.0) > 1.0 - 0.16 * uNat3.w) {
        float ua = dot(v, dd);
        float wa = dot(v, vec2(-dd.y, dd.x)) - (h3 - 0.5) * 0.12 * ua * ua;
        float len = (4.0 + 12.0 * h2) * max(0.4, uNat2.x);
        spec += 0.7 * exp(-wa * wa / (0.22 * max(0.2, uNat2.x))) * (1.0 - smoothstep(0.6 * len, len, abs(ua)));
      }
      // Brightness on a steep curve: most dust faint, the odd speck
      // catching the light properly.
      float bright = 0.12 + 0.88 * pow(fract(h * 61.0), 2.5);
      return spec * bright * mix(1.0, 0.06 + 0.94 * ls, uNat3.y);
}
float natDust(vec2 q, vec2 dqx, vec2 dqy, float r, float b, bool onlyNear, out float near) {
  near = 0.0;
  float det = dqx.x * dqy.y - dqy.x * dqx.y;
  float nat = 0.0;
  float CR = 9.0;
  float CT = 9.0;
  float thr = 1.0 - 0.06 * uNat.x;
  float th0 = mod(b, 2.0 * PI);
  float row0 = floor(r / CR);
  for (int j = -1; j <= 1; j++) {
    float row = row0 + float(j);
    float rc = (row + 0.5) * CR;
    if (rc <= 0.0) continue;
    float col0 = floor(th0 * rc / CT);
    for (int i = -1; i <= 1; i++) {
      vec2 id = vec2(row, col0 + float(i));
      float h = hash2(id + 31.0);
      if (h < thr) continue;
      near = 1.0;
      if (onlyNear) continue;
      nat += speckAt(id, h, q, dqx, dqy, det);
    }
  }
  return nat;
}
// The lamp's cone round the disc, at angle a: 1 where it points, 0 away.
float coneAt(float a) {
#ifdef CONE
  float xc = uConeTint.w > 0.5 ? wrap(a - uCone.x) : 0.5 * wrap(2.0 * (a - uCone.x));
  float cc = cos(clamp(xc * uCone.y, -0.5 * PI, 0.5 * PI));
  return cc * cc * cc * cc;
#else
  float lampC = 0.5 + 0.5 * cos(2.0 * (a - uCone.x));
  return lampC * lampC;
#endif
}
// What a unit of dust's light adds at a pixel (colour; alpha), as MAIN
// adds it: times the lift, the base colour (the lamp's tint and the
// vinyl's, see MAIN) and the cone's groove boost. Only the dust drawn as
// sprites (RELIT) uses it; MAIN works the same out inline, so the two must
// stay in step.
vec4 dustMul(float a, float b, float r, float R, float edge, float lines, float inSong) {
  float lift = uStyle.z * edge * (1.0 + 0.08 * uSwell);
  vec3 base = BASE;
  if (uTint > 0.0) {
    float side = sin(a - uFacing);
    vec3 c = side < 0.0 ? BLUE : ORANGE;
    base = mix(BASE, 0.95 * c, clamp(0.85 * uTint * smoothstep(0.1, 0.9, abs(side)), 0.0, 1.0));
  }
  float vboost = 1.0;
  if (uVinyl.w + uThru.x + uThru.y + uThru.z + uThru.w + uConeLight > 0.0) {
    vec3 V = uVinyl.rgb;
    float vm = maxc(V);
    vec3 Vn = mix(vec3(1.0), V / max(vm, 1e-3), smoothstep(0.0, 0.03, vm));
    if (uVinylFin > 0.5) {
      Vn = hue(0.5 * cos(a - uFacing) + r / 900.0 + 0.12 * sin(2.0 * b + r / 260.0));
      Vn /= maxc(Vn);
    }
    vec3 HI = mix(Vn, vec3(1.0), uVinylFin > 0.5 ? 0.55 : 0.65);
    float lampC = coneAt(a);
#ifdef CONE
    float rf = smoothstep(R * (1.0 - uCone.w) - 0.3 * R, R * (1.0 - uCone.w), r);
#else
    float rf = 1.0;
#endif
    float inWedge = smoothstep(uConeEdge.x, uConeEdge.y, lampC) * rf;
    float wedge = uThru.y * inWedge;
    base = mix(base, mix(Vn, vec3(1.0), 0.15), uThru.z);
    base = mix(base, HI * uConeTint.rgb, min(wedge, 1.0));
    vboost = 1.0 + 2.5 * wedge * max(lines, 0.0) * inSong;
  }
  return vec4(base * lift * vboost, lift * vboost);
}
`;
const MAIN = `
// (BAKE and RELIT: the record drawn from a layer that never moves, see
// RELIT in the script. BAKE works out, once, what depends only on where a
// pixel lies on the disc (the grooves, the songs, the lead-in); RELIT, each
// frame, reads that back and lights it.)
#ifdef RELIT
uniform sampler2D uSt0;  // the baked layer: L so far, the grooves' lines, in a song, where in it
uniform sampler2D uSt1;  // and: which song, the pressing warp's two counts (k1 + 32 k2), the disc's edge, the rim's lead-in
uniform sampler2D uConeT; // the cone round the disc (CONE_FS)
uniform sampler2D uGlT;   // the glints (GLINT_FS)
#endif
#if defined(KEEP3) || defined(BAKE)
#define OUT0 { gl_FragData[0] = vec4(0.0); gl_FragData[1] = vec4(0.0); return; }
#else
#define OUT0 { gl_FragColor = vec4(0.0); return; }
#endif
void main() {
  // (uOrigin: where the canvas's corner is in what's drawn to, when that's
  // the kept frame with a margin round it, see REPROJECT.)
  vec2 px = vec2(gl_FragCoord.x - uOrigin.x, uSize.y - (gl_FragCoord.y - uOrigin.y)) / uDpr;
  // Behind the app's screen nothing would show: nothing is worked out.
  if (px.x > uCover.x && px.x < uCover.z && px.y > uCover.y && px.y < uCover.w) OUT0
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

  // Glass: the grooves under the lens magnified a touch round the pointer's
  // groove (never folding over); they crowd a little at its edge, where it
  // bends the light most.
  float on = uHover.z;
  vec2 dp = px - uPtr.xy;
  float dist = length(dp);
  float lens = glassAt(px);
  float rr = r - GLASS_M * lens * (r - uHover.x);
  float frr = max(fwidth(rr), 1e-3);

  if (r > max(uOuter.x, uOuter.y) + 2.0 * fr) OUT0
  // The disc, with a crisp edge, and the label hidden behind the screen.
  float edge = smoothstep(uSpan.x, uSpan.x + 40.0, r) * (1.0 - smoothstep(R - fr, R + fr, r));
  // Out at the rim: a smooth lead-in with no grooves, then the raised lip.
  float lead = smoothstep(R - 34.0, R - 26.0, r);

#ifdef RELIT
  vec4 st0 = texture2D(uSt0, gl_FragCoord.xy / uSize);
  vec4 st1 = texture2D(uSt1, gl_FragCoord.xy / uSize);
  float lines = st0.y;
  float inSong = st0.z;
  float u = st0.w;
  float idx = st1.x;
#else
  // Which song this radius is in, and where in it.
  float inSong = 0.0;
  float u = 0.0;
  float idx = 0.0;
  float mid = r;
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    if (float(i) >= uTrackCount) break;
    vec2 t = uTracks[i];
    float soft = max(3.0, fr * 1.5);
    // (The songs run outward in order: none further out can reach here,
    // and one wholly inside it adds nothing.)
    if (r < t.x - soft) break;
    if (r > t.y + soft) continue;
    float w = smoothstep(t.x - soft, t.x + soft, r) * (1.0 - smoothstep(t.y - soft, t.y + soft, r));
    if (w > inSong) { inSong = w; u = clamp((r - t.x) / (t.y - t.x), 0.0, 1.0); idx = float(i); mid = 0.5 * (t.x + t.y); }
  }

  // The grooves: a train of soft lines, built from a few harmonics, each
  // faded out as it nears the pixel size. Its average is always 1.
  // Their spacing, record pixels: uGroove.x near the centre, opening out by
  // uGroove.y more at the rim (6 and 8 for dark vinyl). The far side of the
  // disc (behind the headline) is foreshortened hard; the wider spacing out
  // there keeps its grooves distinct hairlines rather than one band. They
  // stay true circles: spacing only changes with the radius.
  float PITCH = uGroove.x;
  float pb = max(uGroove.y, 1e-3) / uSpan.y;
  float g = log(1.0 + pb * rr / PITCH) / pb;     // grooves counted out from the centre
  float fg = frr / (PITCH + pb * rr);            // grooves per device pixel
  float lines = 0.0;
  // Hairlines stay about a device pixel fine wherever the grooves open out
  // (on the near side), and are soft bands where they crowd (the far side).
  // (uGroove.z: wider lines, as a share of the spacing.)
  float sig = clamp(0.8 * fg, 0.025 * uGroove.z, 0.1 * uGroove.z);
  float norm = 0.0;
  // Harmonic k: its weight in the line's shape, exp(-2 pi^2 sig^2 k^2);
  // how far it's faded by the pixel, exp(-7 fg^2 k^2); and cos(2 pi k g).
  // All three are stepped from one harmonic to the next by multiplying
  // (exp(-a k^2) by a ratio that itself shrinks by exp(-2a) each step; the
  // cosine by the Chebyshev rule), not worked out afresh 16 times over:
  // the same numbers for a fraction of the GPU's work on every pixel.
  float aS = 2.0 * PI * PI * sig * sig;
  float aF = 7.0 * fg * fg;
  float coef = exp(-aS), coefR = exp(-3.0 * aS), coefS = exp(-2.0 * aS);
  float att = exp(-aF), attR = exp(-3.0 * aF), attS = exp(-2.0 * aF);
  float c1 = cos(2.0 * PI * fract(g));
  float cPrev = 1.0, cK = c1;
  // Only as many as this pixel can show: past 0.48 cycles a device pixel a
  // harmonic is fully faded out, and so is every one after it. (Where the
  // grooves are fine on the screen that's only the first two or three.)
  for (int k = 1; k <= 16; k++) {
    float fk = float(k);
    if (fk * fg >= 0.48) break;
    lines += 2.0 * coef * att * (1.0 - smoothstep(0.3, 0.48, fk * fg)) * cK;
    coef *= coefR; coefR *= coefS;
    att *= attR; attR *= attS;
    float cN = 2.0 * c1 * cK - cPrev; cPrev = cK; cK = cN;
  }
  // The average still counts all 16 (norm, each weighing 2 exp(-aS k^2)):
  // summed in closed form (Poisson summation, the same to a millionth)
  // wherever the 16th is too faint to matter, which with the line widths
  // in use is everywhere; one by one otherwise.
  if (aS > 0.047) {
    norm = sqrt(PI / aS) * (1.0 + 2.0 * exp(-PI * PI / aS)) - 1.0;
  } else {
    float w = exp(-aS), wR = exp(-3.0 * aS), wS = exp(-2.0 * aS);
    for (int k = 1; k <= 16; k++) { norm += 2.0 * w; w *= wR; wR *= wS; }
  }
  lines /= norm; // the brightest line sits +1 over the average, which stays 1
#endif

#ifdef RELIT
  float fine = mix(0.7, 1.0 + lines, inSong);
  float L = st0.x;
#else
  // Each song: a soft band, a little louder in its middle, its loudness
  // drifting gently across it, as the music does.
  float loud = 0.82 + 0.18 * sin(PI * u) + 0.07 * sin(r / 18.0 + idx * 1.7) * sin(r / 50.0 + idx);
  float satin = mix(0.62, loud, inSong);
  float fine = mix(0.7, 1.0 + lines, inSong);
  float L = mix(1.0, satin, uStyle.y) * mix(1.0, fine, uStyle.x);
  L = mix(L, 0.5, lead);
#endif
#ifdef BAKE
  gl_FragData[0] = vec4(L, lines, inSong, u);
  gl_FragData[1] = vec4(idx, floor(mid / 140.0) + 3.0 + 32.0 * (floor(mid / 90.0) + 5.0), edge, lead);
  return;
#endif
#ifdef BAKE2
  // (And, 8 bits each: the lip's shape (its light but for the lamp's), the
  // cone's reach, the dither, and 1 where the picture is drawn at all.)
  float dlb = (r - (R - 2.5)) / max(1.3, fr * 1.2);
#ifdef CONE
  float rfb = smoothstep(R * (1.0 - uCone.w) - 0.3 * R, R * (1.0 - uCone.w), r);
#else
  float rfb = 1.0;
#endif
  gl_FragColor = vec4(exp(-dlb * dlb) * mix(0.35, 1.0, clamp((uGeo.x / max(1.0, px.y + uHz) - 1.0) * 4.0, 0.0, 1.0)), rfb, hash(gl_FragCoord.xy), 1.0);
  return;
#endif

  // Light. The fixed sheen: two broad wedges either side of the centre.
  float sheen = uSheen * cos(2.0 * (a - uFacing));
  // The pressing is never perfectly even: a soft warp in it, a few hundred
  // pixels across, curling with the radius, turning with the record.
  float b = a - uSpin;
#ifdef RELIT
  float k2 = floor(st1.y / 32.0);
  float k1 = st1.y - 32.0 * k2;
#else
  float k1 = floor(mid / 140.0) + 3.0;
  float k2 = floor(mid / 90.0) + 5.0;
#endif
  float warp = (0.13 * sin(k1 * b + r / 80.0 + idx * 2.3) + 0.085 * sin(k2 * b - r / 55.0 + idx * 4.1)) * uGroove.w;
  L *= 1.0 + sheen + warp * mix(0.6, 1.0, inSong);

  // Reflections, so it reads as spinning: in each song, a few short runs
  // of groove catch the light more than the rest (a slight ridge in the
  // pressing). They're fixed on the disc and turn with it, brightening as
  // they come round into the lamp's light and fading as they leave, the
  // way highlights slide round a record under a lamp. Kept apart from L
  // (Lg, and Gv its colour) so they can take a colour of their own.
  float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
  lamp *= lamp;
  // (They go round at their own pace, uGlintShape.w: with the disc, or
  // faster so the turn reads even when the disc turns slowly.)
  float seg = 2.0 * PI / uGlintShape.z;
#if defined(RELIT) && (PAL == 0 || PAL == 3)
  // (Read from the glints' table, GLINT_FS: the same shape and colour,
  // laid out by song, where in it, and where between one glint's turn and
  // the next: each end on a column, never read across, so the step where
  // one glint's turn meets the next lands where it does in the full sum.)
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  vec4 gt = texture2D(uGlT, vec2((0.5 + 255.0 * mod(a - uGlintShape.w - ph, seg) / seg) / 256.0, (idx * 64.0 + 0.5 + u * 63.0) / 2048.0));
  float glint = gt.x * inSong;
#else
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  float la = mod(a - uGlintShape.w - ph, seg) - 0.5 * seg;   // angle to the nearest one
  float arc = la * r / (220.0 * uGlintShape.x);
  float uc = 0.3 + 0.4 * fract(sin(idx * 17.3) * 9631.1);
  float du = (u - uc) / (0.3 * uGlintShape.x);
  float glint = glintProf(arc * arc + du * du) * inSong;
#endif
  float onLines = mix(1.0, clamp(0.4 + 0.6 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
  // What else shows the turn (dust, the warp, spokes; the glints always do).
  float cueAmt = uCue.y * (1.0 - lead) * edge;
  float gk = uGlint * (0.25 + 0.75 * lamp) * onLines * (1.0 - lead) * uGlintAmt.x;
  vec3 gv = vec3(glint);
  float ce = uChroma.x;
  // (How much of the glint is colour, scaled away from the lamp by uAway:
  // where the lamp faces it's the colour amount as set; elsewhere, that
  // times uAway, so the sides and foot can carry more or less colour.)
#if defined(RELIT) && (PAL == 0 || PAL == 3)
  float Lg = gk * glint;
  float cg = uChroma.y * mix(uAway, 1.0, lamp) * step(0.5, ce);
  vec3 Gv = max(HUED(gk * (gv * BASE * (1.0 - cg) + 0.95 * cg * gt.yzw * inSong)), 0.0);
#else
  vec3 tv;
  glintColour(arc, du, a, r, inSong, gv, tv);
  float Lg = gk * (gv.r + gv.g + gv.b) / 3.0;
  vec3 Gv = max(HUED(gk * gv * mix(BASE, tv * 0.95, uChroma.y * mix(uAway, 1.0, lamp) * step(0.5, ce))), 0.0);
#endif

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
  // Away from the lamp, the grooves and glints a share as bright as where
  // it faces (uAwayB; 1 leaves them as the lamp has them).
  float awayK = mix(uAwayB, 1.0, lamp);
  float dustNear = 0.0;
  L *= after * awayK;
  Lg *= after * awayK;
  Gv *= after * awayK;

  // Natural dust (natDust, in HEAD). (RELIT: drawn after, as sprites.)
#ifndef RELIT
  if (uNat.x > 0.0) {
    float near;
#ifdef KEEP3
    natDust(q, dqx, dqy, r, b, true, near);
    dustNear = near;
#else
    float nat = natDust(q, dqx, dqy, r, b, false, near);
    L += 7.0 * uNat3.x * nat * mix(1.0, 0.45 + 0.55 * lamp, uNat3.y) * edge * (1.0 - lead);
#endif
  }
#endif
  // The lip at the very edge catches the light: a fine bright line that
  // shows the disc's outline, brightest where the lamp falls.
  float dl = (r - (R - 2.5)) / max(1.3, fr * 1.2);
  L += 1.1 * exp(-dl * dl) * (0.45 + 0.55 * lamp) * mix(0.35, 1.0, clamp((uGeo.x / max(1.0, px.y + uHz) - 1.0) * 4.0, 0.0, 1.0));

  // The pointer. Hv is light of its own colour, Hs how much it adds.
  vec3 Hv = vec3(0.0);
  float Hs = 0.0;
  // (Only the hover picked is compiled in; those that move the light draw
  // nothing here: HOVER, see variant.)
#if HOVER <= 6
#ifdef RELIT
  // (Only near the pointer's light: past these it adds under 1e-6. Across
  // the grooves (record px) and along them, as each light is shaped; the
  // lamp's streak runs out along a whole radius, so it's never cut short.)
  float gR = uHoverMode < 0.5 ? 140.0 : (uHoverMode < 2.5 ? 60.0 : 170.0) * fr * uDpr;
  float gA = uHoverMode < 0.5 ? 900.0 : uHoverMode < 2.5 ? 700.0 : uHoverMode < 3.5 ? 1250.0 : 960.0;
  // (Glints softer than the plain bell curve have long tails: then nowhere.)
  bool nearH = (uHoverMode > 0.5 && uHoverMode < 1.5) || (uHoverMode > 0.5 && uGlintShape.y < 0.999)
    || (abs(r - uHover.x) < gR && length(q - uHover.x * vec2(cos(uHover.y), sin(uHover.y))) < 1.25 * gA * max(1.0, 100.0 / max(uHover.x, 1.0)) + 2.0 * gR + 50.0);
  if (on > 0.0 && nearH) {
#else
  if (on > 0.0) {
#endif
    float shine = mix(1.0, clamp(0.25 + 0.75 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
    float da = atan(sin(a - uHover.y), cos(a - uHover.y));
    float k = uTouch * on * mix(0.6, 1.0, inSong);
    // Across the grooves from the pointer's, CSS px; and along its groove.
    float drc = (r - uHover.x) / (fr * uDpr);
    float run = da * max(uHover.x, 100.0);
    if (uHoverMode < 0.5) {
      // Arc: the grooves at its radius catch the light along their own
      // run, a narrow streak following the arc either side of it rather
      // than a round glow, shining on the grooves themselves.
      float dr = (r - uHover.x) / 34.0;
      float s = run / 240.0;
      float streak = exp(-dr * dr) * exp(-s * s);
      L += 11.0 * uTouch * on * streak * (0.45 + 0.55 * shine) * mix(0.6, 1.0, inSong);
    } else {
      // The rest are each a light painted as the glints are (their colour,
      // split, sharpness; see paint), placed and sized their own way, some
      // with a soft white glow: worked out here, then painted once.
      float x = 0.0;          // across the light, in its own units
      float y = 0.0;          // along it
      float e = 0.0;          // how strong
      float pw = 0.85;        // how much of it is painted
      float glow = 0.0;       // its white glow
      if (uHoverMode < 1.5) {
        // Lamp: a lamp carried over the record. On grooved vinyl its
        // reflection is a streak running across the grooves, out along a
        // radius, its colours across it, a soft glow round it.
        float along = (r * cos(da) - uHover.x) / 240.0;
        float s = r * sin(da) / (ft * uDpr);
        float w = 5.5;
        x = s / (1.8 * w);
        y = along;
        glow = 0.3 * exp(-s * s / (16.0 * w * w) - along * along);
        e = 9.0 * k * step(0.0, cos(da)) * (0.4 + 0.6 * shine);
      } else if (uHoverMode < 2.5) {
        // Prism: a short caustic on the grooves at its radius, its colours
        // split across the grooves.
        x = drc / 14.0;
        y = run / 170.0;
        e = 5.0 * k * shine;
        pw = 1.0;
      } else if (uHoverMode < 3.5) {
        // Spectrum: a wide cast of light along the pointer's grooves, its
        // colours spread wide across them.
        x = drc / 40.0;
        y = run / 300.0;
        e = 4.2 * k * shine;
        pw = 1.0;
      } else if (uHoverMode < 4.5) {
        // Lit arc: the arc lit as the lamp lights: along the pointer's
        // grooves, a coloured core and a wide soft glow.
        float w = 10.0;
        x = drc / (1.7 * w);
        y = run / 240.0;
        glow = 0.3 * exp(-drc * drc / (16.0 * w * w) - y * y);
        e = 7.0 * k * (0.4 + 0.6 * shine);
      } else {
        // Glass (the bend is above): at its edge, where the grooves crowd,
        // a fringe in the glints' colours on them, narrow or (glass prism)
        // wide; and a faint sheen on the glass toward the lamp. (The fringe
        // on the grooves alone, so it reads as bent light, not a halo.)
        x = (dist - 0.78 * GLASS) / (0.16 * GLASS) / (uHoverMode < 5.5 ? 1.0 : 1.6);
        pw = (uHoverMode < 5.5 ? 0.7 : 1.0) * shine * shine;
        vec2 hl = dp - GLASS * 0.32 * vec2(0.6, -0.8);
        glow = 0.25 * exp(-dot(hl, hl) / (0.09 * GLASS * GLASS));
        e = 2.6 * k;
      }
      Hv = e * (pw * paint(x, y, a, r) + glow * BASE);
    }
    Hs = maxc(Hv);
  }
#endif

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
  // The vinyl (see VINYLS in the script). Dark vinyl is the page's own
  // black, lit only by the lamp glancing off its grooves; the rest can be
  // coloured and see-through: a body of its colour, the lamp's light
  // coming through it (a deep glow of its hue, two clean-edged wedges
  // where the grooves light up pale), grooves in its colour, and flecks
  // inside it going round. Whatever its colour, the light through it is
  // the colour's hue at full strength, so even near-black vinyl stays rich
  // rather than grey; chromatic, that hue shifts round the disc with the
  // lamp's angle, as on oil-slick vinyl, with swirls that turn with it.
  vec4 vx = vec4(0.0);
  float vboost = 1.0;
  if (uVinyl.w + uThru.x + uThru.y + uThru.z + uThru.w + uConeLight > 0.0) {
    vec3 V = uVinyl.rgb;
    float vm = maxc(V);
    vec3 Vn = mix(vec3(1.0), V / max(vm, 1e-3), smoothstep(0.0, 0.03, vm));
    if (uVinylFin > 0.5) {
      Vn = hue(0.5 * cos(a - uFacing) + r / 900.0 + 0.12 * sin(2.0 * b + r / 260.0));
      Vn /= maxc(Vn);
    }
    vec3 HI = mix(Vn, vec3(1.0), uVinylFin > 0.5 ? 0.55 : 0.65);
    // The lamp's cone (see LAMP in the script): where its light comes
    // through the vinyl, clean-edged, with a soft halo round it, either side
    // of the centre (or one side), reaching in from the rim.
    // (Its width, edges, reach and one-sidedness only compiled in when
    // they're changed: CONE, see variant.)
#ifdef CONE
    float rf = smoothstep(R * (1.0 - uCone.w) - 0.3 * R, R * (1.0 - uCone.w), r);
#else
    float rf = 1.0;
#endif
#ifdef RELIT
    // (The cone's shape round the disc, from its table, CONE_FS.)
    vec2 ct = texture2D(uConeT, vec2((a - uCone.x) / (2.0 * PI), 0.5)).xy;
    float inWedge = ct.x * rf;
    float halo = ct.y * rf;
#else
    float lampC = coneAt(a);
    float inWedge = smoothstep(uConeEdge.x, uConeEdge.y, lampC) * rf;
    float halo = lampC * lampC * rf;
#endif
    vec3 CT = uConeTint.rgb;
    float wedge = uThru.y * inWedge;
    base = mix(base, mix(Vn, vec3(1.0), 0.15), uThru.z);
    base = mix(base, HI * CT, min(wedge, 1.0));
    // (In the wedges the grooves' lines light up, not the gaps between.)
    vboost = 1.0 + 2.5 * wedge * max(lines, 0.0) * inSong;
    alpha *= vboost;
    float sw = 1.0 + 0.15 * uSwell;
    float body = uVinyl.w * mix(0.5, 1.0, inSong) * edge * sw;
    vx += vec4(V, 1.0) * body;
    float thr = mix(0.7, 1.0, inSong) * edge * sw;
    vx += vec4(Vn, 1.0) * uThru.x * 0.015 * thr;
    vx += vec4(Vn * CT, 1.0) * uConeLight * (0.05 * inWedge + 0.05 * halo) * thr;
    vx += vec4(HI * CT, 1.0) * 0.05 * wedge * inSong * edge;
    if (uThru.w > 0.0) {
      // Flecks in the vinyl, carried round, glinting as they pass the light
      // (round on the screen however the disc is foreshortened).
      vec2 c = vec2(r / 40.0, mod(b, 2.0 * PI) * r / 40.0);
      vec2 id = floor(c);
      float h = hash(id + 7.7);
      float roomF = smoothstep(12.0, 20.0, 40.0 / (fr * uDpr));
      if (h > 0.8 && roomF > 0.0) {
        vec2 ctr = (id + 0.5 + 0.5 * (vec2(hash(id + 1.7), hash(id + 5.3)) - 0.5)) * 40.0;
        float ang = ctr.y / ((id.x + 0.5) * 40.0) + uSpin;
        vec2 D = q - ctr.x * vec2(cos(ang), sin(ang));
        float det = dqx.x * dqy.y - dqy.x * dqx.y;
        float dd = length(vec2(dqy.y * D.x - dqy.x * D.y, dqx.x * D.y - dqx.y * D.x) / (det * uDpr));
        float rad = 0.9 + 1.0 * fract(h * 37.0);
        float ls = 0.5 + 0.5 * cos(2.0 * (ang - uFacing));
        vx += vec4(HI, 1.0) * uThru.w * roomF * edge * clamp((rad - dd) * uDpr + 0.5, 0.0, 1.0) * (0.25 + 0.75 * ls * ls);
      }
    }
  }
  vec3 col = base * alpha + lift * (Gv + Hv) + vx.rgb;
  alpha += lift * max(max(Lg, maxc(Gv)), 0.0) + lift * max(Hs, maxc(Hv)) + vx.a;

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

  // (Kept as it is for the frames at rest to turn, see REPROJECT: the
  // buttons and the dither are laid on there, fresh each frame; and the
  // dust is drawn there too, from what it would add here (its light times
  // base, lift and the cone's boost) and where it lies.)
#ifdef KEEP3
  gl_FragData[0] = vec4(col, alpha);
  // (Where dust lies is told by 4 added to the alpha's multiplier, which is
  // never over 2: see REPROJECT.)
  gl_FragData[1] = vec4(base * lift * vboost, lift * vboost + 4.0 * dustNear);
#elif !defined(BAKE)
  if (uRaw > 0.5) { gl_FragColor = vec4(col, alpha); return; }

  // Nothing shows through the hero's buttons (one is see-through).
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 h = uHoles[i];
    // (Nothing to do away from its box: the rounded box ends inside it.)
    if (px.x < h.x - 1.0 || px.x > h.z + 1.0 || px.y < h.y - 1.0 || px.y > h.w + 1.0) continue;
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
#endif
}`;

// The other styles: the same disc, songs, turn, pointer, needle and music,
// each drawn as a different kind of picture. None costs more than the
// vinyl style: no groove harmonics, a pass or two over the songs, a
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
// Light, added; and ink, laid over (both premultiplied).
void add(inout vec4 o, vec3 c, float k) { o += vec4(c * k, k); }
void over(inout vec4 o, vec3 c, float k) { k = clamp(k, 0.0, 1.0); o = vec4(c * k, k) + o * (1.0 - k); }
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

// A hairline w device px wide, d device px off it, smooth however thin:
// under 1.4px it keeps a soft 1.4px profile and dims instead, so a fine
// line never beads or steps along its length.
float hair(float d, float w) {
  float h = 0.5 * max(w, 1.4);
  return (1.0 - smoothstep(h - 0.6, h + 0.6, abs(d))) * min(1.0, w / 1.4);
}
// lodLines drawn as hairlines.
float lodHair(float v, float fv, float P0, float gap, float w) {
  float lv = max(log2(gap * fv / P0), 0.0);
  float t = smoothstep(0.0, 1.0, fract(lv));
  float P = P0 * exp2(floor(lv));
  float n = floor(v / P + 0.5);
  return hair((v - n * P) / fv, w) * (mod(n, 2.0) > 0.5 ? 1.0 - t : 1.0);
}
// The glints, as on the vinyl: in each song three short runs of
// groove catch the lamp, fixed on the disc so they turn with it, in the
// glint colour (see CHROMA; white: the style's own light). Light to add.
vec3 glints(float r, float a, float b, float idx, float u, float inS, float lamp, vec3 white) {
  float seg = 2.0 * PI / uGlintShape.z;
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  float arc = (mod(a - uGlintShape.w - ph, seg) - 0.5 * seg) * r / (220.0 * uGlintShape.x);
  float du = (u - 0.3 - 0.4 * fract(sin(idx * 17.3) * 9631.1)) / (0.3 * uGlintShape.x);
  vec3 gv = vec3(glintProf(arc * arc + du * du) * inS);
  vec3 tv;
  glintColour(arc, du, a, r, inS, gv, tv);
  return max(HUED(mix(uAwayB, 1.0, lamp) * uGlint * (0.25 + 0.75 * lamp) * uGlintAmt.x * gv * mix(white, tv * 0.95, uChroma.y * mix(uAway, 1.0, lamp) * step(0.5, uChroma.x))), 0.0);
}

// The pointer, the same for every style, which each draws its own way.
// x: its main light, y: a second one (a beam's glow, a split's other
// colour, a spectrum's outer half, a lit arc's sides, a glass's warm
// edge), z: a mark at the pointer (the glass's sheen).
vec3 hoverField(vec2 px, float r, float a, float fr, float ft) {
  vec3 h = vec3(0.0);
  float on = uHover.z * uTouch;
  if (on <= 0.0) return h;
  float da = wrap(a - uHover.y);
  float dist = length(px - uPtr.xy);
  float run = da * max(uHover.x, 100.0);
  float drc = (r - uHover.x) / (fr * uDpr);    // CSS px across the grooves
  if (uHoverMode < 0.5) {
    // Arc: the grooves at its radius, along their run.
    float dr = (r - uHover.x) / max(12.0, 4.0 * fr * uDpr);
    float s = run / 240.0;
    h.x = exp(-dr * dr - s * s);
  } else if (uHoverMode < 1.5) {
    // Beam: a soft streak across the grooves, out along the radius.
    float along = (r * cos(da) - uHover.x) / 200.0;
    float s = r * sin(da) / (ft * uDpr) / 9.0;
    float f = exp(-along * along) * step(0.0, cos(da));
    h.x = f * exp(-s * s);
    h.y = f * exp(-s * s / 9.0);
  } else if (uHoverMode < 2.5) {
    // Split: two arcs side by side across the grooves.
    float s = run / 170.0;
    float e = exp(-s * s);
    h.x = e * exp(-(drc + 5.0) * (drc + 5.0) / 12.0);
    h.y = e * exp(-(drc - 5.0) * (drc - 5.0) / 12.0);
  } else if (uHoverMode < 3.5) {
    // Spectrum: a wide cast along the grooves, its inner and outer halves.
    float s = run / 300.0;
    float e = exp(-s * s);
    h.x = e * exp(-(drc + 16.0) * (drc + 16.0) / 500.0);
    h.y = e * exp(-(drc - 16.0) * (drc - 16.0) / 500.0);
  } else if (uHoverMode < 4.5) {
    // Lit arc: a soft core along the grooves, and its two sides.
    float s = run / 240.0;
    float e = exp(-s * s);
    h.x = e * exp(-drc * drc / 100.0);
    h.y = 0.6 * e * (exp(-(drc + 17.0) * (drc + 17.0) / 100.0) + exp(-(drc - 17.0) * (drc - 17.0) / 100.0));
  } else {
    // Glass (the bend is in main): a faint edge, inner and outer, and a
    // sheen toward the lamp.
    float x = (dist - 0.78 * GLASS) / (0.16 * GLASS);
    h.x = 0.45 * exp(-(x + 0.9) * (x + 0.9));
    h.y = 0.45 * exp(-(x - 0.9) * (x - 0.9));
    vec2 hl = px - uPtr.xy - GLASS * 0.32 * vec2(0.6, -0.8);
    h.z = 0.12 * exp(-dot(hl, hl) / (0.09 * GLASS * GLASS));
  }
  return h * on;
}

// Where a point on the page lies on the disc, the glass's bend and all.
vec2 lookQ(vec2 px) {
  vec2 q = discQ(px);
  float g = glassAt(px);
  if (g > 0.0) {
    float r = length(q);
    q *= (r - GLASS_M * g * (r - uHover.x)) / max(r, 1e-3);
  }
  return q;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  // Behind the app's screen nothing would show: nothing is worked out.
  if (px.x > uCover.x && px.x < uCover.z && px.y > uCover.y && px.y < uCover.w) { gl_FragColor = vec4(0.0); return; }
  // The disc under this pixel and its neighbours, worked out for each
  // pixel (dFdx is only per block of four, and steps where the disc
  // foreshortens fast): how it moves under a device pixel.
  vec2 q = lookQ(px);
  vec2 dqx = lookQ(px + vec2(1.0 / uDpr, 0.0)) - q;
  vec2 dqy = lookQ(px - vec2(0.0, 1.0 / uDpr)) - q;
  float r = length(q);
  // Record px per device px, across the grooves and along them.
  vec2 rdir = q / max(r, 1e-3);
  vec2 tdir = vec2(-rdir.y, rdir.x);
  float fr = max(length(vec2(dot(dqx, rdir), dot(dqy, rdir))), 1e-3);
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
  // ORBIT: a record in fine luminous line art, cool cyan on black. Every
  // groove a hairline, brighter in the two broad wedges where the lamp
  // falls (a real record's sheen) and stirred a little by the pressing's
  // warp, which turns with it; each song's first groove a touch brighter,
  // the quiet runs between songs left dark; a smooth run-in inside the
  // rim's bright lip; glints going round with the disc.
  vec3 ICE = vec3(0.5, 0.84, 1.0);
  vec3 VIO = vec3(0.76, 0.66, 1.0);
  float lead = 1.0 - smoothstep(R - 34.0, R - 26.0, r);
  // (Never closer than a few device px, so they never beat into moire.)
  float gro = lodHair(r, fr, 3.0, 2.5 * uDpr + 2.0, 0.9 * uDpr) * inS * lead;
  float k1 = floor(mid / 140.0) + 3.0;
  float warp = sin(k1 * b + r / 80.0 + idx * 2.3);
  float lvl = (0.13 + 0.45 * lamp * lamp + 0.06 * cue * warp) * (1.0 + 0.3 * sw);
  add(o, ICE, lvl * gro);
  add(o, ICE, 0.22 * (0.6 + 0.4 * lamp) * smoothstep(4.0, 8.0, room) * hair((r - s.x) / fr, uDpr) * lead);
  vec3 G = glints(r, a, b, idx, u, inS, lamp, mix(ICE, vec3(1.0), 0.5));
  o += vec4(G, maxc(G)) * 0.45 * (0.15 + 0.85 * gro);
  add(o, mix(ICE, vec3(1.0), 0.4), (0.55 + 0.45 * lamp) * hair((r - (R - 1.5)) / fr, 1.4 * uDpr));
  // The pointer: the grooves light up white under it; its second light,
  // the mark and the needle in violet.
  add(o, vec3(1.0), clamp(hv.x, 0.0, 1.0) * (0.12 + 0.88 * gro));
  add(o, VIO, clamp(hv.y, 0.0, 1.0) * (0.12 + 0.88 * gro) + hv.z);
  add(o, mix(VIO, vec3(1.0), 0.4), 0.95 * uNeedle.y * hair((r - uNeedle.x) / fr, 1.6 * uDpr));
  add(o, VIO, 0.7 * uRipple.y * hair((r - uRipple.x) / fr, uDpr));
#elif LOOK == 2
  // BAUHAUS: flat fields of red, yellow and blue and a warm paper white,
  // ruled with fine lines, and a few round dots, no shading at all. Most
  // songs carry a block of colour part of the way round, so the straight
  // edges of the fields show the turn. A block passing up behind the words
  // turns to a hatched screen, so the words always read. Fine grooves run
  // all through it, as on a record: cut darker into the colour, faint
  // paper-white on the black, catching the glints.
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
  // The grooves (thinned where they crowd up top).
  float gro = lodHair(r, fr, 4.0, 3.0 * uDpr, uDpr) * inS;
  float bare = 1.0 - clamp(o.a, 0.0, 1.0);
  o.rgb *= 1.0 - 0.32 * gro;
  add(o, PAP, 0.075 * gro * bare);
  vec3 G = glints(r, a, b, idx, u, inS, lamp, PAP) * 0.4 * gro * bare;
  o += vec4(G, maxc(G));
  // The pointer: a flat shape of colour, cut clean (the song's own band).
  over(o, hc, 0.92 * clamp((hv.x - 0.45) * 10.0, 0.0, 1.0) * inS);
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
  // The pointer's bend (every hover's light is soft, so the bent
  // reflections stay smooth; the glass bends the metal itself).
  float bend = hv.x - hv.y;
  float y = (u - 0.5) * 2.3 + wob + 0.7 * bend - 0.15 * sw;
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
  for (int j = 0; j < ${MAX_TRACKS / 3}; j++) {
    int i = 3 * j;
    if (float(i) >= uTrackCount) break;
    float T = uTracks[3 * j].x - 0.5 * GAPW;
    float dcss = (r - T) / (fr * uDpr);
    // (The tubes run outward: past the last one near enough to glow here, stop.)
    if (dcss < -32.0) break;
    if (dcss > 32.0) continue;
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
  float lit = 1.0 + 0.45 * clamp(hv.x, 0.0, 1.0) + 0.08 * sw;
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
  over(o, GOLDHI, 0.85 * clamp(hv.y, 0.0, 1.0) + hv.z);
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
    // (Wholly under the next layer out here: skip it.)
    if (r > t.y + GAPW) continue;
    float n = max(5.0, floor(t.x / 26.0));
    float amp = 9.0 * (0.35 + 0.65 * cue);
    float ph = float(i) * 1.7;
    float sc = 0.5 + 0.5 * cos(n * b + ph);
    float inner = t.x - GAPW - amp * sc;
    // Device px inside this layer's edge (its slope round the disc too).
    float slope = amp * 0.5 * n * sin(n * b + ph) / max(r, 1.0) * ft;
    float d = (r - inner) / length(vec2(fr, slope));
    if (d < -24.0 * uDpr) break;
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
  const float CALM = 0.7;   // (evenly, so flat fields stay flat; they're hatched up there)
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
    // (Nothing to do away from its box: the rounded box ends inside it.)
    if (px.x < h.x - 1.0 || px.x > h.z + 1.0 || px.y < h.y - 1.0 || px.y > h.w + 1.0) continue;
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
// At rest the whole record turns as one: the disc, and the lamp, its cone
// and the glints with it (they're all set from its turn), so one frame is
// the last with the disc turned a little further, the music's swell aside.
// So at rest the full picture (above) is worked out every few frames into a
// texture, without the buttons' holes or the dither, and each frame between
// is that picture turned on to where the disc is now: each pixel finds where
// on the disc it lies (discQ, plain: nothing bends the disc at rest), turns
// back by how far the disc has turned since, finds where that lay on the
// page then, and reads it there; scaled by the swell's change; then the
// buttons' holes and the dither, as the full picture lays them on. The
// grooves are circles, so turning them moves them along themselves.
const REPROJECT = `
uniform float uTurn;      // how far the disc has turned since the kept frame
uniform float uGain;      // the swell's change since
uniform sampler2D uKept;  // the kept frame, without its dust
uniform sampler2D uMul;   // what a unit of dust adds there (colour, alpha; 4 more on the alpha where dust lies)
uniform vec2 uKeptSize;   // the kept frame, device px: the canvas and a margin all round
uniform float uKeptM;     // that margin
// Read with a Catmull-Rom curve (nine taps of the texture's own linear
// filter), not straight linear: a fine groove read between pixels keeps
// its sharpness instead of softening.
vec4 sharp(vec2 uv) {
  vec2 sp = uv * uKeptSize;
  vec2 tc = floor(sp - 0.5) + 0.5;
  vec2 f = sp - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (tc - 1.0) / uKeptSize;
  vec2 t3 = (tc + 2.0) / uKeptSize;
  vec2 t12 = (tc + w2 / w12) / uKeptSize;
  return (texture2D(uKept, vec2(t0.x, t0.y)) * w0.x + texture2D(uKept, vec2(t12.x, t0.y)) * w12.x + texture2D(uKept, vec2(t3.x, t0.y)) * w3.x) * w0.y
       + (texture2D(uKept, vec2(t0.x, t12.y)) * w0.x + texture2D(uKept, vec2(t12.x, t12.y)) * w12.x + texture2D(uKept, vec2(t3.x, t12.y)) * w3.x) * w12.y
       + (texture2D(uKept, vec2(t0.x, t3.y)) * w0.x + texture2D(uKept, vec2(t12.x, t3.y)) * w12.x + texture2D(uKept, vec2(t3.x, t3.y)) * w3.x) * w3.y;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  // (Where the disc is under this pixel now, plain: nothing bends it at
  // rest. Worked out before anything returns, for the dust's derivatives.)
  float f = uGeo.x / max(1.0, px.y + uHz);
  vec2 q = vec2((px.x - uCentre.x) * f, (1.0 - f) * uGeo.x / uGeo.y);
  vec2 dqx = dFdx(q);
  vec2 dqy = dFdy(q);
  float r = length(q);
  float fr = max(fwidth(r), 1e-3);
  if (px.x > uCover.x && px.x < uCover.z && px.y > uCover.y && px.y < uCover.w) { gl_FragColor = vec4(0.0); return; }
  float c = cos(uTurn), s = sin(uTurn);
  vec2 q0 = vec2(c * q.x + s * q.y, c * q.y - s * q.x);
  float f0 = 1.0 - q0.y * uGeo.y / uGeo.x;
  vec2 p0 = vec2(uCentre.x + q0.x / max(f0, 1e-4), uGeo.x / max(f0, 1e-4) - uHz);
  vec2 uv = (vec2(p0.x * uDpr, uSize.y - p0.y * uDpr) + uKeptM) / uKeptSize;
  if (f0 <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec4 o = max(sharp(uv), 0.0);
  // The dust, drawn here as the full picture draws it (natDust), where the
  // kept frame says some lies.
  // (The four kept pixels round here, each read on its own: one where dust
  // lies says so, and each one's multiplier is freed of that mark before
  // they're blended, so a speck where the disc is foreshortened to under
  // a pixel is neither lost nor lit wrong.)
  vec2 tp = uv * uKeptSize - 0.5;
  vec2 i0 = floor(tp);
  vec2 ft = tp - i0;
  vec4 m00 = texture2D(uMul, (i0 + vec2(0.5, 0.5)) / uKeptSize);
  vec4 m10 = texture2D(uMul, (i0 + vec2(1.5, 0.5)) / uKeptSize);
  vec4 m01 = texture2D(uMul, (i0 + vec2(0.5, 1.5)) / uKeptSize);
  vec4 m11 = texture2D(uMul, (i0 + vec2(1.5, 1.5)) / uKeptSize);
  if (uNat.x > 0.0 && max(max(m00.a, m10.a), max(m01.a, m11.a)) > 3.0) {
    m00.a -= m00.a > 3.0 ? 4.0 : 0.0;
    m10.a -= m10.a > 3.0 ? 4.0 : 0.0;
    m01.a -= m01.a > 3.0 ? 4.0 : 0.0;
    m11.a -= m11.a > 3.0 ? 4.0 : 0.0;
    vec4 m = mix(mix(m00, m10, ft.x), mix(m01, m11, ft.x), ft.y);
    float a = atan(q.y, q.x);
    float farSide = smoothstep(0.15, 0.7, -q.y / max(r, 1.0));
    float R = mix(uOuter.x, uOuter.y, farSide);
    float edge = smoothstep(uSpan.x, uSpan.x + 40.0, r) * (1.0 - smoothstep(R - fr, R + fr, r));
    float lead = smoothstep(R - 34.0, R - 26.0, r);
    float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
    lamp *= lamp;
    float near;
    float nat = natDust(q, dqx, dqy, r, a - uSpin, false, near);
    float dl = 7.0 * uNat3.x * nat * mix(1.0, 0.45 + 0.55 * lamp, uNat3.y) * edge * (1.0 - lead);
    o += m * dl;
  }
  o *= uGain;
  vec3 col = o.rgb;
  float alpha = o.a;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 h = uHoles[i];
    vec2 hc = 0.5 * (h.xy + h.zw);
    vec2 hq = abs(px - hc) - (0.5 * (h.zw - h.xy) - uHoleR);
    float sd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - uHoleR;
    float inside = 1.0 - smoothstep(-1.0, 0.0, sd);
    col *= 1.0 - inside;
    alpha *= 1.0 - inside;
  }
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col + n, 0.0), clamp(alpha + n, 0.0, 1.0));
}`;

// The natural dust, drawn as sprites over the relit picture (see RELIT):
// one small quad per speck, placed where the speck lies now, each pixel of
// it working out that speck exactly as natDust does, and only where natDust
// would look for it (the 3 x 3 cells round the pixel's own), so the dust is
// the same as the full picture's.
// SPECKS_FS: which cells may hold a speck (for any amount of dust), worked
// out once on the GPU with natDust's own hash: row up the y axis, column
// (+1) along x.
const SPECKS_FS = `
void main() {
  vec2 id = vec2(floor(gl_FragCoord.y), floor(gl_FragCoord.x) - 1.0);
  gl_FragColor = vec4(hash2(id + 31.0) >= 0.94 - 0.003 ? 1.0 : 0.0);
}`;
// FAST: the relit frame at rest, for the usual look (the spin shown by the
// glints, the warp or spokes; glints plain or in the lamp's colours; solid
// vinyl, no flecks) with nothing passing (no pointer's light, needle or
// ring): MAIN's sums with everything that doesn't move baked (BAKE, BAKE2),
// the cone and the glints read from their tables, and the lamp's light, the
// sheen and the pressing's warp worked out from the angle. (The rest goes
// through MAIN with RELIT.) Keep it in step with MAIN.
const FAST = `
uniform sampler2D uSt0;
uniform sampler2D uSt1;
uniform sampler2D uSt2;
uniform sampler2D uConeT;
uniform sampler2D uGlT;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 s2 = texture2D(uSt2, uv);
  if (s2.w < 0.5) { gl_FragColor = vec4(0.0); return; }
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  vec2 q = discQ(px);
  float r = length(q);
  float a = atan(q.y, q.x);
  vec4 s0 = texture2D(uSt0, uv);
  vec4 s1 = texture2D(uSt1, uv);
  float L = s0.x;
  float lines = s0.y;
  float inSong = s0.z;
  float u = s0.w;
  float idx = s1.x;
  float k2 = floor(s1.y / 32.0);
  float k1 = s1.y - 32.0 * k2;
  float edge = s1.z;
  float lead = s1.w;
  float sheen = uSheen * cos(2.0 * (a - uFacing));
  float b = a - uSpin;
  float warp = (0.13 * sin(k1 * b + r / 80.0 + idx * 2.3) + 0.085 * sin(k2 * b - r / 55.0 + idx * 4.1)) * uGroove.w;
  L *= 1.0 + sheen + warp * mix(0.6, 1.0, inSong);
  float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
  lamp *= lamp;
  float seg = 2.0 * PI / uGlintShape.z;
  float ph = fract(sin(idx * 91.7) * 4375.5) * seg;
  vec4 gt = texture2D(uGlT, vec2((0.5 + 255.0 * mod(a - uGlintShape.w - ph, seg) / seg) / 256.0, (idx * 64.0 + 0.5 + u * 63.0) / 2048.0));
  float glint = gt.x * inSong;
  float onLines = mix(1.0, clamp(0.4 + 0.6 * (1.0 + lines) * 0.5, 0.0, 1.3), uStyle.x);
  float cueAmt = uCue.y * (1.0 - lead) * edge;
  float gk = uGlint * (0.25 + 0.75 * lamp) * onLines * (1.0 - lead) * uGlintAmt.x;
  vec3 gv = vec3(glint);
  float Lg = gk * glint;
  float cg = uChroma.y * mix(uAway, 1.0, lamp) * step(0.5, uChroma.x);
  vec3 Gv = max(HUED(gk * (gv * BASE * (1.0 - cg) + 0.95 * cg * gt.yzw * inSong)), 0.0);
  float after = 1.0;
  if (uCue.x > 1.5 && uCue.x < 2.5) {
    after = 1.0 + 1.6 * warp * cueAmt;
  } else if (uCue.x > 2.5 && uCue.x < 3.5) {
    float spk = 0.5 + 0.5 * cos(7.0 * b + sin(r / 120.0) * 0.6);
    after = 1.0 + 0.28 * pow(spk, 6.0) * cueAmt;
  }
  float awayK = mix(uAwayB, 1.0, lamp);
  L *= after * awayK;
  Lg *= after * awayK;
  Gv *= after * awayK;
  L += 1.1 * s2.x * (0.45 + 0.55 * lamp);
  float lift = uStyle.z * edge * (1.0 + 0.08 * uSwell);
  float alpha = lift * L;
  vec3 base = BASE;
  if (uTint > 0.0) {
    float side = sin(a - uFacing);
    vec3 c = side < 0.0 ? BLUE : ORANGE;
    base = mix(BASE, 0.95 * c, clamp(0.85 * uTint * smoothstep(0.1, 0.9, abs(side)), 0.0, 1.0));
  }
  vec4 vx = vec4(0.0);
  if (uVinyl.w + uThru.x + uThru.y + uThru.z + uThru.w + uConeLight > 0.0) {
    vec3 V = uVinyl.rgb;
    float vm = maxc(V);
    vec3 Vn = mix(vec3(1.0), V / max(vm, 1e-3), smoothstep(0.0, 0.03, vm));
    vec3 HI = mix(Vn, vec3(1.0), 0.65);
    vec2 ct = texture2D(uConeT, vec2((a - uCone.x) / (2.0 * PI), 0.5)).xy;
    float inWedge = ct.x * s2.y;
    float halo = ct.y * s2.y;
    vec3 CT = uConeTint.rgb;
    float wedge = uThru.y * inWedge;
    base = mix(base, mix(Vn, vec3(1.0), 0.15), uThru.z);
    base = mix(base, HI * CT, min(wedge, 1.0));
    float vboost = 1.0 + 2.5 * wedge * max(lines, 0.0) * inSong;
    alpha *= vboost;
    float sw = 1.0 + 0.15 * uSwell;
    vx += vec4(V, 1.0) * uVinyl.w * mix(0.5, 1.0, inSong) * edge * sw;
    float thr = mix(0.7, 1.0, inSong) * edge * sw;
    vx += vec4(Vn, 1.0) * uThru.x * 0.015 * thr;
    vx += vec4(Vn * CT, 1.0) * uConeLight * (0.05 * inWedge + 0.05 * halo) * thr;
    vx += vec4(HI * CT, 1.0) * 0.05 * wedge * inSong * edge;
  }
  vec3 col = base * alpha + lift * Gv + vx.rgb;
  alpha += lift * max(max(Lg, maxc(Gv)), 0.0) + vx.a;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 h = uHoles[i];
    if (px.x < h.x - 1.0 || px.x > h.z + 1.0 || px.y < h.y - 1.0 || px.y > h.w + 1.0) continue;
    vec2 hc = 0.5 * (h.xy + h.zw);
    vec2 hq = abs(px - hc) - (0.5 * (h.zw - h.xy) - uHoleR);
    float sd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - uHoleR;
    float inside = 1.0 - smoothstep(-1.0, 0.0, sd);
    col *= 1.0 - inside;
    alpha *= 1.0 - inside;
  }
  float n = (s2.z - 0.5) / 255.0;
  gl_FragColor = vec4(max(col + n, 0.0), clamp(alpha + n, 0.0, 1.0));
}`;
// The lamp's cone round the disc, one row, 2048 across (angle from where
// it points, 0 to 2 pi): how far in its clean-edged wedge, and its halo.
const CONE_FS = `
void main() {
  float lampC = coneAt(uCone.x + (gl_FragCoord.x / 2048.0) * 2.0 * PI);
  gl_FragColor = vec4(smoothstep(uConeEdge.x, uConeEdge.y, lampC), lampC * lampC, 0.0, 0.0);
}`;
// The glints, laid out on the disc: 64 rows a song (where in it, 0 to 1,
// each end on a row) and 256 columns from one glint's turn to the next (2 pi
// over how many a turn, each end on a column), each the glint's shape there
// and that times its colour, as
// MAIN works them out (for the palettes whose colour depends only on where
// in the glint: none, the lamp's).
const GLINT_FS = `
void main() {
  float idx = floor(gl_FragCoord.y / 64.0);
  float u = (floor(gl_FragCoord.y) - idx * 64.0) / 63.0;
  if (idx >= uTrackCount) { gl_FragColor = vec4(0.0); return; }
  vec2 t = vec2(0.0);
  for (int i = 0; i < ${MAX_TRACKS}; i++) if (float(i) == idx) t = uTracks[i];
  float r = t.x + u * (t.y - t.x);
  float seg = 2.0 * PI / uGlintShape.z;
  float la = (floor(gl_FragCoord.x) / 255.0) * seg - 0.5 * seg;
  float arc = la * r / (220.0 * uGlintShape.x);
  float uc = 0.3 + 0.4 * fract(sin(idx * 17.3) * 9631.1);
  float du = (u - uc) / (0.3 * uGlintShape.x);
  float glint = glintProf(arc * arc + du * du);
  vec3 gv = vec3(glint);
  vec3 tv;
  glintColour(arc, du, 0.0, r, 1.0, gv, tv);
  gl_FragColor = vec4(glint, glint * tv);
}`;
const DUST_VS = `
attribute vec4 p;        // the speck's cell (row, column), and the quad's corner
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uCentre;
uniform vec2 uGeo;
uniform float uHz;
uniform float uSpin;
uniform vec2 uNat;
uniform vec4 uNat2;
uniform vec4 uNat3;
uniform vec3 uStyle;
uniform vec4 uThru;
varying vec2 vId;
const float PI = 3.14159265;
float hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 id = p.xy;
  vId = id;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  float h = hash2(id + 31.0);
  // (A hair under the threshold: the pixels test it again exactly.)
  if (h < 1.0 - 0.06 * uNat.x - 0.002) return;
  float h1 = hash2(id * 1.3 + 2.9);
  float h2 = hash2(id * 0.7 + 6.1);
  float h3 = hash2(id * 1.9 + 8.3);
  float rs = (id.x + 0.2 + 0.6 * h1) * 9.0;
  float ang = (id.y + 0.2 + 0.6 * h2) * 9.0 / ((id.x + 0.5) * 9.0) + uSpin;
  vec2 q = rs * vec2(cos(ang), sin(ang));
  // Where that lies on the page (discQ, undone: nothing bends it here).
  float f = 1.0 - q.y * uGeo.y / uGeo.x;
  if (f <= 0.02) return;
  vec2 px = vec2(uCentre.x + q.x / f, uGeo.x / f - uHz);
  // How far it can reach before it adds under a fifth of a level: from the
  // most it can add (its brightness, times the most the lift, the cone's
  // boost and the dust's brightness can make of it), out along its stretch
  // (dd) and across, CSS px, as its core, glow, clump and fibre each reach.
  float size = (0.25 + 2.3 * pow(h3, mix(1.2, 5.0, uNat3.z))) * uNat2.x;
  float s2 = max(size * size, 0.0025);
  float asp = 1.0 + 1.6 * h2 * h2;
  float bright = 0.12 + 0.88 * pow(fract(h * 61.0), 2.5);
  float A = uStyle.z * 1.1 * (1.0 + 5.0 * uThru.y) * 7.0 * uNat3.x * bright * 1275.0;
  if (A <= 1.0) return;
  float K = log(A);
  float rw = sqrt(s2 * max(2.6 * K, uNat2.w * uNat2.w * 9.0 * max(log(A * uNat2.z * 0.35), 0.0)));
  float along = asp * rw, across = rw;
  if (fract(h * 37.0) > 0.68) {
    float c = 1.84 * size + sqrt(0.45 * s2 * max(log(0.55 * A), 0.0));
    along = max(along, c);
    across = max(across, c);
  }
  if (fract(h * 53.0) > 1.0 - 0.16 * uNat3.w) {
    float len = (4.0 + 12.0 * h2) * max(0.4, uNat2.x);
    float wf = sqrt(0.22 * max(0.2, uNat2.x) * max(log(0.7 * A), 0.0));
    along = max(along, len);
    across = max(across, abs(h3 - 0.5) * 0.12 * len * len + wf);
  }
  float phi = h1 * PI;
  vec2 dd = vec2(cos(phi), sin(phi));
  // (A pixel and a half more, for the perspective's change across it.)
  vec2 off = (dd * (along * uDpr + 1.5) * p.z + vec2(-dd.y, dd.x) * (across * uDpr + 1.5) * p.w);
  vec2 dev = vec2(px.x * uDpr, uSize.y - px.y * uDpr) + off;
  gl_Position = vec4(dev / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;
const DUST_FS = `
uniform sampler2D uSt0;
varying vec2 vId;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  if (px.x > uCover.x && px.x < uCover.z && px.y > uCover.y && px.y < uCover.w) discard;
  vec2 q = discQ(px);
  vec2 dqx = dFdx(q);
  vec2 dqy = dFdy(q);
  float r = length(q);
  float fr = max(fwidth(r), 1e-3);
  if (r > max(uOuter.x, uOuter.y) + 2.0 * fr) discard;
  float a = atan(q.y, q.x);
  float b = a - uSpin;
  // Only where natDust looks for this speck: its row within one of the
  // pixel's, its column within one of the pixel's in that row.
  if (abs(vId.x - floor(r / 9.0)) > 1.5) discard;
  float rc = (vId.x + 0.5) * 9.0;
  if (rc <= 0.0 || abs(vId.y - floor(mod(b, 2.0 * PI) * rc / 9.0)) > 1.5) discard;
  float h = hash2(vId + 31.0);
  if (h < 1.0 - 0.06 * uNat.x) discard;
  float det = dqx.x * dqy.y - dqy.x * dqx.y;
  float nat = speckAt(vId, h, q, dqx, dqy, det);
  // As MAIN adds it: where the disc is, away from the rim's lead-in, more
  // in the lamp's light; times what a unit of it adds there.
  float farSide = smoothstep(0.15, 0.7, -q.y / max(r, 1.0));
  float R = mix(uOuter.x, uOuter.y, farSide);
  float edge = smoothstep(uSpan.x, uSpan.x + 40.0, r) * (1.0 - smoothstep(R - fr, R + fr, r));
  float lead = smoothstep(R - 34.0, R - 26.0, r);
  float lamp = 0.5 + 0.5 * cos(2.0 * (a - uFacing));
  lamp *= lamp;
  float dl = 7.0 * uNat3.x * nat * mix(1.0, 0.45 + 0.55 * lamp, uNat3.y) * edge * (1.0 - lead);
  vec4 st0 = texture2D(uSt0, gl_FragCoord.xy / uSize);
  vec4 o = dustMul(a, b, r, R, edge, st0.y, st0.z) * dl;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHoleCount) break;
    vec4 hb = uHoles[i];
    vec2 hc = 0.5 * (hb.xy + hb.zw);
    vec2 hq = abs(px - hc) - (0.5 * (hb.zw - hb.xy) - uHoleR);
    float sd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - uHoleR;
    o *= smoothstep(-1.0, 0.0, sd);
  }
  gl_FragColor = o;
}`;

// The styles, by name: n is its program (0 the vinyl, the others
// LOOK in LOOKS). crisp: drawn at the screen's full resolution whatever
// the render resolution, since fine lines, dots and cells go soft when
// the browser scales them up (each still costs less than the current
// look does at its own resolution).
const STYLE_LIST = [
  ['vinyl', 'Vinyl (see vinyl presets)', { n: 0 }],
  ['orbit', 'Orbit (line art)', { n: 1, crisp: true }],
  ['bauhaus', 'Bauhaus', { n: 2, crisp: true }],
  ['riso', 'Risograph', { n: 3, crisp: true }],
  ['engraving', 'Engraving (guilloche)', { n: 4, crisp: true }],
  ['chrome', 'Chrome (liquid metal)', { n: 5, crisp: true }],
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
// When the live app took over the screen from its screenshot.
let liveSince = 0;
{
  const fr = screen?.closest('.stage-frame');
  const mark = () => { liveSince = fr.hasAttribute('data-live') ? performance.now() : 0; };
  if (fr) { mark(); new MutationObserver(mark).observe(fr, { attributes: true, attributeFilter: ['data-live'] }); }
}

// One program per style, compiled the first time it's shown.
const NAMES = ['uSize', 'uDpr', 'uCentre', 'uGeo', 'uHoles', 'uHoleCount', 'uCover', 'uHoleR', 'uSpan', 'uSpin', 'uFacing', 'uStyle', 'uSheen', 'uGlint', 'uHover', 'uSwell', 'uNeedle', 'uRipple', 'uTouch', 'uHz', 'uCue', 'uTracks', 'uTrackCount',
  'uOuter', 'uGlintAmt', 'uChroma', 'uSpeck', 'uNat', 'uNat2', 'uNat3', 'uAway', 'uAwayB', 'uTint', 'uWarp', 'uLens', 'uHoverMode', 'uPtr', 'uVinyl', 'uVinylFin', 'uThru', 'uGroove',
  'uGlintShape', 'uGlintSpread', 'uHueM', 'uTilt', 'uCone', 'uConeTint', 'uConeEdge', 'uConeLight', 'uRaw', 'uOrigin'];
const progs = new Map();
let shown = '';
function build(n, defs) {
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  // WebGL 1 needs the derivatives extension switched on in the shader.
  const frag = '#extension GL_OES_standard_derivatives : enable\n' + (defs.includes('KEEP3') || defs.includes('BAKE') ? '#extension GL_EXT_draw_buffers : require\n' : '') + defs + (n === 'turn' ? HEAD + REPROJECT : n === 'specks' ? HEAD + SPECKS_FS : n === 'dust' ? HEAD + DUST_FS : n === 'cone' ? HEAD + CONE_FS : n === 'fast' ? HEAD + FAST : n === 'glints' ? HEAD + GLINT_FS : n ? `#define LOOK ${n}\n${HEAD}${LOOKS}` : HEAD + MAIN);
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, n === 'dust' ? DUST_VS : VERT));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (const k of NAMES) u[k] = gl.getUniformLocation(p, k);
  return { p, u };
}
// Each program is compiled with only what the settings use (variant): the
// glints' palette, and their sharpness, colour turn, the cone's shape, the
// tilt and the hover only when they're in use, so a setting left as it was
// costs nothing. The few in use are kept, each compiled the first time.
function variant() {
  const mv = MOVERS[T.hover];
  let d = `#define PAL ${CHROMA[T.chroma] ?? 0}\n#define HOVER ${HOVERS[T.hover] ?? 0}\n`;
  if (T.gSharp !== 1) d += '#define SHARP\n';
  if (T.gHue !== 0 || mv?.includes('colour')) d += '#define HUE\n';
  if (mv?.includes('tilt') || T.dragTilt > 0) d += '#define TILT\n';
  if (T.cones === 'one' || T.coneReach < 1 || coneShape().scale !== 1 || coneShape().lo !== 0.78) d += '#define CONE\n';
  return d;
}
/** Switch to style n (see LOOK) with these settings' variant; one that won't compile shows the vinyl style. */
function use(n) {
  const defs = variant();
  const key = `${n}|${defs}`;
  if (key === shown) return;
  let e = progs.get(key);
  if (!e) {
    try {
      e = build(n, defs);
    } catch (err) {
      if (!n) throw err;
      console.warn('hero-fx:', err);
      e = build(0, defs);
    }
    progs.set(key, e);
  }
  prog = e.p;
  U = e.u;
  locName = new Map(Object.entries(U).filter(([, v]) => v).map(([k, v]) => [v, k]));
  uniNow.clear();
  gl.useProgram(prog);
  shown = key;
  // Each program keeps its own uniforms: lay everything out afresh.
  geo = null;
  measured = 0;
}

let buf = null;
function init() {
  if (!gl) return false;
  gl.getExtension('OES_standard_derivatives');
  buf = gl.createBuffer();
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
// The page's scroll and the canvas's place on the page, kept here: reading
// either from the page every frame makes the browser lay it out early, on
// every refresh of the screen (120 a second on some), drawn or not.
let scrollPos = scrollY;
let canvasTop = 0;
// Where the app always covers the record, in either mode. In controller
// mode it shrinks to 91% toward where it scales from (its top, middle or
// bottom: the "screen scales from" setting) and tips by its tilt, so this
// keeps clear of wherever its edges can be (and its rounded corners).
function coverOf(box) {
  let ay = 0;
  let tilt = 3;
  try {
    const st = screen.querySelector('iframe.live')?.contentDocument?.documentElement.style;
    const a = st?.getPropertyValue('--anchor').trim().split(/\s+/)[1];
    if (a) ay = parseFloat(a) / 100;
    const t = parseFloat(st?.getPropertyValue('--tilt'));
    if (Number.isFinite(t)) tilt = Math.abs(t);
  } catch {}
  const cw = box.r - box.l, ch = box.b - box.t;
  const lean = 0.005 * tilt;
  return [box.l + cw * (0.055 + lean), box.t + ch * (0.09 * ay + 0.03 + lean), box.r - cw * (0.055 + lean), box.b - ch * (0.09 * (1 - ay) + 0.04 + lean)];
}
function layout(now) {
  if (geo && now - measured < 500) return geo;
  measured = now;
  const c = canvas.getBoundingClientRect();
  canvasTop = c.top + scrollPos;
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
  const key = [c.width, c.height, Math.round(cx), Math.round(cy), Math.round(end), T.drop, T.persp, T.size, T.up, T.reach, T.warp, T.warpAmt, T.fadeAt, T.fadeLen, T.songLen, T.bfStart, T.bfEnd, T.bfCurve, T.bfShape, T.bfWidth, T.bfCentre, T.bfMid].join();
  gl.uniform4fv(U.uHoles, new Float32Array([...holes.flat(), ...new Array(16 - holes.length * 4).fill(0)]));
  gl.uniform1f(U.uHoleCount, holes.length);
  holesNow.list = new Float32Array([...holes.flat(), ...new Array(16 - holes.length * 4).fill(0)]);
  holesNow.count = holes.length;
  const btn = document.querySelector('.hero .btn');
  gl.uniform1f(U.uHoleR, (holesNow.r = btn ? parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 0 : 0));
  if (geo?.key === key) return Object.assign(geo, { box, cover: coverOf(box) });
  // The bends up top (see toRecord): more rings above, as a share of the
  // half above the centre; the lens's place and size.
  const g = { cx, cy, hz, d0, tilt, up: T.up, half: c.width / 2, lens: [cx, RIM_TOP + T.drop + (cy - RIM_TOP - T.drop) * 0.45, Math.max(200, c.width * 0.3)] };
  // How far out it runs: all round, and (with more rings above) up top as
  // far as the rings now reach at the top of the canvas.
  const out = R * T.size;
  let top = T.up > 0 ? Math.max(out, toRecord(cx, RIM_TOP + T.drop, g).r) : out;
  // Rings past the rim, up top only (reach): the disc's far edge carried
  // further out toward the top of the canvas, share `reach` of the way.
  // Nothing else moves: the same centre, tilt and perspective, so all
  // below stays exactly as it was.
  if (T.reach > 0) {
    const toTop = toRecord(cx, Math.max(2, -0.6 * hz), { ...g, up: 0 }).r;
    top = Math.max(top, out + (Math.max(out, toTop) - out) * T.reach);
  }
  const Rmax = Math.max(out, top);
  const tracks = [];
  for (let a = r0, i = 0; a < Rmax - 40 && tracks.length < MAX_TRACKS; i++) {
    const b = Math.min(Rmax - 34, a + (60 + rand(i, 9) * 80) * T.songLen);
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
  canvas.style.height = `${Math.ceil(end + Math.max(0, T.bfEnd) + 8)}px`;
  topFade(Math.round(s.top - c.top), Math.round(s.top - c.top + s.height * 0.3), Math.round(end), c.width);
  geo = { ...g, key, R, r0, box, out, top, Rmax, cover: coverOf(box) };
  return geo;
}

// A CSS colour (the picker may give hex, oklch() or display-p3) as sRGB
// 0..1, worked out by the browser once per colour.
let swatchCtx = null;
const swatchOf = () => (swatchCtx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
const rgbCache = new Map();
function rgbOf(v) {
  let c = rgbCache.get(v);
  if (c) return c;
  // Hex, the usual case, is read here; anything else the browser works out
  // (setting up a canvas to read it back costs a good 100ms the first time).
  const h = /^#([0-9a-f]{3,8})$/i.exec(String(v).trim())?.[1];
  if (h && (h.length === 3 || h.length === 6 || h.length === 8)) {
    const x = h.length === 3 ? [...h].map((d) => d + d) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
    c = x.map((d) => parseInt(d, 16) / 255);
    rgbCache.set(v, c);
    return c;
  }
  const swatch = swatchOf();
  swatch.canvas.width = swatch.canvas.height = 1;
  swatch.fillStyle = '#eb1a3d';
  swatch.fillStyle = String(v);
  swatch.fillRect(0, 0, 1, 1);
  const d = swatch.getImageData(0, 0, 1, 1).data;
  c = [d[0] / 255, d[1] / 255, d[2] / 255];
  if (rgbCache.size > 64) rgbCache.clear();
  rgbCache.set(v, c);
  return c;
}

const local = (e) => {
  const c = canvas.getBoundingClientRect();
  return { x: e.clientX - c.left, y: e.clientY - c.top };
};
// (Scrolling: wake, so the twist eases to where the page now is.)
const twistTo = () => (reduced.matches ? 0 : (Math.min(T.twistMax, (scrollPos / 1000) * T.twistRate) * Math.PI) / 180);
addEventListener('scroll', () => { scrollPos = scrollY; if (T.twistRate) wake(); }, { passive: true });
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const p = local(e);
  Object.assign(hover, p, { moved: performance.now() });
  if (quiet.on && Math.hypot(p.x - quiet.x, p.y - quiet.y) > 40) quiet.on = false;
  wake();
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => Object.assign(hover, { x: -1e4, y: -1e4 }));
// Dragging on the record (not on a link or a control): it tips the way
// it's dragged, a little, and springs back when let go.
addEventListener('pointerdown', (e) => {
  if (!geo || !T.dragTilt || reduced.matches || e.button !== 0 || e.target.closest('a, button, input, select, summary, iframe, .shot, .dialkit-root, .nav')) return;
  const p = local(e);
  if (p.y < 0 || p.y > canvas.clientHeight) return;
  Object.assign(drag, { on: true, x0: e.clientX, y0: e.clientY, tx: 0, ty: 0 });
  wake();
}, { passive: true });
addEventListener('pointermove', (e) => {
  if (!drag.on) return;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  drag.tx = clamp((e.clientX - drag.x0) / 320) * T.dragTilt;
  drag.ty = clamp((e.clientY - drag.y0) / 320) * T.dragTilt;
  wake();
}, { passive: true });
for (const ev of ['pointerup', 'pointercancel', 'blur']) addEventListener(ev, () => { if (!drag.on) return; drag.on = false; drag.tx = drag.ty = 0; wake(); });
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
  if (!prog) return;
  // Asleep between frames at rest: something's moving now, so draw at once.
  if (running) {
    if (nap || resting) { clearTimeout(nap); nap = 0; resting = false; requestAnimationFrame(draw); }
    return;
  }
  if (reduced.matches) {
    frame(performance.now(), true);
    return;
  }
  if (!visible) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(draw);
}

// The canvas's size in CSS px, kept from a ResizeObserver: asking the
// canvas every frame made the browser lay the page out first whenever the
// app in the screen had changed it.
const box = { w: canvas.clientWidth, h: canvas.clientHeight };
new ResizeObserver(([e]) => {
  box.w = Math.round(e.contentRect.width);
  box.h = Math.round(e.contentRect.height);
  wake();
}).observe(canvas);

let last = performance.now();
let lastSlot = -1;
let lastDraw = 0;
let lastBusySlot = -1;
// Between frames at rest the loop sleeps on a timer instead of asking for
// every frame of the screen (60 or 120 a second) only to skip most of them.
let nap = 0;
// Or, while the hero's screen plays its recording, the frames at rest come
// with the video's own (beat, from the page): the record and the video then
// change on the same frames, so the page is put together 30 times a second
// rather than 60. (A timer carries on if the video stalls.)
let paced = false;
let resting = false;
export function pacer(on) {
  paced = !!on;
  if (!paced && resting) { resting = false; clearTimeout(nap); nap = 0; requestAnimationFrame(draw); }
}
export function beat(now) {
  if (!resting || !running) return;
  resting = false;
  clearTimeout(nap);
  nap = 0;
  draw(now);
}

function frame(now, still) {
  const dt = still ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  // Drawn at T.res of the screen's pixels and scaled up by the browser: the
  // grooves are soft light, so full Retina resolution buys little and costs
  // four times the pixels.
  const dpr = Math.min(2, devicePixelRatio || 1) * (STYLE[T.look]?.crisp ? 1 : T.res);
  const w = Math.round(box.w * dpr);
  const h = Math.round(box.h * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    geo = null;
  }
  use(LOOK[T.look] ?? 0);
  const g = layout(now);
  swell += (want - swell) * Math.min(1, dt * (want > swell ? 2.5 : 1));
  want *= Math.exp(-dt * 1.4);
  // The scroll's twist: so many degrees per 1000px down the page, no more
  // than its cap, reached on a spring that settles in about scrollEase s.
  const aim = twistTo();
  const k = (2 * Math.PI / Math.max(0.05, T.twistEase)) ** 2;
  const c = 2 * Math.sqrt(k);
  for (let i = 0, n = Math.ceil(dt / 0.008); i < n; i++) {
    const h = dt / n;
    twistV += (k * (aim - twist) - c * twistV) * h;
    twist += twistV * h;
  }
  if (Math.abs(aim - twist) < 1e-5 && Math.abs(twistV) < 1e-5) { twist = aim; twistV = 0; }
  spin += TURN * T.life * dt;
  drift += dt * T.life;
  glintSpin = (glintSpin + TURN * T.life * T.gRide * dt) % (Math.PI * 2);
  if (T.lampMove === 'turn') lampTurn = (lampTurn + TURN * T.life * dt) % (Math.PI * 2);
  // Where the lamp points: drifting slowly to and fro, fixed, or turning
  // with the record.
  const lampAt = FACING + (T.lampMove === 'drift' ? DRIFT * Math.min(1, T.life) * Math.sin((drift * 2 * Math.PI) / DRIFT_S) : T.lampMove === 'turn' ? lampTurn : 0);

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

  // Hover: wherever the pointer is over the record, over the app's screen
  // and the page's words and buttons too (the screen takes no pointer of
  // its own, so its moves reach us), unless the touch is switched off.
  const { r: hr, a: ha } = toRecord(hover.x, hover.y, g);
  // And only while the pointer moves: a little after it stops, its light
  // fades away, so no groove is left looking selected under a still pointer.
  const lively = T.still >= 10 || now - hover.moved < T.still * 1000;
  const reach = touch !== 'off' && !quiet.on && lively && hr > g.r0 && hr < g.Rmax ? 1 : 0;
  const mode = HOVERS[T.hover] ?? 0;
  const sp = SPRING[T.hover];
  const movers = MOVERS[T.hover];
  if (reach) {
    if (hover.on < 0.02) {
      // Coming in from nothing, it starts right there.
      Object.assign(hover, { r: hr, a: ha, sx: hover.x, sy: hover.y, vx: 0, vy: 0 });
    }
    const k = Math.min(1, dt * 7);
    hover.r += (hr - hover.r) * k;
    hover.a += Math.atan2(Math.sin(ha - hover.a), Math.cos(ha - hover.a)) * k;
  }
  // Fades in over a third of a second or so, out over a second (quicker
  // once the needle drops, which takes the pointer's light off).
  hover.on += (reach - hover.on) * Math.min(1, dt * (reach ? 3 : quiet.on ? 3.5 : 2.2));
  if (!reach && hover.on < 0.01) hover.on = 0;
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
  }
  stepMovers(movers, reach, ha, lampAt, g, dt);

  const st = STYLES[style];
  gl.viewport(0, 0, w, h);
  gl.uniform2f(U.uSize, w, h);
  gl.uniform1f(U.uDpr, w / box.w);
  gl.uniform2f(U.uCentre, g.cx, g.cy);
  gl.uniform2f(U.uGeo, g.d0, g.tilt);
  gl.uniform2f(U.uSpan, g.r0, g.R);
  gl.uniform1f(U.uSpin, (turnNow.spin = (spin + twist) % (Math.PI * 2)));
  // (Nothing passing goes in a still frame: the pointer's moves are left out.)
  const f = still ? ZERO_FX : fx.at;
  gl.uniform1f(U.uFacing, (turnNow.facing = lampAt + f.light));
  gl.uniform3f(U.uStyle, st.lines * T.contrast, st.satin * T.satin, st.level * T.level);
  gl.uniform1f(U.uSheen, st.sheen * T.sheen);
  // (In the vinyl style the grooves' brightness lifts everything drawn;
  // the glints are taken back out of it, so only their own brightness sets them.)
  gl.uniform1f(U.uGlint, (st.glint ?? 1.6) / (LOOK[T.look] ? 1 : Math.max(0.01, T.level)));
  gl.uniform3f(U.uHover, hover.r, hover.a, still || movers ? 0 : hover.on);
  gl.uniform1f(U.uSwell, (turnNow.swell = swell));
  // A still frame (reduced motion) may be the last one drawn for a while, so
  // nothing passing (the needle, its ring, the pointer's light) goes in it.
  gl.uniform2f(U.uNeedle, needle.r, still ? 0 : needleOn * T.needle);
  gl.uniform2f(U.uRipple, rippleR, still ? 0 : rippleOn * T.needle);
  gl.uniform1f(U.uTouch, T.needle);
  gl.uniform1f(U.uHz, g.hz);
  gl.uniform2f(U.uCue, CUES[T.cue] ?? 1, T.cueAmt);
  gl.uniform2f(U.uOuter, g.out, g.top);
  gl.uniform2f(U.uGlintAmt, T.glints, 0);
  gl.uniform4f(U.uGlintShape, T.gSize, T.gSharp, Math.max(1, Math.round(T.gCount)), (turnNow.glint = glintSpin + f.phase));
  gl.uniform1f(U.uGlintSpread, Math.max(0, T.gSpread * (1 + f.spread)));
  gl.uniformMatrix3fv(U.uHueM, false, hueTurn((T.gHue * Math.PI) / 180 + f.hue));
  // (Only while the tilt is in use: the shader only has it then, see variant.)
  {
    // The drag's tip, on its spring (about half a second, a hint of bounce).
    const k = 90, c = 13;
    for (let i = 0, n = Math.ceil(dt / 0.008); i < n; i++) {
      const h = dt / n;
      drag.vx += (k * (drag.tx - drag.x) - c * drag.vx) * h; drag.x += drag.vx * h;
      drag.vy += (k * (drag.ty - drag.y) - c * drag.vy) * h; drag.y += drag.vy * h;
    }
    if (!drag.on && Math.abs(drag.x) < 1e-4 && Math.abs(drag.y) < 1e-4 && Math.abs(drag.vx) < 1e-4 && Math.abs(drag.vy) < 1e-4) drag.x = drag.y = drag.vx = drag.vy = 0;
  }
  const htx = (movers?.includes('tilt') ? f.tx : 0) + drag.x;
  const hty = (movers?.includes('tilt') ? f.ty : 0) + drag.y;
  tiltNow = htx || hty ? [(0.1 * htx) / g.half, (0.1 * hty) / g.half, 14 * htx, 10 * hty] : [0, 0, 0, 0];
  gl.uniform4fv(U.uTilt, tiltNow);
  const cone = coneShape();
  // (The cone keeps to the lamp's own place: only its own hover, Cone
  // follows, moves it; Lamp follows moves the lamp's light alone.)
  gl.uniform4f(U.uCone, (turnNow.cone = lampAt + f.cone + (T.coneDir * Math.PI) / 180), cone.scale, 0, T.coneReach);
  gl.uniform2f(U.uConeEdge, cone.lo, cone.hi);
  gl.uniform4f(U.uConeTint, ...rgbOf(T.coneTint), T.cones === 'one' ? 1 : 0);
  gl.uniform1f(U.uConeLight, T.cone);
  gl.uniform2f(U.uChroma, CHROMA[T.chroma] ?? 0, T.chromaAmt);
  gl.uniform1f(U.uSpeck, SPECKS[T.speck] ?? 0);
  gl.uniform2f(U.uNat, T.dust ?? 0, 0);
  gl.uniform4f(U.uNat2, T.dustSize ?? 1, T.dustSoft ?? 0.5, T.dustGlow ?? 1, T.dustGlowSize ?? 1);
  gl.uniform4f(U.uNat3, T.dustBright ?? 1, T.dustLight ?? 1, T.dustVariety ?? 0.6, T.dustFibres ?? 0.5);
  gl.uniform1f(U.uAway, T.away ?? 1);
  gl.uniform1f(U.uAwayB, T.awayB ?? 1);
  gl.uniform1f(U.uTint, T.tint);
  gl.uniform4f(U.uWarp, WARPS[T.warp] ?? 0, T.warpAmt, g.up, g.half);
  gl.uniform3f(U.uLens, ...g.lens);
  gl.uniform1f(U.uHoverMode, mode);
  gl.uniform3f(U.uPtr, sp ? hover.sx : hover.x, sp ? hover.sy : hover.y, hover.speed);
  gl.uniform4f(U.uVinyl, ...rgbOf(T.vinyl), T.body);
  gl.uniform1f(U.uVinylFin, T.finish === 'chromatic' ? 1 : 0);
  gl.uniform4f(U.uThru, T.through, T.wedge, T.lineTint, T.flecks);
  gl.uniform4f(U.uGroove, T.pitch, T.pitchOut, T.lineW, T.press);
  // Only what's on screen is drawn, and a quarter of a screen either side
  // (for a quick scroll between frames): the rest isn't seen, and every
  // pixel of the record costs the GPU a lot.
  const ks = h / box.h;
  const ct = canvasTop - scrollPos;
  const mg = innerHeight * 0.25;
  // (A still frame, left showing when the record stops, is drawn whole:
  // nothing redraws it as the page scrolls.)
  const y0 = still ? 0 : Math.max(0, Math.floor((-ct - mg) * ks));
  const y1 = still ? h : Math.min(h, Math.ceil((innerHeight - ct + mg) * ks));
  // (Only once the live app has been showing a moment: while it and the
  // screenshot cross-fade, the record shows through a little.)
  const cv = liveSince && now - liveSince > 1500 && geo?.cover;
  const cover = [cv ? cv[0] : 0, cv ? cv[1] : 0, cv ? cv[2] : 0, cv ? cv[3] : 0];
  gl.uniform4f(U.uCover, ...cover);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, h - Math.max(y0, y1), w, Math.max(0, y1 - y0));
  gl.clearColor(0, 0, 0, 0);
  // Relit from the baked layer (see RELIT), when it can be; or at rest, the
  // kept picture turned on (see REPROJECT).
  if (y1 > y0 && !still && relit(w, h, g, cover, mode)) return;
  if (y1 > y0 && !still && restNow && turned(now, w, h, y0, y1, g, cover, mode)) return;
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (y1 > y0) gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// The frames at rest, turned from a kept one (REPROJECT). The values the
// turn sets, as set this frame; and the kept frame's.
const turnNow = { spin: 0, facing: 0, swell: 0, glint: 0, cone: 0 };
const holesNow = { list: new Float32Array(16), count: 0, r: 0 };
let restNow = false;
// A new frame is worked out in full every KEEP frames at most (and whenever
// anything but the turn and the swell has changed, or the disc has turned
// so far that something on it could have moved past a margin): the turned
// ones drift from it by a few pixels, and it's worked out under the app's
// screen's edge by MARGIN CSS px and past the canvas's edges and the strip
// that's drawn by EDGE device px, so what turns in at an edge is there.
const KEEP = 12;
const MARGIN = 48;
const EDGE = 96;
const kept = { a: null, b: null, fbo: null, size: '', key: '', n: 0, spin: 0, swell: 0, d: [0, 0, 0] };
const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
// (Kept in half floats: finer than the screen's 8 bits, so the dither still
// has the soft gradients to work on, at half a full float's memory; both
// textures drawn by one pass, WEBGL_draw_buffers.)
const half = (() => {
  try {
    const h = gl && gl.getExtension('OES_texture_half_float');
    return h && gl.getExtension('OES_texture_half_float_linear') && gl.getExtension('EXT_color_buffer_half_float') ? h.HALF_FLOAT_OES : 0;
  } catch { return 0; }
})();
const mrt = (() => { try { return gl && gl.getExtension('WEBGL_draw_buffers'); } catch { return null; } })();
const keepOK = !!half && !!mrt;
// Every uniform the full picture's program is given, as last given, by
// name: the kept frame's program and the turning one are given the same.
const uniNow = new Map();
let locName = new Map();
if (gl) {
  for (const fn of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform2fv', 'uniform4fv', 'uniform1i', 'uniformMatrix3fv']) {
    const o = gl[fn].bind(gl);
    gl[fn] = (loc, ...args) => {
      const n = loc && locName.get(loc);
      if (n) uniNow.set(n, [o, args]);
      return o(loc, ...args);
    };
  }
}
const keepProgs = new Map();
let rp = null;
function given(e) {
  for (const [n, [o, args]] of uniNow) if (e.u[n]) o(e.u[n], ...args);
}
function turned(now, w, h, y0, y1, g, cover, mode) {
  if (T.atRest !== 'turned' || !keepOK || LOOK[T.look] || T.warp !== 'none' || g.up || tiltNow.some(Boolean) || mode >= 4.5 || needle.on || ripple.on) return false;
  const defs = variant();
  let kp = keepProgs.get(defs);
  try {
    if (!kp) keepProgs.set(defs, (kp = build(0, `${defs}#define KEEP3\n`)));
    if (!rp) {
      rp = build('turn', defs);
      for (const k of ['uTurn', 'uGain', 'uKept', 'uMul', 'uKeptSize', 'uKeptM']) rp.u[k] = gl.getUniformLocation(rp.p, k);
    }
  } catch (err) {
    console.warn('hero-fx:', err);
    T.atRest = 'full';
    return false;
  }
  const t = turnNow;
  // (Everything that sets the picture, but the turn and the swell.)
  const key = JSON.stringify([w, h, y0, y1, box.w, cover, g.cx, g.cy, g.d0, g.tilt, g.r0, g.R, g.hz, g.out, g.top, holesNow.count, Array.from(holesNow.list), holesNow.r, shown, T, hover.on > 0.01 ? hover : 0]);
  // (The lamp, its cone and the glints must be turning with the disc.)
  const d = [wrapA(t.facing - t.spin), wrapA(t.cone - t.spin), wrapA(t.glint - t.spin)];
  const turn = wrapA(t.spin - kept.spin);
  // (The disc's rim, where the page is nearest, moves g.out / f CSS px a
  // radian, f the perspective's scale at the canvas's foot.)
  const fFoot = g.d0 / Math.max(1, box.h + g.hz);
  const most = (Math.min(MARGIN, EDGE / (w / box.w)) * fFoot) / Math.max(1, g.out);
  const fresh = key !== kept.key || ++kept.n >= KEEP || Math.abs(turn) > most || d.some((v, i) => Math.abs(v - kept.d[i]) > 1e-5);
  const W = w + 2 * EDGE, H = h + 2 * EDGE;
  if (fresh) {
    if (kept.size !== `${W}x${H}`) {
      if (!kept.a) { kept.a = gl.createTexture(); kept.b = gl.createTexture(); kept.fbo = gl.createFramebuffer(); }
      for (const tx of [kept.a, kept.b]) {
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, half, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, kept.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, mrt.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, kept.a, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, mrt.COLOR_ATTACHMENT1_WEBGL, gl.TEXTURE_2D, kept.b, 0);
      mrt.drawBuffersWEBGL([mrt.COLOR_ATTACHMENT0_WEBGL, mrt.COLOR_ATTACHMENT1_WEBGL]);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) { kept.size = ''; T.atRest = 'full'; return false; }
      kept.size = `${W}x${H}`;
    }
    // The full picture, without the dust, the holes and the dither, and
    // with the app's screen's edge kept a margin in; and the dust's part.
    gl.useProgram(kp.p);
    given(kp);
    gl.uniform2f(kp.u.uOrigin, EDGE, EDGE);
    const m = cover[2] > cover[0] ? MARGIN : 0;
    gl.uniform4f(kp.u.uCover, cover[0] + m, cover[1] + m, cover[2] - m, cover[3] - m);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, kept.fbo);
    gl.viewport(0, 0, W, H);
    gl.scissor(0, H - EDGE - Math.max(y0, y1) - EDGE, W, Math.max(0, y1 - y0) + 2 * EDGE);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.scissor(0, h - Math.max(y0, y1), w, Math.max(0, y1 - y0));
    Object.assign(kept, { key, n: 0, spin: t.spin, swell: t.swell, d });
  }
  const u = rp.u;
  gl.useProgram(rp.p);
  given(rp);
  gl.uniform1f(u.uTurn, wrapA(t.spin - kept.spin));
  gl.uniform1f(u.uGain, (1 + 0.08 * t.swell) / (1 + 0.08 * kept.swell));
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, kept.a);
  gl.uniform1i(u.uKept, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, kept.b);
  gl.uniform1i(u.uMul, 1);
  gl.uniform2f(u.uKeptSize, W, H);
  gl.uniform1f(u.uKeptM, EDGE);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(prog);
  return true;
}

// RELIT: the record drawn each frame from a layer baked once.
// Most of what the full picture works out depends only on where a pixel
// lies on the disc: which groove, which song and where in it, the grooves'
// filtering to the pixel. Turning the disc, the lamp, the glints, the
// pointer's light, the needle and the scroll's twist change none of it,
// only the light laid on it. So that part is baked into two half-float
// textures the canvas's size (BAKE, the full picture's own sums), redone
// only when the record's place, shape, grooves or songs change (the
// layout, a slider for those, the window), and each frame (RELIT) reads it
// back and works out the light: the full picture's own code, minus its two
// costliest loops. The dust is drawn on top as sprites (DUST_VS, DUST_FS),
// each speck where it lies now and only its own pixels, worked out as
// natDust works it out. Anything that bends the disc per frame (the drag's
// or the pointer's tilt, the glass, the top's warps) takes the full path;
// so do the other styles.
const lit = { s0: null, s1: null, s2: null, fbo: null, fbo2: null, bake2: null, fast: null, size: '', key: '', bake: null, comp: null, dust: null, defs: '', specks: null, nSpecks: 0, rows: 0, cone: null, glints: null, coneKey: '', glintKey: '' };
// The two small tables the light is read from (CONE_FS, GLINT_FS), redone
// only when what shapes them changes: the cone's width, edges and sides;
// the songs, and the glints' size, sharpness, count, colour and spread.
function table(name, w, h, wrapS, key) {
  const e = lit[name] || (lit[name] = { tx: gl.createTexture(), fb: gl.createFramebuffer(), key: '', p: null, defs: '' });
  if (!e.p || e.defs !== lit.defs) {
    const b = build(name, lit.defs);
    e.p = b.p;
    e.u = b.u;
    e.defs = lit.defs;
    e.key = '';
    gl.bindTexture(gl.TEXTURE_2D, e.tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, half, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tx, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  if (e.key !== key) {
    gl.useProgram(e.p);
    given(e);
    gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    e.key = key;
  }
  return e.tx;
}
// (The uniforms the baked layer depends on, by name.)
const BAKED = ['uSize', 'uDpr', 'uCentre', 'uGeo', 'uSpan', 'uOuter', 'uGroove', 'uTracks', 'uTrackCount', 'uWarp', 'uLens', 'uHz', 'uTilt', 'uCover'];
function relit(w, h, g, cover, mode) {
  // (The glass bends the grooves under the pointer, and a tilt the whole
  // disc, each frame: those take the full path. The hovers that move the
  // lamp, its cone, the glints or their colour only change the light.)
  if (T.atRest !== 'relit' || !keepOK || LOOK[T.look] || T.warp !== 'none' || g.up || tiltNow.some(Boolean) || (mode > 4.5 && mode < 6.5)) return false;
  const defs = variant();
  try {
    if (lit.defs !== defs) {
      lit.bake = build(0, `${defs}#define BAKE\n`);
      lit.bake2 = build(0, `${defs}#define BAKE2\n`);
      lit.comp = build(0, `${defs}#define RELIT\n`);
      lit.fast = build('fast', defs);
      lit.dust = build('dust', defs);
      for (const e of [lit.comp, lit.fast, lit.dust]) for (const k of ['uSt0', 'uSt1', 'uSt2', 'uConeT', 'uGlT']) e.u[k] = gl.getUniformLocation(e.p, k);
      lit.defs = defs;
      lit.key = '';
    }
  } catch (err) {
    console.warn('hero-fx:', err);
    T.atRest = 'turned';
    return false;
  }
  if (lit.size !== `${w}x${h}`) {
    if (!lit.s0) { lit.s0 = gl.createTexture(); lit.s1 = gl.createTexture(); lit.s2 = gl.createTexture(); lit.fbo = gl.createFramebuffer(); lit.fbo2 = gl.createFramebuffer(); }
    gl.bindTexture(gl.TEXTURE_2D, lit.s2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lit.fbo2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lit.s2, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (const tx of [lit.s0, lit.s1]) {
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, half, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lit.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, mrt.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, lit.s0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, mrt.COLOR_ATTACHMENT1_WEBGL, gl.TEXTURE_2D, lit.s1, 0);
    mrt.drawBuffersWEBGL([mrt.COLOR_ATTACHMENT0_WEBGL, mrt.COLOR_ATTACHMENT1_WEBGL]);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { T.atRest = 'turned'; return false; }
    lit.size = `${w}x${h}`;
    lit.key = '';
  }
  // Bake, when anything it depends on has changed. (The whole canvas, not
  // just the strip on screen, so scrolling never needs it again.)
  const key = JSON.stringify(BAKED.map((n) => uniNow.get(n)?.[1]).concat([T.contrast, T.satin, T.lineW, T.pitch, T.pitchOut, T.coneReach, style]));
  if (key !== lit.key) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(lit.bake.p);
    given(lit.bake);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lit.fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(lit.bake2.p);
    given(lit.bake2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lit.fbo2);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST);
    lit.key = key;
  }
  const u = (n) => JSON.stringify(uniNow.get(n)?.[1]);
  const coneT = table('cone', 2048, 1, gl.REPEAT, [u('uCone').replace(/^\[\[?-?[\d.e-]+,/, '['), u('uConeEdge'), u('uConeTint')].join());
  const glT = table('glints', 256, 2048, gl.CLAMP_TO_EDGE, [u('uTracks'), u('uTrackCount'), u('uGlintShape').replace(/,[^,\]]*\]+$/, ']'), u('uGlintSpread'), u('uChroma')].join());
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, lit.s0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lit.s1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, coneT);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, glT);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, lit.s2);
  // (At rest, with the usual look, the lighter pass: FAST.)
  const passing = uniNow.get('uHover')?.[1][2] || uniNow.get('uNeedle')?.[1][1] || uniNow.get('uRipple')?.[1][1];
  const pal = CHROMA[T.chroma] ?? 0;
  const e = !passing && T.cue !== 'dust' && (pal === 0 || pal === 3) && T.finish !== 'chromatic' && !(T.flecks > 0) ? lit.fast : lit.comp;
  gl.useProgram(e.p);
  given(e);
  gl.uniform1i(e.u.uSt0, 0);
  gl.uniform1i(e.u.uSt1, 1);
  gl.uniform1i(e.u.uConeT, 2);
  gl.uniform1i(e.u.uGlT, 3);
  gl.uniform1i(e.u.uSt2, 4);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The dust, over it.
  if ((T.dust ?? 0) > 0 && specks(g)) {
    gl.useProgram(lit.dust.p);
    given(lit.dust);
    gl.uniform1i(lit.dust.u.uSt0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, lit.specks);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, lit.nSpecks * 6);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
  }
  for (const k of [4, 3, 2, 1, 0]) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, null); }
  gl.useProgram(prog);
  return true;
}
// The cells that may hold a speck, out to the rim (for any amount of
// dust): found once on the GPU (SPECKS_FS) and read back, then one quad
// (two triangles) each.
function specks(g) {
  const rows = Math.ceil(Math.max(g.out, g.top) / 9) + 3;
  if (lit.specks && rows <= lit.rows) return true;
  try {
    const sp = build('specks', variant());
    const W = Math.ceil(2 * Math.PI * (rows + 0.5)) + 4;
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
    gl.useProgram(sp.p);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, W, rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(W * rows * 4);
    gl.readPixels(0, 0, W, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tx);
    gl.deleteProgram(sp.p);
    const v = [];
    const C = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    for (let row = 0; row < rows; row++) {
      // (natDust's columns: 0 to the last whole one round, and one either side.)
      const last = Math.floor(2 * Math.PI * (row + 0.5)) + 1;
      for (let col = -1; col <= last; col++) {
        if (!px[(row * W + col + 1) * 4]) continue;
        for (let k = 0; k < 12; k += 2) v.push(row, col, C[k], C[k + 1]);
      }
    }
    if (!lit.specks) lit.specks = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lit.specks);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    lit.nSpecks = v.length / 24;
    lit.rows = rows;
    gl.useProgram(prog);
    return true;
  } catch (err) {
    console.warn('hero-fx:', err);
    T.atRest = 'turned';
    gl.useProgram(prog);
    return false;
  }
}

function draw(now) {
  nap = 0;
  resting = false;
  if (!running) return;
  if (reduced.matches || !visible) {
    running = false;
    // Stopping: the last frame left showing is a still one, with nothing
    // passing lit in it.
    frame(now, true);
    return;
  }
  // At rest (no pointer light, no needle) the record only turns slowly, so
  // 30 frames a second is plenty; the pointer's light gets the full 60.
  const busy = hover.on > 0.01 || needle.on || ripple.on || fx.moving || twist !== twistTo() || drag.on || drag.x !== 0 || drag.y !== 0;
  // (On the first frame of each 30th of a second on the wall clock, the
  // same frames the app in the screen draws on, app/demo/pause.js.)
  // (And busy, never more than 60 a second: a 120Hz screen would otherwise
  // draw the record twice as often again, for a light that already looks
  // smooth at 60.)
  // (Busy, it draws unless it drew under 12ms ago: every frame at 60Hz,
  // every other one at 120Hz.)
  const fps = T.fps;
  // (The slot is read from the clock as this runs, not the frame's own
  // time, which can be from just before the slot began: the frame woken for
  // a new slot is then always counted in it.)
  const slot = Math.floor(((performance.timeOrigin + Math.max(now, performance.now())) * fps) / 1000);
  // (Busy at 30, it draws on the same 30ths of a second as the app, so the
  // page composites once for both; at 60 it draws unless it drew under 12ms
  // ago, every frame at 60Hz and every other one at 120Hz.)
  const bslot = Math.floor(((performance.timeOrigin + Math.max(now, performance.now())) * T.busyFps) / 1000);
  if (busy ? (T.busyFps >= 60 ? now - lastDraw > 12 : bslot !== lastBusySlot) : paced ? now - lastDraw > 1000 / fps - 8 : slot !== lastSlot) {
    lastSlot = slot;
    lastBusySlot = bslot;
    lastDraw = now;
    restNow = !busy;
    frame(now, false);
    restNow = false;
  }
  if (busy) {
    requestAnimationFrame(draw);
    return;
  }
  if (paced) {
    resting = true;
    nap = setTimeout(() => { nap = 0; resting = false; requestAnimationFrame(draw); }, 100);
    return;
  }
  // At rest: sleep until just after the next slot begins, then take one
  // frame (the first of that slot: waking any earlier could land on the
  // last frame of this one and need a second).
  const wait = ((slot + 1) * 1000) / fps - (performance.timeOrigin + performance.now()) + 1;
  nap = setTimeout(() => { nap = 0; requestAnimationFrame(draw); }, Math.max(0, wait));
}

// The page's mask (style.css) fades the canvas's top 230px out: clear at
// the very top, 0.06 at 60px, 0.5 at 140px, full at 230px. Moved here, the
// same curve is laid between fadeAt - fadeLen and fadeAt, clear above it,
// so the very top is always clear and the fade is always a ramp, never an
// edge. (Its defaults are style.css's own, left to it.) fxTop: the app's
// screen, which it never reaches past.
// The canvas's mask, top to bottom: the fade at the very top (fadeAt,
// fadeLen), full behind the words, a step quieter beside the app (bfMid),
// then the fade out at the foot. The foot's fade (Hero record: bottom fade)
// starts bfStart px from the next section's heading and is gone by bfEnd px
// from it (minus is above), along a curve (bfCurve); as a line straight
// across, or radial: an ellipse round the app's middle, bfWidth of the
// page wide, centred bfCentre px below the app's top, so the record goes
// first at the corners and last straight down.
const CURVES = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) ** 2,
  in: (t) => t * t,
  long: (t) => 1 - (1 - t) ** 3,
};
function topFade(fxTop, fxMid, fxEnd, w) {
  const y1 = Math.max(8, Math.min(T.fadeAt, fxTop));
  const len = Math.max(8, Math.min(T.fadeLen, y1));
  const at = (f) => `${(y1 - len + len * f).toFixed(1)}px`;
  const mid = T.bfMid;
  const topPart = `linear-gradient(to bottom, transparent 0, transparent ${at(0)}, rgb(0 0 0 / 0.06) ${at(60 / 230)}, rgb(0 0 0 / 0.5) ${at(140 / 230)}, #000 ${at(1)}, #000 ${fxTop}px, rgb(0 0 0 / ${mid}) ${fxMid}px, rgb(0 0 0 / ${mid}) 100%)`;
  const a = fxEnd + Math.min(T.bfStart, T.bfEnd - 1);
  const b = fxEnd + T.bfEnd;
  const ease = CURVES[T.bfCurve] || CURVES.linear;
  const N = T.bfCurve === 'linear' ? 1 : 10;
  let foot;
  if (T.bfShape === 'radial') {
    // Along the ellipse's ray: 0 at its centre, 100% where it ends (b).
    const cy = fxTop + T.bfCentre;
    const ry = Math.max(10, b - cy);
    const k = Math.max(0.05, Math.min(1, (a - cy) / ry));
    // (Never narrower than keeps the page's edges inside its solid middle
    // at the centre's height, or the switch from all-showing above would
    // show as a line there.)
    const rx = Math.max(w * T.bfWidth, (w / 2) / k * 1.02);
    const stops = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return `rgb(0 0 0 / ${(1 - ease(t)).toFixed(3)}) ${((k + (1 - k) * t) * 100).toFixed(2)}%`; });
    // (Only below its centre: above it, all of the record shows.)
    foot = `radial-gradient(${rx.toFixed(0)}px ${ry.toFixed(0)}px at 50% ${cy.toFixed(0)}px, #000 0, ${stops.join(', ')}), linear-gradient(to bottom, #000 ${cy.toFixed(0)}px, transparent ${cy.toFixed(0)}px)`;
  } else {
    const stops = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return `rgb(0 0 0 / ${(1 - ease(t)).toFixed(3)}) ${(a + (b - a) * t).toFixed(1)}px`; });
    foot = `linear-gradient(to bottom, #000 0, ${stops.join(', ')})`;
  }
  canvas.style.setProperty('-webkit-mask-image', `${topPart}, ${foot}`);
  canvas.style.setProperty('mask-image', `${topPart}, ${foot}`);
  const radial = T.bfShape === 'radial';
  canvas.style.setProperty('-webkit-mask-composite', radial ? 'source-in, source-over' : 'source-in');
  canvas.style.setProperty('mask-composite', radial ? 'intersect, add' : 'intersect');
}

// The glints' colours turned round the colour wheel by t radians (about
// the grey axis, so white stays white), as a matrix for the shader.
function hueTurn(t) {
  const c = Math.cos(t);
  const s = Math.sin(t) / Math.sqrt(3);
  const o = (1 - c) / 3;
  // (Column by column.)
  return [c + o, o + s, o - s, o - s, c + o, o + s, o + s, o - s, c + o];
}

// The lamp's cone. Its edges were set on cos^4 of the angle from the lamp
// (0.78 to 0.84, a cone 36.8 degrees across with edges 3.2 degrees soft):
// the angle is scaled so its width can change, and the edges laid where the
// softness puts them.
const CONE_OUT = Math.acos(0.78 ** 0.25);
const CONE_IN = Math.acos(0.84 ** 0.25);
const CONE_W = CONE_OUT + CONE_IN;          // across, radians
function coneShape() {
  if (Math.abs(T.coneW - 36.8) < 1e-6 && Math.abs(T.coneSoft - 3.2) < 1e-6) return { scale: 1, lo: 0.78, hi: 0.84 };
  const w = Math.max(0.5, T.coneW) * (Math.PI / 180);
  const scale = CONE_W / w;
  const soft = Math.max(0.05, T.coneSoft) * (Math.PI / 180);
  const c4 = (x) => Math.cos(Math.min(Math.PI / 2, Math.max(0, x * scale))) ** 4;
  const lo = c4(w / 2 + soft / 2);
  return { scale, lo, hi: Math.max(lo + 1e-4, c4(w / 2 - soft / 2)) };
}

// The hovers that move the record's own light: what the pointer asks of
// each (only while it's on the record and moving; otherwise nothing, so
// all of it drifts back), then each moved toward that on a critically
// damped spring that settles in about T.hFollow seconds, in small steps.
// At rest it lies at exactly nothing and costs nothing.
const ZERO_FX = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
const halfWrap = (x) => Math.atan2(Math.sin(2 * x), Math.cos(2 * x)) / 2;
const fullWrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
function stepMovers(movers, reach, ha, lampAt, g, dt) {
  const w = fx.want;
  for (const k of FX_KEYS) w[k] = 0;
  if (movers && reach) {
    // Across the page from the record's centre, and down from the top to
    // the app's screen, each -1..1.
    const nx = clamp1((hover.x - g.cx) / g.half);
    const ny = clamp1((hover.y - g.box.t / 2) / Math.max(1, g.box.t / 2));
    if (movers.includes('light')) {
      // The lamp swings toward the pointer (its light falls either side of
      // the centre, so the nearer side turns to it).
      w.light = halfWrap(ha - lampAt) * T.hLight;
    }
    if (movers.includes('cone')) {
      const to = ha - (lampAt + (T.coneDir * Math.PI) / 180);
      w.cone = (T.cones === 'one' ? fullWrap(to) : halfWrap(to)) * T.hCone;
    }
    if (movers.includes('angle')) {
      w.phase = 0.9 * T.hAngle * nx;
      w.spread = -0.6 * T.hAngle * ny;
    }
    if (movers.includes('colour')) w.hue = Math.PI * T.hHue * nx;
    if (movers.includes('tilt')) { w.tx = T.hTilt * nx; w.ty = T.hTilt * ny; }
  }
  const om = 5 / Math.max(0.05, T.hFollow);
  let moving = false;
  for (const k of FX_KEYS) {
    let p = fx.at[k];
    let v = fx.v[k];
    if (p === w[k] && v === 0) { if (p !== 0) moving = true; continue; }
    for (let s = 0, n = Math.ceil(dt / (1 / 240)); s < n; s++) {
      const h = dt / n;
      v += (om * om * (w[k] - p) - 2 * om * v) * h;
      p += v * h;
    }
    if (Math.abs(p - w[k]) < 1e-4 && Math.abs(v) < 1e-3) { p = w[k]; v = 0; }
    fx.at[k] = p;
    fx.v[k] = v;
    if (p !== w[k] || v !== 0 || p !== 0) moving = true;
  }
  fx.moving = moving;
}

// Tune. The style comes first; then the rest in folders, each control only
// in the panel while it does something to the style picked (or to what's
// picked above it): the vinyl's own controls, the spin cue's and dust's,
// the lamp colour and the render resolution belong to the vinyl style; the
// glints to it and the styles that draw them too (GLINTY); everything else
// works in every style, each drawing it its own way (see LOOKS and
// hoverField). Labels are what the panel saves values under, so they stay.
const tune = window.tune;
// The panel's controls, each onInput counted (see counting).
const counted = (f) => f && ((o) => f({ ...o, onInput: (v) => { counting(); o.onInput?.(v); } }));
const tw = tune && { ...tune, slider: counted(tune.slider), select: counted(tune.select), color: counted(tune.color) };
const again = () => { geo = null; measured = 0; wake(); };
const redraw = (k) => (v) => { T[k] = v; if (prog) wake(); };
const reshape = (k) => (v) => { T[k] = v; if (prog) again(); };
const panel = () => tune?.refresh?.('Hero record');
// ...and the panel follows it.
const thenPanel = (f) => (v) => { f(v); panel(); };
const cur = () => T.look === 'vinyl';
const GLINTY = new Set(['vinyl', 'orbit', 'bauhaus']);
const glinty = () => GLINTY.has(T.look);

// Presets: a select that sets several controls together, the panel's
// sliders following (with an older tune.js, only the record does); moving
// one of them by hand afterwards shows Custom. Each preset's values sit on
// its sliders' steps, so the panel's echo of them matches.
const sameColour = (a, b) => rgbOf(a).every((x, i) => Math.abs(x - rgbOf(b)[i]) < 1 / 255);
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6
  : typeof a === 'string' && typeof b === 'string' && /^#|\(/.test(a) && /^#|\(/.test(b) ? sameColour(a, b) : a === b);
// A preset only applies when it's picked by hand in the panel: the panel
// restoring its values (on load, or a saved version) sets many controls at
// once, and then nothing is applied or relabelled, so nothing it holds is
// ever overwritten. counting() counts the controls set in this go (every
// control's onInput calls it, see tw below); one alone is a hand.
let tick = null;
function counting() {
  if (!tick) {
    const t = { n: 0 };
    tick = t;
    setTimeout(() => { if (tick === t) tick = null; }, 0);
  }
  tick.n++;
  return tick;
}
function presets(key, label, list, labels) {
  const follow = (k, f) => (v) => {
    f(v);
    const t = tick;
    setTimeout(() => {
      if (t && t.n !== 1) return;
      const p = list[T[key]]?.[1];
      if (p && k in p && !same(p[k], v)) { T[key] = 'custom'; tune?.set?.(label, 'custom'); }
    }, 0);
  };
  const apply = (v) => {
    const p = list[v]?.[1];
    if (!p) return;
    Object.assign(T, p);
    if (prog) again();
    for (const [k, l] of labels) if (k in p) tune?.set?.(l, p[k]);
    panel();
  };
  const pick = (v) => {
    T[key] = v;
    const t = tick;
    setTimeout(() => { if (t && t.n === 1 && T[key] === v) apply(v); }, 0);
  };
  const options = [['custom', 'Custom'], ...Object.entries(list).map(([k, [t]]) => [k, t])];
  return { follow, pick, options, list };
}

// The vinyl style's presets. Dark vinyl is the original look exactly; the
// others are the same renderer with other settings.
const dark = { vinyl: '#1c1c20', finish: 'solid', body: 0, through: 0, cone: 0, wedge: 0, lineTint: 0, flecks: 0, pitch: 6, pitchOut: 8, lineW: 1, press: 1, contrast: 1, satin: 1, level: 1, sheen: 1, songLen: 1, cue: 'dust' };
// (cone: the lamp's light through the vinyl in its cone, which was part of
// "light through it", so the same.)
const VINYLS = {
  dark: ['Dark vinyl', dark],
  cherry: ['Tinted cherry', { ...dark, vinyl: '#eb1a3d', body: 0.3, wedge: 1, lineTint: 1, flecks: 1, pitch: 5, pitchOut: 0, press: 0, satin: 0.3, level: 0.9, sheen: 0, cue: 'glints' }],
  smoked: ['Smoked black (translucent)', { ...dark, vinyl: '#5a5550', body: 0.08, through: 1, cone: 1, wedge: 0.6, lineTint: 0.6, flecks: 0.8, sheen: 0.6, cue: 'glints' }],
  smokedcherry: ['Smoked cherry', { ...dark, vinyl: '#eb1a3d', body: 0.06, through: 1, cone: 1, wedge: 0.7, lineTint: 1, flecks: 0.8, sheen: 0.6, cue: 'glints' }],
  clear: ['Clear (frosted)', { ...dark, vinyl: '#cfe3ee', body: 0.04, through: 0.4, cone: 0.4, wedge: 1, lineTint: 0.4, flecks: 0.6, pitch: 5, pitchOut: 4, satin: 0.6, sheen: 0.5, cue: 'glints' }],
  oilslick: ['Oil slick (chromatic)', { ...dark, vinyl: '#202028', finish: 'chromatic', body: 0.06, through: 1, cone: 1, wedge: 0.8, lineTint: 1, flecks: 0.8, sheen: 0.6, cue: 'glints' }],
};
const VINYL_LABELS = [['vinyl', 'Hero record: vinyl colour'], ['finish', 'Hero record: vinyl finish'], ['body', 'Hero record: vinyl body'], ['through', 'Hero record: light through it'], ['cone', 'Hero record: cone glow'], ['wedge', 'Hero record: cone grooves'], ['lineTint', 'Hero record: grooves in its colour'], ['flecks', 'Hero record: flecks'], ['pitch', 'Hero record: groove spacing'], ['pitchOut', 'Hero record: spacing opens out by the rim'], ['lineW', 'Hero record: groove line width'], ['press', 'Hero record: pressing warp'], ['contrast', 'Hero record: groove contrast'], ['satin', 'Hero record: song bands'], ['level', 'Hero record: groove brightness'], ['sheen', 'Hero record: sheen'], ['songLen', 'Hero record: song length'], ['cue', 'Hero record: what shows the spin']];
const vinylP = presets('vinylPreset', 'Hero record: vinyl preset', VINYLS, VINYL_LABELS);

// A panel saved before the Glints and Lamp folders: before the controls
// are made, each new control with no value of its own yet (in the panel's
// values, its base values and each saved version) takes it from the old
// ones that did its job there, so the record and every version look as
// they did. (DialKit would otherwise give it its default.) Nothing else is
// touched: no value already there changes, and the old controls are kept,
// hidden, so tune.js keeps their values by rather than DialKit dropping them.
// - glint brightness: the soft glints' strength, plus (with the glints
//   showing the spin) the glints mode's strength times the spin cue's, all
//   times the grooves' brightness (which no longer touches the glints);
// - glint colour and its amount: as they were;
// - cone glow: "light through it" (which lit the cone too, and now lights
//   the vinyl evenly); cone grooves: "lamp wedges"; lamp colour: moved;
// - top fade starts at: where the old mask was fully shown.
// ("Soft glints" showing the spin is now the same as the glints alone.)
(function migrate() {
  if (!tune?.shown) return;
  const KEY = 'dialkit:interlude-Hero record';
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved?.values) return;
    // (What tune.js keeps by for hidden controls: the values, by version, and the base's.)
    const kept = JSON.parse(localStorage.getItem('tune-hidden:interlude-Hero record') || 'null') || {};
    let changed = false;
    // vs: one set of values (the panel's, its base's or a saved version's);
    // also: what's kept by for it.
    const fill = (vs, also) => {
      if (!vs) return;
      const get = (folder, name) => vs[`${folder}.${name}`] ?? vs[name] ?? also?.[`${folder}.${name}`] ?? also?.[name];
      // Only a new control's value, only where it has none.
      const put = (path, v) => { if (vs[path] === undefined && also?.[path] === undefined && v !== undefined) { vs[path] = v; changed = true; } };
      const cue = get('Look', 'what shows the spin') ?? 'dust';
      const soft = get('Look', 'soft glints strength');
      const more = get('Look', 'glints mode strength');
      if (soft !== undefined || more !== undefined) {
        const extra = cue === 'glints' ? 1.2 * (more ?? 1) * (get('Look', 'spin cue strength') ?? 1) : 0;
        const level = ['vinyl', 'current', 'tinted'].includes(vs.style ?? 'vinyl') ? get('Vinyl', 'groove brightness') ?? 1 : 1;
        put('Glints.glint brightness', Math.round(((soft ?? 1) + extra) * level * 100) / 100);
      }
      put('Glints.glint colour', get('Look', 'glint colour'));
      put('Glints.colour amount', get('Look', 'glint colour amount'));
      put('Lamp.cone grooves', get('Vinyl', 'lamp wedges'));
      put('Lamp.cone glow', get('Vinyl', 'light through it'));
      put('Lamp.lamp colour (sides)', get('Look', 'lamp colour'));
      const mask = get('Layout', 'show to the top (mask)');
      if (mask !== undefined) put('Layout.top fade starts at (px)', Math.round((230 * (1 - 0.8 * mask)) / 2) * 2);
    };
    fill(saved.values, kept);
    fill(saved.baseValues, kept.__b);
    for (const pr of saved.presets || []) fill(pr.values, kept.__p?.[pr.id]);
    if (changed) localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}
})();

// ?record=orbit (or any style's name) in the address picks one over the
// panel, for testing. The vinyl style was once two, 'current' (dark vinyl)
// and 'tinted' (cherry): their names, saved or in the address, still work.
const OLD = { current: 'dark', tinted: 'cherry' };
let forced = new URLSearchParams(location.search).get('record');
if (forced in OLD) { Object.assign(T, VINYLS[OLD[forced]][1], { vinylPreset: OLD[forced] }); forced = 'vinyl'; }
tw?.select({ label: 'Hero record: style', value: T.look, options: STYLE_LIST.map(([k, t]) => [k, t]),
  onInput: (v) => {
    if (v in OLD) {
      setTimeout(() => tune?.set?.('Hero record: style', 'vinyl'), 0);
      v = 'vinyl';
    }
    T.look = forced in LOOK ? forced : v in LOOK ? v : 'vinyl';
    if (prog) again();
    panel();
  } });

const vin = { folder: 'Vinyl', show: cur };
const vf = (k, f = redraw(k)) => vinylP.follow(k, f);
tw?.select({ ...vin, label: 'Hero record: vinyl preset', value: T.vinylPreset, options: vinylP.options, onInput: vinylP.pick });
tw?.color({ ...vin, label: 'Hero record: vinyl colour', value: T.vinyl, onInput: vf('vinyl') });
tw?.select({ ...vin, label: 'Hero record: vinyl finish', value: T.finish, onInput: vf('finish'), options: [['solid', 'Solid colour'], ['chromatic', 'Chromatic (oil slick)']] });
tw?.slider({ ...vin, label: 'Hero record: vinyl body', min: 0, max: 0.6, step: 0.01, value: T.body, onInput: vf('body') });
// (Now an even glow through the whole vinyl; its light in the cone is the Lamp's cone glow.)
tw?.slider({ ...vin, label: 'Hero record: light through it', min: 0, max: 2, step: 0.05, value: T.through, onInput: vf('through') });
tw?.slider({ ...vin, label: 'Hero record: grooves in its colour', min: 0, max: 1, step: 0.05, value: T.lineTint, onInput: vf('lineTint') });
tw?.slider({ ...vin, label: 'Hero record: flecks', min: 0, max: 2, step: 0.05, value: T.flecks, onInput: vf('flecks') });
tw?.slider({ ...vin, label: 'Hero record: groove spacing', min: 2, max: 16, step: 0.5, value: T.pitch, unit: 'px', onInput: vf('pitch') });
tw?.slider({ ...vin, label: 'Hero record: spacing opens out by the rim', min: 0, max: 16, step: 0.5, value: T.pitchOut, unit: 'px', onInput: vf('pitchOut') });
tw?.slider({ ...vin, label: 'Hero record: groove line width', min: 0.5, max: 3, step: 0.05, value: T.lineW, onInput: vf('lineW') });
tw?.slider({ ...vin, label: 'Hero record: groove contrast', min: 0, max: 2, step: 0.05, value: T.contrast, onInput: vf('contrast') });
tw?.slider({ ...vin, label: 'Hero record: groove brightness', min: 0.2, max: 3, step: 0.05, value: T.level, onInput: vf('level') });
tw?.slider({ ...vin, label: 'Hero record: song bands', min: 0, max: 2, step: 0.05, value: T.satin, onInput: vf('satin') });
tw?.slider({ ...vin, label: 'Hero record: song length', min: 0.4, max: 3, step: 0.05, value: T.songLen, onInput: vf('songLen', reshape('songLen')) });
tw?.slider({ ...vin, label: 'Hero record: sheen', min: 0, max: 3, step: 0.05, value: T.sheen, onInput: vf('sheen') });
tw?.slider({ ...vin, label: 'Hero record: pressing warp', min: 0, max: 3, step: 0.05, value: T.press, onInput: vf('press') });

const look = { folder: 'Look' };
const extraCue = () => !cur() || ['dust', 'warp', 'spokes'].includes(T.cue);
tw?.select({ ...look, label: 'Hero record: what shows the spin', value: T.cue, show: cur,
  // (The soft glints are now the same as the glints alone; kept so a panel
  // or version saved with them still loads as that, not as the specks.)
  onInput: vf('cue', thenPanel(redraw('cue'))),
  options: [['glints', 'Glints alone'], ['dust', 'Dust specks'], ['warp', 'Warp shimmer'], ['spokes', 'Spokes'], ['soft', 'Glints alone (soft)']] });
// (The spin cue's strength: the specks', the warp's or the spokes' (the
// glints have their own brightness); in the other styles, how much their
// own moving parts show.)
tw?.slider({ ...look, label: 'Hero record: spin cue strength', min: 0, max: 3, step: 0.05, value: T.cueAmt, show: extraCue, onInput: redraw('cueAmt') });
// Natural dust, on top of whatever shows the spin: how much, and how it
// looks (size down to a few tenths of a pixel, how soft, its glow, how
// bright, how much it needs the lamp's light to show, how mixed its sizes
// are, how many fibres).
const dustOn = () => cur() && T.dust > 0;
tw?.slider({ ...look, label: 'Hero record: natural dust', min: 0, max: 1, step: 0.05, value: T.dust, show: () => cur(), onInput: (v) => { const was = T.dust > 0; redraw('dust')(v); if (was !== v > 0) panel(); } });
tw?.slider({ ...look, label: 'Hero record: dust size', min: 0.05, max: 4, step: 0.05, value: T.dustSize, show: dustOn, onInput: redraw('dustSize') });
tw?.slider({ ...look, label: 'Hero record: dust softness', min: 0, max: 1, step: 0.05, value: T.dustSoft, show: dustOn, onInput: redraw('dustSoft') });
tw?.slider({ ...look, label: 'Hero record: dust brightness', min: 0, max: 3, step: 0.05, value: T.dustBright, show: dustOn, onInput: redraw('dustBright') });
tw?.slider({ ...look, label: 'Hero record: dust glow', min: 0, max: 3, step: 0.05, value: T.dustGlow, show: dustOn, onInput: redraw('dustGlow') });
tw?.slider({ ...look, label: 'Hero record: dust glow size', min: 0.3, max: 4, step: 0.05, value: T.dustGlowSize, show: dustOn, onInput: redraw('dustGlowSize') });
tw?.slider({ ...look, label: 'Hero record: dust only in the light', min: 0, max: 1, step: 0.05, value: T.dustLight, show: dustOn, onInput: redraw('dustLight') });
tw?.slider({ ...look, label: 'Hero record: dust size variety', min: 0, max: 1, step: 0.05, value: T.dustVariety, show: dustOn, onInput: redraw('dustVariety') });
tw?.slider({ ...look, label: 'Hero record: dust fibres', min: 0, max: 1, step: 0.05, value: T.dustFibres, show: dustOn, onInput: redraw('dustFibres') });
tw?.select({ ...look, label: 'Hero record: speck style', value: T.speck, show: () => cur() && T.cue === 'dust', onInput: redraw('speck'), options: [['hyphen', 'Dashes (first)'], ['motes', 'Dust motes'], ['scratches', 'Hairline scratches'], ['scuffs', 'Scuffs'], ['sparkle', 'Sparkle'], ['lint', 'Lint'], ['smudge', 'Smudges']] });
tw?.slider({ ...look, label: 'Hero record: render resolution', min: 0.3, max: 1, step: 0.05, value: T.res, show: () => !STYLE[T.look]?.crisp, onInput: reshape('res') });
tw?.select({ ...look, label: 'Hero record: frames a second while the pointer moves it', value: String(T.busyFps), options: [['30', '30 (on the app\'s frames)'], ['60', '60']], onInput: (v) => { T.busyFps = +v; } });
tw?.slider({ ...look, label: 'Hero record: frames a second at rest', min: 10, max: 30, step: 1, value: T.fps, onInput: (v) => { T.fps = v; } });
// How each frame is drawn: relit from the layer baked once (RELIT, the
// default: the same picture to a level, at rest and while the pointer, the
// needle or a scroll moves it); turned on from a full one at rest
// (REPROJECT, within a few levels); or each worked out in full, the old path.
tw?.select({ ...look, label: 'Hero record: frames at rest', value: T.atRest, options: [['relit', 'Relit from a layer baked once (lightest)'], ['turned', 'Turned on from a full one (lighter)'], ['full', 'Each worked out in full']], onInput: (v) => { T.atRest = v; kept.key = ''; lit.key = ''; wake(); } });

// GLINTS: in each song a few short runs of groove catch the lamp, fixed on
// the disc and going round, brightest as they pass through the lamp's
// light. Each control here does one thing to them:
// - brightness: how bright they are, and nothing else;
// - size: how big each one is, along its groove and across its song;
// - sharpness: their edge, soft (long tails, a haze) to crisp (a flat top
//   with a quick edge); their size stays;
// - per turn: how many there are in each song, round one turn;
// - turn with the disc: how fast they go round, as a share of the disc's
//   own turn: 0 stays put under the lamp, 1 turns with the disc, more runs
//   ahead of it so the turn reads even when the record turns slowly;
// - colour: their palette (see CHROMA);
// - colour spread: how far its colours fan apart across a glint (the prism's
//   split, the rainbow's width);
// - colour amount: how much of the glint is colour rather than white;
// - colour hue: the palette turned round the colour wheel.
// The pointer's lights (lamp, prism, spectrum, arc in lamp light, glass)
// are painted with the same palette, spread, amount, hue and sharpness.
const gl0 = { folder: 'Glints', show: glinty };
const coloured = () => glinty() && T.chroma !== 'none';
tw?.slider({ ...gl0, label: 'Hero record: glint brightness', min: 0, max: 6, step: 0.01, value: T.glints, onInput: redraw('glints') });
tw?.slider({ ...gl0, label: 'Hero record: glint size', min: 0.3, max: 3, step: 0.05, value: T.gSize, onInput: redraw('gSize') });
tw?.slider({ ...gl0, label: 'Hero record: glint sharpness', min: 0.4, max: 4, step: 0.05, value: T.gSharp, onInput: redraw('gSharp') });
tw?.slider({ ...gl0, label: 'Hero record: glints per turn', min: 1, max: 12, step: 1, value: T.gCount, onInput: redraw('gCount') });
tw?.slider({ ...gl0, label: 'Hero record: glints turn with the disc', min: 0, max: 8, step: 0.1, value: T.gRide, unit: 'x', onInput: redraw('gRide') });
tw?.select({ ...gl0, label: 'Hero record: glint colour', value: T.chroma, onInput: thenPanel(redraw('chroma')), options: [['none', 'None'], ['film', 'Thin film (oil slick)'], ['prism', 'Prism split'], ['lamp', 'Lamp (blue / orange)'], ['grating', 'Diffraction rainbow'], ['pearl', 'Pearl'], ['fringe', 'Lens fringe']] });
tw?.slider({ ...gl0, label: 'Hero record: colour spread', min: 0, max: 3, step: 0.05, value: T.gSpread, show: coloured, onInput: redraw('gSpread') });
tw?.slider({ ...gl0, label: 'Hero record: colour amount', min: 0, max: 3, step: 0.05, value: T.chromaAmt, show: coloured, onInput: redraw('chromaAmt') });
// Colour away from the lamp: the glints' colour on the sides and at the foot,
// as a share of what it is where the lamp faces (1: the same; up to 3 times).
// Brightness away from the lamp: the same, for how bright the grooves and
// glints are there (always shown: it's not only the glints').
tw?.slider({ folder: 'Lamp', label: 'Hero record: brightness away from the lamp', min: 0, max: 3, step: 0.05, value: T.awayB, onInput: redraw('awayB') });
tw?.slider({ ...gl0, label: 'Hero record: colour away from the lamp', min: 0, max: 3, step: 0.05, value: T.away, show: coloured, onInput: redraw('away') });
tw?.slider({ ...gl0, label: 'Hero record: colour hue', min: -180, max: 180, step: 1, value: T.gHue, unit: '°', show: coloured, onInput: redraw('gHue') });

// LAMP: the light over the record. Where it points moves the sheen, the
// glints' light and the cone together; the cone is the vinyl style's clean-
// edged wedge of light coming through the vinyl, either side of the centre:
// - lamp movement: drifting slowly to and fro, fixed, or turning with the
//   record (as fast as it does);
// - cone direction: the cone turned from where the lamp points;
// - cone width: how wide it is, degrees across (its soft halo with it);
// - cone edge softness: how soft its edges are, degrees;
// - cone reach: how far in from the rim it lights (1: right to the label);
// - cone glow: how bright its light through the vinyl is;
// - cone grooves: how much the grooves in it light up pale;
// - cone colour: its tint (white: the vinyl's own colour);
// - cones: two, opposite, or only the one the lamp points to;
// - lamp colour: the lamp's blue and orange either side of its light, in
//   the sheen (hidden under "grooves in its colour" at 1).
const lampF = { folder: 'Lamp', show: cur };
tw?.select({ folder: 'Lamp', label: 'Hero record: lamp movement', value: T.lampMove, onInput: redraw('lampMove'), options: [['drift', 'Drifts'], ['fixed', 'Fixed'], ['turn', 'Turns with it']] });
tw?.slider({ ...lampF, label: 'Hero record: cone direction', min: -90, max: 90, step: 1, value: T.coneDir, unit: '°', onInput: redraw('coneDir') });
tw?.slider({ ...lampF, label: 'Hero record: cone width', min: 4, max: 120, step: 0.1, value: T.coneW, unit: '°', onInput: redraw('coneW') });
tw?.slider({ ...lampF, label: 'Hero record: cone edge softness', min: 0.1, max: 40, step: 0.1, value: T.coneSoft, unit: '°', onInput: redraw('coneSoft') });
tw?.slider({ ...lampF, label: 'Hero record: cone reach', min: 0.05, max: 1, step: 0.01, value: T.coneReach, onInput: redraw('coneReach') });
tw?.slider({ ...lampF, label: 'Hero record: cone glow', min: 0, max: 2, step: 0.05, value: T.cone, onInput: vf('cone') });
tw?.slider({ ...lampF, label: 'Hero record: cone grooves', min: 0, max: 1.5, step: 0.05, value: T.wedge, onInput: vf('wedge') });
tw?.color({ ...lampF, label: 'Hero record: cone colour', value: T.coneTint, onInput: redraw('coneTint') });
tw?.select({ ...lampF, label: 'Hero record: cones', value: T.cones, onInput: redraw('cones'), options: [['two', 'Two'], ['one', 'One']] });
tw?.slider({ ...lampF, label: 'Hero record: lamp colour (sides)', min: 0, max: 1, step: 0.05, value: T.tint, onInput: redraw('tint') });

tw?.slider({ folder: 'Motion', label: 'Hero record: spin speed', min: 0, max: 3, step: 0.1, value: T.life, onInput: redraw('life') });
// Scrolling twists it a little, down clockwise and back up the other way:
// how far per 1000px scrolled, its most, and how quickly it settles.
tw?.slider({ folder: 'Motion', label: 'Hero record: scroll twist per 1000px', min: 0, max: 90, step: 1, value: T.twistRate, unit: '°', onInput: (v) => { T.twistRate = v; wake(); } });
tw?.slider({ folder: 'Motion', label: 'Hero record: scroll twist at most', min: 0, max: 180, step: 1, value: T.twistMax, unit: '°', onInput: (v) => { T.twistMax = v; wake(); } });
tw?.slider({ folder: 'Motion', label: 'Hero record: scroll twist settles in', min: 0.1, max: 2, step: 0.05, value: T.twistEase, unit: 's', onInput: (v) => { T.twistEase = v; } });

const touchF = { folder: 'Hover & needle' };
const moves = (k) => () => MOVERS[T.hover]?.includes(k);
tw?.select({ ...touchF, label: 'Hero record: hover style', value: T.hover,
  // (Stylus, spot and ripples are gone: one saved before shows as the arc.)
  onInput: (v) => { T.hover = v in HOVERS ? v : 'arc'; if (prog) wake(); panel(); },
  // The same everywhere; outside the vinyl style, the first seven named
  // for what they do in every style (see hoverField). The last six draw
  // nothing of their own: the pointer moves the record's own light (the
  // lamp and its cone, the glints along their grooves, their colours, the
  // record itself; all four: all but the cone alone).
  options: () => [...(cur()
    ? [['arc', 'Arc (first)'], ['lamp', 'Lamp'], ['prism', 'Prism'], ['spectrum', 'Wide spectrum'], ['litarc', 'Arc in lamp light'], ['glass', 'Glass'], ['glassprism', 'Glass prism']]
    : [['arc', 'Arc'], ['lamp', 'Beam'], ['prism', 'Split'], ['spectrum', 'Wide cast'], ['litarc', 'Arc in lamp light'], ['glass', 'Glass'], ['glassprism', 'Glass prism']]),
  ['light', 'Lamp follows'], ['cone', 'Cone follows'], ['angle', 'Glints slide'], ['colour', 'Colours turn'], ['tilt', 'Record tilts'], ['all', 'All four']] });
// How far each goes with the pointer (shown with the hovers that use it).
tw?.slider({ ...touchF, label: 'Hero record: drag tips it', min: 0, max: 1.5, step: 0.05, value: T.dragTilt, onInput: (v) => { const was = T.dragTilt > 0; T.dragTilt = v; if (was !== v > 0) again(); } });
tw?.slider({ ...touchF, label: 'Hero record: lamp swing', min: 0, max: 1, step: 0.05, value: T.hLight, show: moves('light'), onInput: redraw('hLight') });
tw?.slider({ ...touchF, label: 'Hero record: cone swing', min: 0, max: 1, step: 0.05, value: T.hCone, show: moves('cone'), onInput: redraw('hCone') });
tw?.slider({ ...touchF, label: 'Hero record: glint slide', min: 0, max: 1, step: 0.05, value: T.hAngle, show: moves('angle'), onInput: redraw('hAngle') });
tw?.slider({ ...touchF, label: 'Hero record: colour turn', min: 0, max: 1, step: 0.05, value: T.hHue, show: moves('colour'), onInput: redraw('hHue') });
tw?.slider({ ...touchF, label: 'Hero record: tilt', min: -1, max: 1, step: 0.05, value: T.hTilt, show: moves('tilt'), onInput: redraw('hTilt') });
tw?.slider({ ...touchF, label: 'Hero record: follow time', min: 0.15, max: 2, step: 0.05, value: T.hFollow, unit: 's', show: () => !!MOVERS[T.hover], onInput: redraw('hFollow') });
tw?.slider({ ...touchF, label: 'Hero record: needle and hover strength', min: 0, max: 2, step: 0.05, value: T.needle, onInput: redraw('needle') });
tw?.slider({ ...touchF, label: 'Hero record: hover fades after still', min: 0.3, max: 10, step: 0.1, value: T.still, unit: 's', onInput: redraw('still') });

// Shape presets: each sets the layout's controls together to show off one
// idea (the top warps above all).
const flat = { drop: 108, persp: 0.85, size: 1, up: 0, fadeAt: 230, fadeLen: 230, warp: 'none', warpAmt: 0.5 };
const SHAPES = {
  flat: ['Flat on the table', flat],
  close: ['Close up', { ...flat, drop: 200, size: 1.45, persp: 1 }],
  over: ['Rings over the words', { ...flat, up: 0.6, fadeAt: 84 }],
  mirror: ['Mirror the far half', { ...flat, warp: 'mirror', warpAmt: 0.8, fadeAt: 138 }],
  fisheye: ['Fisheye', { ...flat, warp: 'barrel', warpAmt: 0.8 }],
  lens: ['Lens behind words', { ...flat, warp: 'lens', warpAmt: 1, fadeAt: 156 }],
  bent: ['Bent upward', { ...flat, warp: 'flip', warpAmt: 0.7, fadeAt: 138 }],
  dramatic: ['Dramatic', { drop: 60, persp: 1.6, size: 1.3, up: 0.5, fadeAt: 84, fadeLen: 230, warp: 'barrel', warpAmt: 0.7 }],
};
const SHAPE_LABELS = [['drop', 'Hero record: lower by'], ['persp', 'Hero record: perspective'], ['size', 'Hero record: rings all round'], ['up', 'Hero record: more rings up top'], ['fadeAt', 'Hero record: top fade starts at'], ['fadeLen', 'Hero record: top fade length'], ['warp', 'Hero record: top warp'], ['warpAmt', 'Hero record: top warp strength']];
const shapeP = presets('shape', 'Hero record: shape preset', SHAPES, SHAPE_LABELS);
const sf = (k, f = reshape(k)) => shapeP.follow(k, f);
const lay = { folder: 'Layout' };
tw?.select({ ...lay, label: 'Hero record: shape preset', value: T.shape, options: shapeP.options, onInput: shapeP.pick });
tw?.slider({ ...lay, label: 'Hero record: lower by', min: -300, max: 400, step: 4, value: T.drop, unit: 'px', onInput: sf('drop') });
tw?.slider({ ...lay, label: 'Hero record: perspective', min: 0.3, max: 3, step: 0.05, value: T.persp, onInput: sf('persp') });
tw?.slider({ ...lay, label: 'Hero record: rings all round', min: 0.7, max: 2, step: 0.05, value: T.size, onInput: sf('size') });
tw?.slider({ ...lay, label: 'Hero record: more rings up top', min: 0, max: 1, step: 0.05, value: T.up, onInput: sf('up') });
// The fade at the foot (see topFade).
{
  const bf = (k) => (v) => { T[k] = v; geo = null; wake(); };
  const foot = { folder: 'Bottom fade' };
  tw?.slider({ ...foot, label: 'Hero record: bottom fade starts (px from the next heading)', min: -800, max: 200, step: 5, value: T.bfStart, onInput: bf('bfStart') });
  tw?.slider({ ...foot, label: 'Hero record: bottom fade gone by (px from the next heading)', min: -600, max: 400, step: 5, value: T.bfEnd, onInput: bf('bfEnd') });
  tw?.select({ ...foot, label: 'Hero record: bottom fade curve', value: T.bfCurve, options: [['linear', 'Straight'], ['smooth', 'Eased in and out'], ['out', 'Quick, then gently'], ['long', 'Quick, long tail'], ['in', 'Gently, then quick']], onInput: bf('bfCurve') });
  tw?.select({ ...foot, label: 'Hero record: bottom fade shape', value: T.bfShape, options: [['line', 'Straight across'], ['radial', 'Radial, round the app']], onInput: bf('bfShape') });
  tw?.slider({ ...foot, label: 'Hero record: radial fade width (of the page)', min: 0.2, max: 1.5, step: 0.01, value: T.bfWidth, onInput: bf('bfWidth') });
  tw?.slider({ ...foot, label: 'Hero record: radial fade centre (px below the app top)', min: -2000, max: 900, step: 10, value: T.bfCentre, onInput: bf('bfCentre') });
  tw?.slider({ ...foot, label: 'Hero record: strength beside the app', min: 0, max: 1, step: 0.01, value: T.bfMid, onInput: bf('bfMid') });
}
// (Rings past the rim up top, nothing below changing: see layout.)
tw?.slider({ ...lay, label: 'Hero record: rings past the rim up top', min: 0, max: 1, step: 0.01, value: T.reach, onInput: (v) => { T.reach = v; geo = null; wake(); } });
// The fade at the very top: the record is fully shown below "starts at"
// and fades to nothing over "length" above it, always clear at the very
// top (see topFade).
tw?.slider({ ...lay, label: 'Hero record: top fade starts at', min: 40, max: 600, step: 2, value: T.fadeAt, unit: 'px', onInput: sf('fadeAt') });
tw?.slider({ ...lay, label: 'Hero record: top fade length', min: 20, max: 600, step: 2, value: T.fadeLen, unit: 'px', onInput: sf('fadeLen') });
tw?.select({ ...lay, label: 'Hero record: top warp', value: T.warp, onInput: sf('warp', thenPanel(reshape('warp'))), options: [['none', 'None'], ['mirror', 'Mirror the sweep'], ['barrel', 'Barrel'], ['lens', 'Lens bulge'], ['flip', 'Flipped perspective']] });
tw?.slider({ ...lay, label: 'Hero record: top warp strength', min: 0, max: 1, step: 0.05, value: T.warpAmt, show: () => T.warp !== 'none', onInput: sf('warpAmt') });
// The controls these replaced (see migrate), never shown and doing nothing:
// registered so their saved values are kept.
for (const [folder, label] of [['Look', 'soft glints strength'], ['Look', 'glints mode strength'], ['Look', 'glint colour'], ['Look', 'glint colour amount'], ['Look', 'lamp colour'], ['Vinyl', 'lamp wedges'], ['Layout', 'show to the top (mask)']]) {
  const old = { folder, label: `Hero record: ${label}`, show: () => false, onInput: () => {} };
  if (label === 'glint colour') tune?.select({ ...old, value: 'none', options: [['none', 'None']] });
  else tune?.slider({ ...old, min: 0, max: 3, step: 0.05, value: 0 });
}
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
export { T, VINYLS, SHAPES, again as relayout };
