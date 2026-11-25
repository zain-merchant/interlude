// #110 (UI audit flag): the sidebar's spring.
//
// The list is laid out once, at its widest, and everything that stands
// somewhere else with the sidebar open is carried between its two places on
// the compositor: laying the list out every frame repainted the whole panel,
// about 25 frames a second in the app at 2560 wide. The sidebar slides over
// the list (its ground is opaque while it does). One spring (p: 1 open, 0
// shut) makes every path, so nothing comes apart, and turned round part way
// it carries on from where it is, at the speed it has.
import { setting } from '../registry.svelte.js';

const SPRINGS = {
  spring: { response: 0.36, damping: 0.82 },
  lively: { response: 0.42, damping: 0.64 },
};
const STEP = 1 / 60;

let p = 1;
let v = 0;
/** @type {{ el: Element, d: number, pseudo?: string }[]} */
let parts = [];
/** @type {Animation[]} */
let playing = [];
/** The path being played: p at each step, and when it began. */
let path = [1];
let began = 0;
let timer = 0;
let turn = 0;

/** Where its words start (a figure is centred in a column that changes width), or its edge. @param {Element} el */
function at(el) {
  if (el.matches('.row > *')) {
    const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (t) {
      const r = document.createRange();
      r.selectNodeContents(t);
      const x = r.getBoundingClientRect();
      if (x.width) return x.left;
    }
  }
  return el.getBoundingClientRect().left;
}

/** Both places of everything that moves. @param {HTMLElement} below @param {number} w */
function measure(below, w) {
  const lib = below.querySelector('section.library');
  if (!lib) return [];
  const list = lib.querySelector('.scroll');
  const top = list?.getBoundingClientRect().top ?? 0;
  const bottom = list?.getBoundingClientRect().bottom ?? 0;
  const els = [
    ...lib.querySelectorAll(':scope > nav, :scope > .sidetoggle, :scope > .main > .bar > *, :scope > .main > .row.head > :not(.colh), :scope > .main > .scroll > .zs, :scope > .main > .sampler > *'),
    ...[...lib.querySelectorAll(':scope > .main > .scroll .row')].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.bottom > top && b.top < bottom;
    }).flatMap((r) => [...r.children]),
    ...below.querySelectorAll(':scope > .grip.side'),
  ];
  const put = (/** @type {number} */ q) => {
    below.style.setProperty('--library-sidebar', `${q * w}px`);
    below.style.setProperty('--side-p', String(q));
  };
  put(1);
  const open = els.map(at);
  put(0);
  const shut = els.map(at);
  const all = els.map((el, i) => ({ el, d: open[i] - shut[i] })).filter((x) => Math.abs(x.d) > 0.25);
  // A loaded track's mark is drawn on its row.
  const marks = [...new Set(els.filter((el) => el.matches('.scroll .row > *')).map((el) => /** @type {Element} */ (el.parentElement)))].filter((r) => {
    const c = getComputedStyle(r, '::before');
    return c.content !== 'none' && c.content !== 'normal' && parseFloat(c.width) < 12;
  });
  return [...all, ...marks.map((el) => ({ el, d: w, pseudo: '::before' })), { el: lib, d: w, pseudo: '::before' }];
}

/** From p, at speed v, to where it's going: p at every step until it's still. @param {number} to @param {number} w @param {{ response: number, damping: number }} s */
function run(to, w, s) {
  const k = ((2 * Math.PI) / s.response) ** 2;
  const c = (4 * Math.PI * s.damping) / s.response;
  let q = p;
  let u = v;
  const out = [q];
  for (let n = 0; n < 120; n++) {
    for (let i = 0; i < 8; i++) {
      u += (-k * (q - to) - c * u) * (STEP / 8);
      q += u * (STEP / 8);
    }
    // Nothing to pass on the shut side: it stops at the edge.
    if (q < 0) q = u = 0;
    out.push(q);
    if (Math.abs(q - to) * w < 0.25 && Math.abs(u) * w < 8) break;
  }
  out[out.length - 1] = to;
  return out;
}

/** Where it has got to, and how fast it's going, if it's moving. */
function now() {
  if (!began) return;
  const t = Math.max(0, (performance.now() - began) / 1000 / STEP);
  const i = Math.min(path.length - 2, Math.floor(t));
  if (i < 0) return;
  const f = Math.min(1, t - i);
  p = path[i] + (path[i + 1] - path[i]) * f;
  v = (path[i + 1] - path[i]) / STEP;
}

/** @param {HTMLElement | null | undefined} below */
function done(below) {
  turn++;
  clearTimeout(timer);
  timer = 0;
  if (below) {
    below.classList.remove('sliding');
    below.style.removeProperty('--library-sidebar');
    below.style.setProperty('--side-p', String(p));
  }
  for (const a of playing) a.cancel();
  playing = [];
  parts = [];
}

/**
 * Called before the new place is drawn.
 * @param {HTMLElement | null | undefined} below what holds the library
 * @param {boolean} shut where it's going
 * @param {boolean} [still] at once (first draw, or the edge is being dragged)
 */
export function slide(below, shut, still = false) {
  const to = shut ? 0 : 1;
  const s = SPRINGS[setting('dir-room-tint', 'slide') ?? 'spring'];
  if (!below || still || !s || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    p = to;
    v = 0;
    if (below) done(below);
    return;
  }
  const w = parseFloat(getComputedStyle(below).getPropertyValue('--side-w')) || 200;
  const moving = timer !== 0;
  if (moving) {
    now();
    clearTimeout(timer);
  } else {
    if (p === to) return;
    below.classList.add('sliding');
    parts = measure(below, w);
  }
  path = run(to, w, s);
  const ms = (path.length - 1) * STEP * 1000;
  const next = parts.map(({ el, d, pseudo }) => {
    const a = el.animate(
      path.map((q) => ({ transform: `translateX(${(d * q).toFixed(2)}px)` })),
      { duration: ms, fill: 'both', easing: 'linear', pseudoElement: pseudo },
    );
    a.pause();
    return a;
  });
  for (const a of playing) a.cancel();
  playing = next;
  // The first frame has the new layout and every layer to draw: it's held where
  // it starts until that's on screen, so none of the slide is lost to it.
  began = 0;
  const mine = ++turn;
  const go = () => {
    if (mine !== turn) return;
    began = performance.now();
    for (const a of playing) a.play();
    timer = window.setTimeout(() => {
      p = to;
      v = 0;
      done(below);
    }, ms);
  };
  if (moving) return go(); // its layers are there already
  // Whatever happens it goes: a hidden page draws no frames.
  timer = window.setTimeout(go, 400);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (mine !== turn || began) return;
    clearTimeout(timer);
    go();
  }));
}
