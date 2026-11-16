// The "Show me" overlay (dev builds only): one fixed layer over the app,
// outside the app's own DOM, that draws a flag's highlight and its visual
// aid (guides, grids, measurements, ghosts of where things were, loupes).
// Nothing here is styled by the app, and nothing in the app is changed by
// it: the layer is pointer-events: none and removed when the show ends.

export const C = {
  hl: '#ff4fa3', // the highlight around the targets
  aid: '#ffd23f', // guides and measurements
  ok: '#4fe39b', // lined up, on the scale
  bad: '#ff6a5c', // off the grid, off the scale
  ghost: '#7fc8ff', // where something was
};

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (n) => Math.round(n * 10) / 10;
/** A px value as a short label: 4, 4.5, 12.3. */
export const pxl = (n) => `${Math.abs(n) < 0.05 ? 0 : r1(n)}`;

const CSS = `
.flag-show { position: fixed; inset: 0; z-index: 9999; pointer-events: none; contain: strict; }
.flag-show svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.flag-show text { font: 500 10.5px/1 ui-monospace, Menlo, monospace; dominant-baseline: central; }
.flag-show .hl { fill: none; stroke: ${C.hl}; stroke-width: 2; stroke-dasharray: 6 4; animation: flag-show-march .6s linear infinite, flag-show-fade 4.5s ease-out forwards; }
.flag-show .hl-glow { fill: none; stroke: ${C.hl}; stroke-width: 6; opacity: .25; animation: flag-show-pulse 1s ease-in-out infinite alternate, flag-show-fade 4.5s ease-out forwards; }
@keyframes flag-show-march { to { stroke-dashoffset: -10; } }
@keyframes flag-show-pulse { from { opacity: .08; } to { opacity: .35; } }
@keyframes flag-show-fade { 0%, 80% { visibility: visible; } 100% { opacity: 0; visibility: hidden; } }
.flag-show .loupe { position: absolute; overflow: hidden; border-radius: 10px; background: #000;
  box-shadow: 0 0 0 2px ${C.aid}, 0 12px 40px rgb(0 0 0 / .7); }
.flag-show .loupe > .stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.flag-show .loupe > .cap { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; border-radius: 4px;
  background: rgb(0 0 0 / .75); color: ${C.aid}; font: 500 10.5px/14px ui-monospace, Menlo, monospace; }
.flag-show .legend { position: absolute; max-width: 300px; padding: 8px 10px; border-radius: 8px;
  background: rgb(10 10 10 / .88); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .15);
  color: #eee; font: 500 11px/16px ui-monospace, Menlo, monospace; white-space: pre; }
`;

/** The CSS zoom on <html> (the browser preview's interface zoom), or 1. */
export const rootZoom = () => Number(document.documentElement.style.zoom) || 1;

/** The overlay layer: create(), draw(primitives), destroy(). */
export function createOverlay() {
  const layer = document.createElement('div');
  layer.className = 'flag-show';
  layer.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.textContent = CSS;
  const svgHl = document.createElementNS(NS, 'svg');
  const svgAid = document.createElementNS(NS, 'svg');
  const html = document.createElement('div');
  layer.append(style, svgAid, html, svgHl);
  document.body.append(layer);

  let lastHl = '';
  let lastAid = '';
  let lastHtml = '';
  /** @type {Map<string, HTMLElement>} */
  const loupes = new Map();
  let clone = /** @type {HTMLElement | null} */ (null);
  let cloneAt = 0;
  let cloneKey = '';

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
    clone = c;
    cloneAt = performance.now();
    cloneKey = key;
    for (const l of loupes.values()) l.querySelector('.stage')?.replaceChildren(c.cloneNode(true));
    return c;
  }

  return {
    layer,
    /** @param {{ hl: string, aid: string, html: string, loupes: any[] }} out */
    render(out) {
      // The browser preview zooms the interface with CSS zoom on <html>
      // (⌘= / ⌘−); getBoundingClientRect gives window pixels, so the layer
      // undoes that zoom to draw in window pixels too.
      const z = rootZoom();
      layer.style.zoom = z === 1 ? '' : String(1 / z);
      if (out.hl !== lastHl) svgHl.innerHTML = lastHl = out.hl;
      if (out.aid !== lastAid) svgAid.innerHTML = lastAid = out.aid;
      if (out.html !== lastHtml) html.innerHTML = lastHtml = out.html;
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
          stage.append(c.cloneNode(true));
          const cap = document.createElement('div');
          cap.className = 'cap';
          el.append(stage, cap);
          layer.insertBefore(el, svgHl);
          loupes.set(l.key, el);
        }
        el.style.cssText = `left:${l.at.x}px;top:${l.at.y}px;width:${l.size.w}px;height:${l.size.h}px;`;
        const stage = /** @type {HTMLElement} */ (el.firstChild);
        // The point src.x,src.y of the window lands at the loupe's top left.
        // The copy lays out in the app's own (zoomed) CSS px.
        stage.style.transform = `scale(${l.zoom * z}) translate(${-l.src.x / z}px, ${-l.src.y / z}px)`;
        /** @type {HTMLElement} */ (el.lastChild).textContent = l.caption ?? `${l.zoom}×`;
      }
      for (const [k, el] of loupes) if (!seen.has(k)) (el.remove(), loupes.delete(k));
    },
    destroy() {
      layer.remove();
      loupes.clear();
    },
  };
}

