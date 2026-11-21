// Apple-style springs, one set for the pictures and the hero.
//
// `spring()` is SwiftUI's .spring(duration:bounce:) turned into physics
// (stiffness (2π/duration)², damping from the bounce), with
// CASpringAnimation's mass and initial velocity, plus a magnet: a pull
// toward the end that only starts within `range` of it and grows the closer
// it gets, ending on a hard stop, so it snaps into place. Returns how long
// it runs (`ms`, to rest or to the stop) and its curve (`ease`, 0..1 of
// that time to 0..1 of the way).
//
// The same physics drives CSS: springs.css holds each named spring below as
// a `linear()` curve, written out by `toLinear()`. Change a spring here and
// write springs.css again from it (a few lines of node: import this file,
// print `--name: toLinear(NAME)` and `--name-ms: NAME.ms`).
export function spring({ duration, bounce = 0, mass = 1, velocity = 0, magnet = 0, range = 0.15 }) {
  const k = ((2 * Math.PI) / duration) ** 2;
  const c = bounce >= 0 ? ((1 - bounce) * 4 * Math.PI) / duration : (4 * Math.PI) / (duration * (1 + bounce));
  let x = 0, v = velocity, t = 0;
  const dt = 1 / 1000, pts = [0];
  while (t < 4) {
    const d = 1 - x;
    const pull = magnet > 0 && d > 0 && d < range ? magnet * k * (1 - d / range) ** 2 : 0;
    v += ((-k * (x - 1) - c * v + pull) / mass) * dt;
    x += v * dt;
    t += dt;
    if (magnet > 0 && x >= 0.998) break;
    pts.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.02 && t > 0.02) break;
  }
  pts.push(1);
  const T = pts.length - 1;
  return { ms: T, ease: (u) => { const f = u * T, i = Math.floor(f); return i >= T ? 1 : pts[i] + (pts[i + 1] - pts[i]) * (f - i); } };
}

/** A spring as a CSS `linear()` curve, a point every ~8ms (for CSS, and for WAAPI's `easing`). */
export function toLinear(s, step = 8) {
  const n = Math.max(12, Math.min(120, Math.ceil(s.ms / step)));
  return `linear(${Array.from({ length: n + 1 }, (_, i) => +s.ease(i / n).toFixed(3)).join(', ')})`;
}

// The named springs. Every one leaves at once (an initial velocity), none
// overshoots by more than a hair, and each has one job:
//
//   SNAPPY  toggles, releases, small fades and reveals. 0.2s, bounce 0.
//           Nearly there (98%) in 175ms, at rest by 301ms.
//   SMOOTH  moves and entrances, fades. 0.35s, bounce 0. 98% in 298ms, rest 495ms.
//   SETTLE  larger travel that comes to rest by itself (a toast dropping in,
//           a carousel step). 0.5s, bounce 0.1 (overshoots 0.1%). 98% in 346ms.
//   GLIDE   big travel: the hero's screen tilting back, the controller
//           rising, a long drag. 0.7s, bounce 0. 98% in 592ms, rest 977ms.
//   LOCK    the one with a magnet, for the controller's plug seating: the
//           magnet takes it over the last fifth and it lands on a hard
//           stop at 352ms, no overshoot. (The Low kill knob's own spring,
//           KNOB_LOW in pictures.jsx, has one too; nothing else does.)
//   PRESS   short: a key or pad going down its travel, a tag or chip
//           coming on. 0.15s, bounce 0.
//   PULSE   a pulse of light running down a line into the app. 0.4s,
//           bounce 0.
//
// The EQ knobs (KNOB_SPRING, pictures.jsx) and the stem bars (pictures.css)
// keep their own springs, tuned by hand.
export const SNAPPY = spring({ duration: 0.2, velocity: 12 });
export const SMOOTH = spring({ duration: 0.35, velocity: 8 });
export const SETTLE = spring({ duration: 0.5, bounce: 0.1, velocity: 4 });
export const GLIDE = spring({ duration: 0.7, velocity: 4 });
// SLIDE   something moving across the picture into its place, from a
//         standstill: a spring from rest, so it eases in and out, the
//         shape of the old cubic-bezier(0.77, 0, 0.175, 1) the beats had.
//         Deck B's beats sliding onto A's.
export const SLIDE = spring({ duration: 0.75 });
export const LOCK = spring({ duration: 0.6, velocity: 4, magnet: 1.8, range: 0.2 });
export const PRESS = spring({ duration: 0.15, velocity: 12 });
export const PULSE = spring({ duration: 0.4, velocity: 4 });
