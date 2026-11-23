// #110 (UI audit flag): where a dragged track can land, drawn one way.
//
// The app marks every drop target with data-drop (lib/dnd.svelte.js) and
// draws a CSS outline, which a rounded panel clips at its corners and which
// changes width between states. Here one SVG over the window draws them all:
// a 1.5px line inside the target, following its corners, dashed while a track
// is in the air and solid on the target under the pointer. Every straight and
// every corner is dashed on its own, so dashes sit evenly along each and the
// corners are the same four times over.
//
// The waveforms' lanes are two halves of one window: each line keeps 4px
// inside the window's rounded edge and steps round the zoom.
import { drag } from '../../lib/dnd.svelte.js';
import { flag } from '../registry.svelte.js';

const NS = 'http://www.w3.org/2000/svg';
const DASH = 5;
const GAP = 4;

/** @typedef {[number, number, number]} Corner x, y, radius */

/** The pieces of a right-angled outline: straights, and quarter arcs. @param {Corner[]} pts */
function pieces(pts) {
  const n = pts.length;
  const dir = (/** @type {Corner} */ a, /** @type {Corner} */ b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  const len = (/** @type {Corner} */ a, /** @type {Corner} */ b) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
  const r = pts.map((p, i) => Math.max(0, Math.min(p[2], len(p, pts[(i + 1) % n]) / 2, len(p, pts[(i + n - 1) % n]) / 2)));
  /** @type {{ d: string, l: number, arc: boolean }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const j = (i + 1) % n;
    const u = dir(a, b);
    const v = dir(b, c);
    const l = len(a, b) - r[i] - r[j];
    const sx = a[0] + u[0] * r[i];
    const sy = a[1] + u[1] * r[i];
    const ex = b[0] - u[0] * r[j];
    const ey = b[1] - u[1] * r[j];
    if (l > 0.5) out.push({ d: `M${sx} ${sy}L${ex} ${ey}`, l, arc: false });
    if (r[j] > 0.5) out.push({ d: `M${ex} ${ey}A${r[j]} ${r[j]} 0 0 ${u[0] * v[1] - u[1] * v[0] > 0 ? 1 : 0} ${b[0] + v[0] * r[j]} ${b[1] + v[1] * r[j]}`, l: (Math.PI / 2) * r[j], arc: true });
  }
  return out;
}

/** @param {ReturnType<typeof pieces>} ps */
const outline = (ps) => ps.map((p, i) => (i ? p.d.replace(/^M[^LA]*/, 'L' + p.d.slice(1).split(/[LA]/)[0]) : p.d)).join('') + 'Z';

$effect.root(() => {
  $effect(() => {
    if (!drag.track || !flag('dir-room-tint')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'room-drops');
    svg.setAttribute('aria-hidden', 'true');
    document.body.append(svg);
    document.documentElement.dataset.roomDrops = '';
    let raf = 0;
    let last = '';
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const k = Number(document.documentElement.style.zoom) || 1;
      const box = (/** @type {Element} */ e) => {
        const r = e.getBoundingClientRect();
        return { x0: r.left / k, y0: r.top / k, x1: r.right / k, y1: r.bottom / k };
      };
      /** @type {{ pts: Corner[], state: string, colour: string }[]} */
      const shapes = [];
      for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-drop]'))) {
        const state = el.dataset.drop ?? '';
        const colour = getComputedStyle(el).getPropertyValue('--drop-color').trim() || 'var(--fg-2)';
        const b = box(el);
        const waves = el.closest('.waves');
        if (waves) {
          const w = box(waves);
          const R = parseFloat(getComputedStyle(waves).borderTopLeftRadius) - 4;
          const [x0, x1] = [w.x0 + 4, w.x1 - 4];
          const first = !el.previousElementSibling?.matches('.lane');
          const [ya, yb] = first ? [w.y0 + 4, b.y1 - 1.5] : [b.y0 + 1.5, w.y1 - 4];
          const z = waves.querySelector('.zoom');
          const g = z && box(z);
          /** @type {Corner[]} */
          let pts;
          const room = g ? (first ? g.y0 - 4 - ya : yb - g.y1 - 4) : 0;
          if (!g) pts = first ? [[x0, ya, R], [x1, ya, R], [x1, yb, 4], [x0, yb, 4]] : [[x0, ya, 4], [x1, ya, 4], [x1, yb, R], [x0, yb, R]];
          else if (room < 12) pts = first ? [[x0, ya, R], [g.x0 - 4, ya, 6], [g.x0 - 4, yb, 4], [x0, yb, 4]] : [[x0, ya, 4], [g.x0 - 4, ya, 4], [g.x0 - 4, yb, 6], [x0, yb, R]];
          else if (first) pts = [[x0, ya, R], [x1, ya, R], [x1, g.y0 - 4, 4], [g.x0 - 4, g.y0 - 4, 11], [g.x0 - 4, yb, 4], [x0, yb, 4]];
          else pts = [[x0, ya, 4], [g.x0 - 4, ya, 4], [g.x0 - 4, g.y1 + 4, 11], [x1, g.y1 + 4, 4], [x1, yb, R], [x0, yb, R]];
          shapes.push({ pts, state, colour });
          continue;
        }
        // Out of sight in its own scroller: not drawn.
        const pane = el.closest('nav, .scroll');
        if (pane) {
          const q = box(pane);
          if (b.y0 < q.y0 - 1 || b.y1 > q.y1 + 1) continue;
        }
        const big = b.y1 - b.y0 > 60;
        const i = big ? 5 : 0.75;
        const R = Math.max(0, (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) - i);
        shapes.push({ pts: [[b.x0 + i, b.y0 + i, R], [b.x1 - i, b.y0 + i, R], [b.x1 - i, b.y1 - i, R], [b.x0 + i, b.y1 - i, R]], state, colour });
      }
      const key = JSON.stringify(shapes);
      if (key === last) return;
      last = key;
      svg.replaceChildren();
      for (const s of shapes) {
        const ps = pieces(s.pts);
        const over = s.state.endsWith('over');
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', s.state);
        g.style.setProperty('--drop-color', s.colour);
        if (over) {
          const p = document.createElementNS(NS, 'path');
          p.setAttribute('d', outline(ps));
          p.setAttribute('class', 'fill');
          g.append(p);
        } else {
          for (const q of ps) {
            let m = Math.max(1, Math.round(q.l / (DASH + GAP)));
            if (q.arc && m % 2 === 0) m += q.l / m > DASH + GAP ? 1 : -1;
            const period = q.l / m;
            const dash = (period * DASH) / (DASH + GAP);
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('d', q.d);
            p.setAttribute('stroke-dasharray', `${dash} ${period - dash}`);
            p.setAttribute('stroke-dashoffset', String(-(period - dash) / 2));
            g.append(p);
          }
        }
        svg.append(g);
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      svg.remove();
      delete document.documentElement.dataset.roomDrops;
    };
  });
});
