// The "Show me" overlay (dev builds only): one fixed layer over the app,
// outside the app's own DOM, that draws a flag's highlight and its visual
// aid. Nothing here is styled by the app, and nothing in the app is changed
// by it: the layer is pointer-events: none and removed when the show ends.
//
// One visual language for every flag:
// - ink (magenta): what to look at. The ring around the targets as a show
//   starts, outlines, guides and measurements. Measurements carry their
//   value in a filled ink tag.
// - ghost (dashed white): where something is with the flag the other way.
//   Only what differs gets one.
// - labels: small dark tags that place themselves clear of each other and
//   of the targets. A green or red dot in a tag is a verdict (lined up / off).
// - loupes: a magnified live copy, placed beside what it magnifies.

export const C = {
  ink: '#ff4fa3',
  ghost: 'rgb(255 255 255 / .62)',
  ok: '#4fe39b',
  bad: '#ff6a5c',
  label: '#f2f2f2',
};
// Older names, kept for any aid still using them.
C.hl = C.ink;
C.aid = C.ink;

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (n) => Math.round(n * 10) / 10;
/** A px value as a short label: 4, 4.5, 12.3. */
export const pxl = (n) => `${Math.abs(n) < 0.05 ? 0 : r1(n)}`;

const FONT = "500 11px 'Geist Variable', 'Helvetica Neue', Arial, sans-serif";
const TAG_H = 18;
let ctx2d = /** @type {CanvasRenderingContext2D | null} */ (null);
const widths = new Map();
/** The width of a label's text. */
function textWidth(s) {
  let w = widths.get(s);
  if (w != null) return w;
  ctx2d ??= document.createElement('canvas').getContext('2d');
  if (ctx2d) ctx2d.font = FONT;
  w = ctx2d ? ctx2d.measureText(s).width : s.length * 6.2;
  widths.set(s, w);
  return w;
}

const CSS = `
.flag-show { position: fixed; inset: 0; z-index: 9999; pointer-events: none; contain: strict; }
.flag-show svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.flag-show text { font: ${FONT}; font-variant-numeric: tabular-nums; dominant-baseline: central; }
.flag-show .ring { fill: none; stroke: ${C.ink}; stroke-width: 2; animation: flag-show-ring 2.6s ease-out forwards; }
.flag-show .dim { fill: rgb(0 0 0 / .5); animation: flag-show-dim 2.6s ease-out forwards; }
@keyframes flag-show-ring { 0% { opacity: 0; } 8%, 60% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
@keyframes flag-show-dim { 0% { opacity: 0; } 10%, 45% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
@media (prefers-reduced-motion: reduce) { .flag-show .dim { display: none; } .flag-show .ring { animation: none; } }
.flag-show .loupe { position: absolute; overflow: hidden; border-radius: 10px; background: #000;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .3), 0 12px 40px rgb(0 0 0 / .7); }
.flag-show .loupe > .stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.flag-show .loupe > .cap { position: absolute; left: 6px; bottom: 6px; padding: 0 6px; border-radius: 5px;
  background: rgb(16 16 16 / .9); color: ${C.label}; font: ${FONT}; line-height: ${TAG_H}px; }
.flag-show .legend { position: absolute; padding: 8px 10px; border-radius: 10px;
  background: rgb(16 16 16 / .92); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .14);
  color: ${C.label}; font: ${FONT}; line-height: 17px; font-variant-numeric: tabular-nums; white-space: pre; }
`;

/** The CSS zoom on <html> (the browser preview's interface zoom), or 1. */
export const rootZoom = () => Number(document.documentElement.style.zoom) || 1;

