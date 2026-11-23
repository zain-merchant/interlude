// #110 (UI audit flag): the sidebar's spring.
//
// One spring moves everything: it writes --library-sidebar (the list's start,
// the ground, the button and the resize handle all stand on it) and --side-p
// on .below, so nothing can come apart. Turned round part way it carries on
// from where it is, at the speed it has.
import { setting } from '../registry.svelte.js';

const SPRINGS = {
  spring: { response: 0.36, damping: 0.82 },
  lively: { response: 0.42, damping: 0.64 },
};

let raf = 0;
let p = 1; // 1 open, 0 shut; over 1 as the spring goes past
let v = 0;

/** @param {HTMLElement} below @param {number} w */
function draw(below, w) {
  below.style.setProperty('--library-sidebar', `${p * w}px`);
  below.style.setProperty('--side-p', String(p));
}

/**
 * @param {HTMLElement | null | undefined} below what holds the library
 * @param {boolean} shut where it's going
 * @param {boolean} [still] at once (first draw, or the edge is being dragged)
 */
export function slide(below, shut, still = false) {
  const to = shut ? 0 : 1;
  cancelAnimationFrame(raf);
  if (!below) {
    p = to;
    return;
  }
  const s = SPRINGS[setting('dir-room-tint', 'slide') ?? 'spring'];
  if (still || !s || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    p = to;
    v = 0;
    done(below);
    return;
  }
  const w = parseFloat(getComputedStyle(below).getPropertyValue('--side-w')) || 200;
  const k = (2 * Math.PI / s.response) ** 2;
  const c = (4 * Math.PI * s.damping) / s.response;
  let last = performance.now();
  below.classList.add('sliding');
  draw(below, w);
  const step = (/** @type {number} */ now) => {
    // A late frame moves on no more than 40 ms, in 2 ms steps.
    let dt = Math.min(0.04, Math.max(0, (now - last) / 1000));
    last = now;
    for (; dt > 0; dt -= 0.002) {
      const h = Math.min(0.002, dt);
      v += (-k * (p - to) - c * v) * h;
      p += v * h;
    }
    if (p < 0) {
      // Nothing to pass on the shut side: it stops at the edge.
      p = 0;
      v = 0;
    }
    if (Math.abs(p - to) * w < 0.25 && Math.abs(v) * w < 8) {
      p = to;
      v = 0;
      done(below);
      return;
    }
    draw(below, w);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** @param {HTMLElement} below */
function done(below) {
  below.classList.remove('sliding');
  below.style.removeProperty('--library-sidebar');
  below.style.setProperty('--side-p', String(p));
}