/**
 * The drawing kit handed to a flag's aid(d, app): each call adds a shape.
 * Coordinates are viewport pixels (getBoundingClientRect).
 */
export function createDraw() {
  let hl = '';
  let aid = '';
  let html = '';
  const loupes = [];
  const vw = innerWidth;
  const vh = innerHeight;

  const text = (x, y, s, o = {}) => {
    const c = o.c ?? C.aid;
    const str = String(s);
    const w = str.length * 6.4 + 8;
    const anchor = o.anchor ?? 'start';
    let bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    bx = Math.max(2, Math.min(vw - w - 2, bx));
    const by = Math.max(2, Math.min(vh - 16, y - 7));
    aid += `<rect x="${r1(bx)}" y="${r1(by)}" width="${r1(w)}" height="14" rx="3" fill="rgb(8 8 8 / .85)"/>`;
    aid += `<text x="${r1(bx + 4)}" y="${r1(by + 7)}" fill="${c}">${esc(str)}</text>`;
  };
  const line = (x1, y1, x2, y2, o = {}) => {
    aid += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${o.c ?? C.aid}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} shape-rendering="crispEdges"/>`;
  };
  const box = (r, o = {}) => {
    if (!r) return;
    aid += `<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.width)}" height="${r1(r.height)}" fill="${o.fill ?? 'none'}" stroke="${o.c ?? C.aid}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.rx ? ` rx="${o.rx}"` : ''}/>`;
    if (o.label) text(r.x, o.below ? r.bottom + 9 : r.y - 9, o.label, { c: o.c });
  };

  const d = {
    C,
    vw,
    vh,
    text,
    line,
    box,
    /** The pulsing, marching outline around a target. */
    highlight(r, t = 0) {
      if (!r || !r.width || !r.height) return;
      const p = 3;
      // Redrawn as things move; the negative delay keeps the animation going
      // from where it was rather than restarting.
      const a = `x="${r1(r.x - p)}" y="${r1(r.y - p)}" width="${r1(r.width + 2 * p)}" height="${r1(r.height + 2 * p)}" rx="6" style="animation-delay:-${t.toFixed(1)}s,-${t.toFixed(1)}s"`;
      hl += `<rect class="hl-glow" ${a}/><rect class="hl" ${a}/>`;
    },
    /** A full-width horizontal guide at y. */
    hguide(y, o = {}) {
      line(o.x1 ?? 0, y, o.x2 ?? vw, y, { c: o.c, dash: o.dash ?? '4 3' });
      if (o.label) text(o.lx ?? 4, y - 8, o.label, { c: o.c });
    },
    /** A full-height vertical guide at x. */
    vguide(x, o = {}) {
      line(x, o.y1 ?? 0, x, o.y2 ?? vh, { c: o.c, dash: o.dash ?? '4 3' });
      if (o.label) text(x + 4, o.ly ?? 10, o.label, { c: o.c });
    },
    /** A dimension line from (x1, y1) to (x2, y2) with end ticks and its length. */
    measure(x1, y1, x2, y2, o = {}) {
      const c = o.c ?? C.aid;
      const len = Math.hypot(x2 - x1, y2 - y1);
      line(x1, y1, x2, y2, { c, w: 1 });
      const t = 3;
      if (y1 === y2) {
        line(x1, y1 - t, x1, y1 + t, { c });
        line(x2, y2 - t, x2, y2 + t, { c });
      } else {
        line(x1 - t, y1, x1 + t, y1, { c });
        line(x2 - t, y2, x2 + t, y2, { c });
      }
      const label = o.label ?? pxl(len);
      if (y1 === y2) text((x1 + x2) / 2, y1 + (o.above ? -10 : 10), label, { c, anchor: 'middle' });
      else text(Math.max(x1, x2) + 5, (y1 + y2) / 2, label, { c });
    },
    /** A grid of `unit` px over the rect, aligned to the window's origin. */
    grid(r, unit = 4, o = {}) {
      const c = o.c ?? C.aid;
      const op = o.opacity ?? 0.1;
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
      aid += `<path d="${m}" stroke="${c}" stroke-opacity="${Math.min(1, op * 2.5)}" stroke-width="1" fill="none" shape-rendering="crispEdges"/>`;
    },
    circle(cx, cy, rad, o = {}) {
      aid += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(0, rad))}" fill="none" stroke="${o.c ?? C.aid}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
    },
    dot(x, y, o = {}) {
      aid += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${o.r ?? 2.5}" fill="${o.c ?? C.aid}" stroke="#000" stroke-width="1"/>`;
    },
    arrow(x1, y1, x2, y2, o = {}) {
      const c = o.c ?? C.aid;
      line(x1, y1, x2, y2, { c, w: 1.5 });
      const a = Math.atan2(y2 - y1, x2 - x1);
      const h = 6;
      aid += `<path d="M${r1(x2)} ${r1(y2)}L${r1(x2 - h * Math.cos(a - 0.45))} ${r1(y2 - h * Math.sin(a - 0.45))}L${r1(x2 - h * Math.cos(a + 0.45))} ${r1(y2 - h * Math.sin(a + 0.45))}Z" fill="${c}"/>`;
    },
    /**
     * Where something was (dashed, `rest`) against where it is (`live`), with
     * the distance it moved. A 0 means it held still.
     */
    ghost(rest, live, o = {}) {
      if (!rest || !live) return;
      const dx = live.x - rest.x;
      const dy = live.y - rest.y;
      const dw = live.width - rest.width;
      const dh = live.height - rest.height;
      const moved = Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(dw) > 0.4 || Math.abs(dh) > 0.4;
      const c = moved ? C.bad : C.ok;
      box(rest, { c: C.ghost, dash: '3 3' });
      box(live, { c, w: 1.5 });
      if (moved && Math.hypot(dx, dy) > 2) d.arrow(rest.x + rest.width / 2, rest.y + rest.height / 2, live.x + live.width / 2, live.y + live.height / 2, { c });
      const parts = [];
      if (Math.abs(dx) > 0.4) parts.push(`x ${dx > 0 ? '+' : ''}${pxl(dx)}`);
      if (Math.abs(dy) > 0.4) parts.push(`y ${dy > 0 ? '+' : ''}${pxl(dy)}`);
      if (Math.abs(dw) > 0.4) parts.push(`w ${dw > 0 ? '+' : ''}${pxl(dw)}`);
      if (Math.abs(dh) > 0.4) parts.push(`h ${dh > 0 ? '+' : ''}${pxl(dh)}`);
      const label = `${o.label ? o.label + ': ' : ''}${moved ? 'moved ' + parts.join(' ') : 'held still'}`;
      text(o.labelAt?.x ?? Math.min(rest.x, live.x), o.labelAt?.y ?? (o.below ? Math.max(rest.bottom, live.bottom) + 9 : Math.min(rest.y, live.y) - 9), label, { c });
      return moved;
    },
    /** An element's padding, drawn as measured bands with their sizes. */
    padding(el, o = {}) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const p = { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) };
      const c = o.c ?? C.aid;
      const fill = 'rgb(255 210 63 / .18)';
      const sides = o.sides ?? 'trbl';
      if (sides.includes('l') && p.l) {
        box({ x: r.x, y: r.y, width: p.l, height: r.height }, { c: 'none', fill });
        d.measure(r.x, r.y + r.height / 2, r.x + p.l, r.y + r.height / 2, { c, label: pxl(p.l) });
      }
      if (sides.includes('r') && p.r) {
        box({ x: r.right - p.r, y: r.y, width: p.r, height: r.height }, { c: 'none', fill });
        d.measure(r.right - p.r, r.y + r.height / 2, r.right, r.y + r.height / 2, { c, label: pxl(p.r) });
      }
      if (sides.includes('t') && p.t) {
        box({ x: r.x, y: r.y, width: r.width, height: p.t }, { c: 'none', fill });
        d.measure(r.x + r.width / 2, r.y, r.x + r.width / 2, r.y + p.t, { c, label: pxl(p.t) });
      }
      if (sides.includes('b') && p.b) {
        box({ x: r.x, y: r.bottom - p.b, width: r.width, height: p.b }, { c: 'none', fill });
        d.measure(r.x + r.width / 2, r.bottom - p.b, r.x + r.width / 2, r.bottom, { c, label: pxl(p.b) });
      }
      if (o.label) text(r.x, r.y - 9, o.label, { c });
    },
    /** A magnified live copy of the page around `src` (a rect or {x, y, width, height}). */
    loupe(key, src, o = {}) {
      const zoom = o.zoom ?? 4;
      const size = o.size ?? { w: 220, h: 160 };
      const at = o.at ?? { x: 16, y: 16 };
      loupes.push({ key, src: { x: src.x, y: src.y }, zoom, size, at, caption: o.caption });
      box({ x: src.x, y: src.y, width: size.w / zoom, height: size.h / zoom }, { c: C.aid, dash: '2 2' });
    },
    /** A small panel of text lines (pre-formatted), placed at x, y. */
    legend(lines, at = { x: 16, y: 16 }) {
      html += `<div class="legend" style="left:${r1(at.x)}px;top:${r1(at.y)}px">${lines.map(esc).join('\n')}</div>`;
    },
    /** @returns {{ hl: string, aid: string, html: string, loupes: any[] }} */
    done: () => ({ hl, aid, html, loupes }),
  };
  return d;
}