/** The overlay layer: create(), render(drawing), destroy(). */
export function createOverlay() {
  const layer = document.createElement('div');
  layer.className = 'flag-show';
  layer.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.textContent = CSS;
  // Bottom to top: the dimming, legends, loupes, marks and labels, the ring.
  const svgDim = document.createElementNS(NS, 'svg');
  const html = document.createElement('div');
  const loupeLayer = document.createElement('div');
  const svgAid = document.createElementNS(NS, 'svg');
  const svgHl = document.createElementNS(NS, 'svg');
  layer.append(style, svgDim, html, loupeLayer, svgAid, svgHl);
  document.body.append(layer);

  let last = { dim: '', hl: '', aid: '', html: '' };
  /** @type {Map<string, HTMLElement>} */
  const loupes = new Map();
  let clone = /** @type {HTMLElement | null} */ (null);
  let cloneAt = 0;
  let cloneKey = '';
  /** Where the app's scrolled elements are scrolled to: [index among all elements, top, left]. */
  let scrolls = /** @type {[number, number, number][]} */ ([]);
  /** Puts a copy's scrolled elements where the app's are (a copy starts at the top). */
  function scrollLike(copy) {
    if (!scrolls.length) return;
    const all = copy.querySelectorAll('*');
    for (const [i, top, left] of scrolls) {
      const e = all[i];
      if (e) (e.scrollTop = top), (e.scrollLeft = left);
    }
  }

  /** A copy of the whole app for loupes. It takes the same classes, so the
   * same rules (and the same flags on <html>) style it; it is re-taken
   * every second or so to follow the app's state. */
  function appClone() {
    const key = [...document.documentElement.attributes].map((a) => a.name + a.value).join();
    if (clone && performance.now() - cloneAt < 1200 && key === cloneKey) return clone;
    const src = document.getElementById('app');
    if (!src) return null;
    const c = /** @type {HTMLElement} */ (src.cloneNode(true));
    c.removeAttribute('id');
    for (const el of c.querySelectorAll('[id]')) el.removeAttribute('id');
    c.setAttribute('inert', '');
    const cs = getComputedStyle(src);
    c.style.cssText = `width:${src.offsetWidth}px;height:${src.offsetHeight}px;display:${cs.display};position:relative;`;
    scrolls = [];
    src.querySelectorAll('*').forEach((e, i) => {
      if (e.scrollTop || e.scrollLeft) scrolls.push([i, e.scrollTop, e.scrollLeft]);
    });
    clone = c;
    cloneAt = performance.now();
    cloneKey = key;
    for (const l of loupes.values()) {
      const copy = /** @type {HTMLElement} */ (c.cloneNode(true));
      l.querySelector('.stage')?.replaceChildren(copy);
      scrollLike(copy);
    }
    return c;
  }

  return {
    layer,
    /** @param {{ dim: string, hl: string, aid: string, html: string, loupes: any[] }} out */
    render(out) {
      // The browser preview zooms the interface with CSS zoom on <html>
      // (⌘= / ⌘−); getBoundingClientRect gives window pixels, so the layer
      // undoes that zoom to draw in window pixels too.
      const z = rootZoom();
      layer.style.zoom = z === 1 ? '' : String(1 / z);
      if (out.dim !== last.dim) svgDim.innerHTML = last.dim = out.dim;
      if (out.hl !== last.hl) svgHl.innerHTML = last.hl = out.hl;
      if (out.aid !== last.aid) svgAid.innerHTML = last.aid = out.aid;
      if (out.html !== last.html) html.innerHTML = last.html = out.html;
      // Loupes: keep the element, move its stage.
      const seen = new Set();
      for (const l of out.loupes) {
        seen.add(l.key);
        let el = loupes.get(l.key);
        const c = appClone();
        if (!c) continue;
        if (!el) {
          el = document.createElement('div');
          el.className = 'loupe';
          const stage = document.createElement('div');
          stage.className = 'stage';
          const copy = /** @type {HTMLElement} */ (c.cloneNode(true));
          stage.append(copy);
          const cap = document.createElement('div');
          cap.className = 'cap';
          el.append(stage, cap);
          loupeLayer.append(el);
          scrollLike(copy);
          loupes.set(l.key, el);
        }
        el.style.cssText = `left:${l.at.x}px;top:${l.at.y}px;width:${l.size.w}px;height:${l.size.h}px;`;
        const stage = /** @type {HTMLElement} */ (el.firstChild);
        // The point src.x,src.y of the window lands at the loupe's top left.
        // The copy lays out in the app's own (zoomed) CSS px.
        stage.style.transform = `scale(${l.zoom * z}) translate(${-l.src.x / z}px, ${-l.src.y / z}px)`;
        const cap = /** @type {HTMLElement} */ (el.lastChild);
        cap.textContent = l.caption ?? `${l.zoom}×`;
        cap.style.display = cap.textContent ? '' : 'none';
      }
      for (const [k, el] of loupes) if (!seen.has(k)) (el.remove(), loupes.delete(k));
    },
    destroy() {
      layer.remove();
      loupes.clear();
    },
  };
}

const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const box4 = (r) => ({ x: r.x ?? r.left, y: r.y ?? r.top, w: r.width ?? r.w, h: r.height ?? r.h });

/**
 * The drawing kit handed to a flag's aid(d, app): each call adds a shape.
 * Coordinates are viewport pixels (getBoundingClientRect).
 * @param {{ targets?: DOMRect[] }} [opts]
 */
export function createDraw(opts = {}) {
  let dim = '';
  let hl = '';
  let aid = '';
  let html = '';
  const loupes = [];
  /** Labels, placed at the end so they keep clear of each other. */
  const tags = [];
  const vw = innerWidth;
  const vh = innerHeight;
  // What labels and loupes keep off: the targets (unless they are big
  // regions, which labels sit inside) and whatever an aid protects.
  const keepOff = (opts.targets ?? []).filter((r) => r.width * r.height < 90000).map(box4);
  const taken = [];
  /** What the aid covers (boxes, loupes, labels), for the controls to keep off. */
  const marks = [];

  /**
   * A label at (x, y) (its vertical middle). o.anchor: 'start' | 'middle' |
   * 'end'; o.tone: 'ok' | 'bad' (a dot); o.fill: true for a measurement's
   * ink tag; o.fixed: true to place it exactly there.
   */
  const text = (x, y, s, o = {}) => {
    const str = String(s);
    if (!str) return;
    const dot = o.tone === 'ok' || o.tone === 'bad';
    const w = Math.ceil(textWidth(str)) + 12 + (dot ? 10 : 0);
    const anchor = o.anchor ?? 'start';
    const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    tags.push({ x: bx, y: y - TAG_H / 2, w, h: TAG_H, str, dot, o, ax: x, ay: y });
  };
  const line = (x1, y1, x2, y2, o = {}) => {
    aid += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.opacity ? ` stroke-opacity="${o.opacity}"` : ''} shape-rendering="crispEdges"/>`;
  };
  /** An outline. o.dash, o.c, o.w, o.fill, o.rx; o.label with o.below. */
  const box = (r, o = {}) => {
    if (!r) return;
    const b = box4(r);
    marks.push(b);
    aid += `<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" fill="${o.fill ?? 'none'}" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} rx="${o.rx ?? 3}"/>`;
    if (o.label) text(b.x, o.below ? b.y + b.h + 4 + TAG_H / 2 : b.y - 4 - TAG_H / 2, o.label, { tone: o.tone });
  };

  /** Lays the labels out: each where asked, or the nearest free place. */
  function layout() {
    const tries = [
      [0, 0], [0, -22], [0, 22], [0, -44], [0, 44], [-60, 0], [60, 0], [0, -66], [0, 66], [-120, 0], [120, 0],
    ];
    let out = '';
    for (const t of tags) {
      let best = null;
      for (const [dx, dy] of t.o.fixed ? [[0, 0]] : tries) {
        const c = { x: Math.max(4, Math.min(vw - t.w - 4, t.x + dx)), y: Math.max(4, Math.min(vh - t.h - 4, t.y + dy)), w: t.w, h: t.h };
        if (!taken.some((a) => overlaps(c, a, 2)) && (t.o.free || !keepOff.some((a) => overlaps(c, a, 1)))) {
          best = c;
          break;
        }
      }
      best ??= { x: Math.max(4, Math.min(vw - t.w - 4, t.x)), y: Math.max(4, Math.min(vh - t.h - 4, t.y)), w: t.w, h: t.h };
      taken.push(best);
      // Moved well away from where it was asked for: a leader back to it.
      const cy = best.y + TAG_H / 2;
      if (Math.abs(best.y - t.y) > 30 || Math.abs(best.x - t.x) > 50) {
        const ex = Math.max(best.x, Math.min(best.x + best.w, t.ax));
        const ey = t.ay < best.y ? best.y : t.ay > best.y + TAG_H ? best.y + TAG_H : cy;
        out += `<line x1="${r1(ex)}" y1="${r1(ey)}" x2="${r1(t.ax)}" y2="${r1(t.ay)}" stroke="rgb(255 255 255 / .45)" stroke-width="1"/>`;
      }
      const bg = t.o.fill ? C.ink : 'rgb(16 16 16 / .92)';
      const fg = t.o.fill ? '#140810' : C.label;
      out += `<rect x="${r1(best.x)}" y="${r1(best.y)}" width="${r1(best.w)}" height="${TAG_H}" rx="5" fill="${bg}"${t.o.fill ? '' : ' stroke="rgb(255 255 255 / .14)" stroke-width="1"'}/>`;
      let tx = best.x + 6;
      if (t.dot) {
        out += `<circle cx="${r1(tx + 3)}" cy="${r1(best.y + TAG_H / 2)}" r="3" fill="${t.o.tone === 'ok' ? C.ok : C.bad}"/>`;
        tx += 10;
      }
      out += `<text x="${r1(tx)}" y="${r1(best.y + TAG_H / 2 + 0.5)}" fill="${fg}">${esc(t.str)}</text>`;
    }
    return out;
  }

  const d = {
    C,
    vw,
    vh,
    text,
    line,
    box,
    /** Keeps labels and loupes off a rect (the thing a label is about). */
    protect(r) {
      if (r) keepOff.push(box4(r));
    },
    /** The ring around a target as a show starts, with the rest dimmed. */
    highlight(rects, t = 0) {
      const list = rects.filter((r) => r && r.width && r.height);
      if (!list.length) return;
      const p = 4;
      // Redrawn as things move; the negative delay keeps the animation going
      // from where it was rather than restarting.
      const a = `style="animation-delay:-${t.toFixed(2)}s"`;
      let holes = '';
      for (const r of list) {
        const x = r.x - p;
        const y = r.y - p;
        const w = r.width + 2 * p;
        const h = r.height + 2 * p;
        hl += `<rect class="ring" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="8" ${a}/>`;
        holes += `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
      }
      dim += `<path class="dim" fill-rule="evenodd" d="M0 0H${vw}V${vh}H0Z${holes}" ${a}/>`;
    },
    /** A horizontal guide at y (full width unless o.x1 / o.x2). */
    hguide(y, o = {}) {
      line(o.x1 ?? 0, y, o.x2 ?? vw, y, { c: o.c, dash: o.dash ?? '4 3' });
      if (o.label) text(o.lx ?? (o.x1 ?? 0) + 4, y - 4 - TAG_H / 2, o.label, { tone: o.tone });
    },
    /** A vertical guide at x (full height unless o.y1 / o.y2). */
    vguide(x, o = {}) {
      line(x, o.y1 ?? 0, x, o.y2 ?? vh, { c: o.c, dash: o.dash ?? '4 3' });
      if (o.label) text(x + 4, o.ly ?? (o.y1 ?? 0) + 12, o.label, { tone: o.tone });
    },
    /**
     * A dimension line from (x1, y1) to (x2, y2) with end ticks, and its
     * length (or o.label) in an ink tag. o.side: 'above' | 'below' | 'left'
     * | 'right' puts the tag beside the line rather than on it.
     */
    measure(x1, y1, x2, y2, o = {}) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const c = o.c ?? C.ink;
      line(x1, y1, x2, y2, { c });
      const t = 3.5;
      const flat = Math.abs(y1 - y2) < 0.5;
      if (flat) {
        line(x1, y1 - t, x1, y1 + t, { c });
        line(x2, y2 - t, x2, y2 + t, { c });
      } else {
        line(x1 - t, y1, x1 + t, y1, { c });
        line(x2 - t, y2, x2 + t, y2, { c });
      }
      const label = o.label ?? pxl(len);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const side = o.side ?? (flat ? 'below' : 'right');
      const off = 4 + TAG_H / 2;
      if (side === 'on') text(mx, my, label, { fill: true, anchor: 'middle', tone: o.tone });
      else if (side === 'above') text(mx, Math.min(y1, y2) - off, label, { fill: true, anchor: 'middle', tone: o.tone });
      else if (side === 'below') text(mx, Math.max(y1, y2) + off, label, { fill: true, anchor: 'middle', tone: o.tone });
      else if (side === 'left') text(Math.min(x1, x2) - 6, my, label, { fill: true, anchor: 'end', tone: o.tone });
      else text(Math.max(x1, x2) + 6, my, label, { fill: true, tone: o.tone });
    },
    /** A grid of `unit` px over the rect, aligned to the window's origin. */
    grid(r, unit = 4, o = {}) {
      const c = o.c ?? '#fff';
      const op = o.opacity ?? 0.05;
      const x0 = Math.ceil(r.x / unit) * unit;
      const y0 = Math.ceil(r.y / unit) * unit;
      let p = '';
      for (let x = x0; x <= r.right; x += unit) p += `M${x + 0.5} ${r1(r.y)}V${r1(r.bottom)}`;
      for (let y = y0; y <= r.bottom; y += unit) p += `M${r1(r.x)} ${y + 0.5}H${r1(r.right)}`;
      aid += `<path d="${p}" stroke="${c}" stroke-opacity="${op}" stroke-width="1" fill="none" shape-rendering="crispEdges"/>`;
      const major = o.major ?? unit * 4;
      let m = '';
      for (let x = Math.ceil(r.x / major) * major; x <= r.right; x += major) m += `M${x + 0.5} ${r1(r.y)}V${r1(r.bottom)}`;
      for (let y = Math.ceil(r.y / major) * major; y <= r.bottom; y += major) m += `M${r1(r.x)} ${y + 0.5}H${r1(r.right)}`;
      aid += `<path d="${m}" stroke="${c}" stroke-opacity="${Math.min(1, op * 2.2)}" stroke-width="1" fill="none" shape-rendering="crispEdges"/>`;
    },
    circle(cx, cy, rad, o = {}) {
      aid += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(0, rad))}" fill="none" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
    },
    dot(x, y, o = {}) {
      aid += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${o.r ?? 2.5}" fill="${o.c ?? C.ink}" stroke="#000" stroke-width="1"/>`;
    },
    /** Draws what fn() draws clipped to rect r (a loupe's, say). */
    clip(r, fn) {
      const start = aid.length;
      fn();
      const b = box4(r);
      const inner = aid.slice(start);
      aid = `${aid.slice(0, start)}<svg x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" viewBox="${r1(b.x)} ${r1(b.y)} ${r1(b.w)} ${r1(b.h)}" overflow="hidden">${inner}</svg>`;
    },
    /** An SVG path in window px (for curves an aid works out itself). */
    path(dpath, o = {}) {
      aid += `<path d="${dpath}" fill="none" stroke="${o.c ?? C.ink}" stroke-width="${o.w ?? 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round"/>`;
    },
    arrow(x1, y1, x2, y2, o = {}) {
      const c = o.c ?? C.ink;
      line(x1, y1, x2, y2, { c, w: 1.5 });
      const a = Math.atan2(y2 - y1, x2 - x1);
      const h = 6;
      aid += `<path d="M${r1(x2)} ${r1(y2)}L${r1(x2 - h * Math.cos(a - 0.45))} ${r1(y2 - h * Math.sin(a - 0.45))}L${r1(x2 - h * Math.cos(a + 0.45))} ${r1(y2 - h * Math.sin(a + 0.45))}Z" fill="${c}"/>`;
    },
    /**
     * Where something is with the flag the other way (`other`, dashed)
     * against where it is now (`live`): drawn only if they differ, with the
     * move as a label ("11px lower", "42px wider"). Returns whether they do.
     * o.label names it; o.side: 'above' | 'below' | 'left' | 'right' for
     * the label (default: above).
     */
    ghost(other, live, o = {}) {
      if (!other || !live) return false;
      const dx = live.x - other.x;
      const dy = live.y - other.y;
      const dw = live.width - other.width;
      const dh = live.height - other.height;
      const big = (n) => Math.abs(n) > 0.5;
      if (!big(dx) && !big(dy) && !big(dw) && !big(dh)) return false;
      box(other, { c: C.ghost, dash: '4 3', w: 1.25 });
      // From the other's centre to this one's, if it moved rather than resized.
      const ocx = other.x + other.width / 2;
      const ocy = other.y + other.height / 2;
      const lcx = live.x + live.width / 2;
      const lcy = live.y + live.height / 2;
      if (Math.hypot(lcx - ocx, lcy - ocy) > 8 && !big(dw) && !big(dh)) d.arrow(lcx, lcy, ocx, ocy, { c: C.ghost });
      // Said from the ghost's point of view: how it differs from now.
      const parts = [];
      if (big(dy) && !big(dh)) parts.push(`${pxl(Math.abs(dy))}px ${dy > 0 ? 'higher' : 'lower'}`);
      if (big(dx) && !big(dw)) parts.push(`${pxl(Math.abs(dx))}px ${dx > 0 ? 'left' : 'right'}`);
      if (big(dw)) parts.push(`${pxl(Math.abs(dw))}px ${dw > 0 ? 'narrower' : 'wider'}`);
      if (big(dh)) parts.push(`${pxl(Math.abs(dh))}px ${dh > 0 ? 'shorter' : 'taller'}`);
      if (o.label === false) return true;
      const label = `${o.label ? o.label + ' ' : ''}${parts.join(', ')}`;
      const side = o.side ?? 'above';
      const ox = other.x;
      const oy = other.y;
      if (side === 'below') text(ox, oy + other.height + 4 + TAG_H / 2, label);
      else if (side === 'left') text(ox - 6, oy + other.height / 2, label, { anchor: 'end' });
      else if (side === 'right') text(ox + other.width + 6, oy + other.height / 2, label);
      else text(ox, oy - 4 - TAG_H / 2, label);
      return true;
    },
    /** An element's padding, as shaded bands with their sizes. */
    padding(el, o = {}) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const p = { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) };
      const fill = 'rgb(255 79 163 / .22)';
      const sides = o.sides ?? 'trbl';
      const band = (x, y, w, h) => (aid += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"/>`);
      // Each size just outside the element, off its band: under a side band,
      // over the top one, under the bottom one.
      const tag = { fill: true, anchor: 'middle', free: true };
      const below = r.bottom + 4 + TAG_H / 2;
      const above = r.y - 4 - TAG_H / 2;
      if (sides.includes('l') && p.l) (band(r.x, r.y, p.l, r.height), text(r.x + p.l / 2, below, pxl(p.l), tag));
      if (sides.includes('r') && p.r) (band(r.right - p.r, r.y, p.r, r.height), text(r.right - p.r / 2, below, pxl(p.r), tag));
      if (sides.includes('t') && p.t) (band(r.x, r.y, r.width, p.t), text(r.x + r.width / 2, above, pxl(p.t), tag));
      if (sides.includes('b') && p.b) (band(r.x, r.bottom - p.b, r.width, p.b), text(r.x + r.width / 2, below, pxl(p.b), tag));
      if (o.label) text(r.x, r.y - 4 - TAG_H / 2, o.label);
    },
    /**
     * A magnified live copy of the page from `src` ({ x, y }: the top left
     * of what it shows). Placed beside `o.near` (a rect) where there is room,
     * or at o.at. Returns where it went and a function mapping window px to
     * the loupe's px, to draw over it.
     */
    loupe(key, src, o = {}) {
      const zoom = o.zoom ?? 4;
      const size = o.size ?? { w: 220, h: 160 };
      let at = o.at;
      const view = { x: src.x, y: src.y, w: size.w / zoom, h: size.h / zoom };
      if (!at) {
        const n = o.near ? box4(o.near) : view;
        const g = 14;
        const spots = [
          { x: n.x + n.w + g, y: n.y + n.h / 2 - size.h / 2 },
          { x: n.x - g - size.w, y: n.y + n.h / 2 - size.h / 2 },
          { x: n.x + n.w / 2 - size.w / 2, y: n.y + n.h + g },
          { x: n.x + n.w / 2 - size.w / 2, y: n.y - g - size.h },
          { x: n.x + n.w + g, y: n.y },
          { x: n.x - g - size.w, y: n.y },
        ].map((s) => ({ x: Math.max(8, Math.min(vw - size.w - 8, s.x)), y: Math.max(8, Math.min(vh - size.h - 8, s.y)), w: size.w, h: size.h }));
        const free = spots.find((s) => !overlaps(s, view, 4) && !overlaps(s, n, 4) && !taken.some((t) => overlaps(s, t, 4)) && !keepOff.some((k) => overlaps(s, k, 2)));
        // Failing that, anywhere off what it magnifies.
        at = free ?? spots.find((s) => !overlaps(s, view, 4) && !overlaps(s, n, 4)) ?? spots[0];
      }
      taken.push({ x: at.x, y: at.y, w: size.w, h: size.h });
      loupes.push({ key, src: { x: src.x, y: src.y }, zoom, size, at, caption: o.caption });
      box(view, { c: C.ink, w: 1, rx: 1 });
      const map = (x, y) => ({ x: at.x + (x - src.x) * zoom, y: at.y + (y - src.y) * zoom });
      return { at, map, zoom, rect: new DOMRect(at.x, at.y, size.w, size.h) };
    },
    /** A small panel of text lines (pre-formatted), placed at x, y. */
    legend(lines, at = { x: 16, y: 16 }) {
      html += `<div class="legend" style="left:${r1(at.x)}px;top:${r1(at.y)}px">${lines.map(esc).join('\n')}</div>`;
    },
    /** @returns {{ dim: string, hl: string, aid: string, html: string, loupes: any[], marks: DOMRect[] }} */
    done() {
      const labels = layout();
      return { dim, hl, aid: aid + labels, html, loupes, marks: [...marks, ...taken].map((m) => new DOMRect(m.x, m.y, m.w, m.h)) };
    },
  };
  return d;
}
