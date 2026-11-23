// #1: continuous-curvature (squircle) corners on every rounded rect.
//
// The shape is a superellipse: at 0% smoothing it is the plain
// border-radius; as smoothing rises the curve starts further along each edge
// and eases in, but its middle (the 45° point) stays exactly where the plain
// radius puts it, so a corner never looks bigger or smaller, only smoother.
// Both engines draw the same curve, at every size.
//
// Two ways to draw it:
//
// - Native, where the engine has `corner-shape` (Chrome 139+):
//   superellipse(1 + s) with the radius scaled so the curve's 45° point
//   matches the plain radius's (a superellipse at the same radius cuts the
//   corner much less, which reads as a different radius). Borders and
//   shadows follow the shape by themselves.
//
// - Path, everywhere else (WebKit: Safari and the app's WKWebView): each
//   element gets a clip-path that cuts only the thin slivers between its
//   circular corners and the smoothed ones (an even-odd path of a rect far
//   outside, the round rect and the smoothed one), so drop shadows and focus
//   rings outside the box are kept. The clip would also cut the element's
//   inset ring or border where the curves part, so the part it cuts is drawn
//   back along the smoothed edge, as an SVG layer in front of the element's
//   own backgrounds: the ring then follows the squircle all the way round,
//   one ring wide, never cropped.
//
// Circles, capsules and radii under 2px are left alone. Elements are only
// re-measured when their size or class changes, or a flag or setting does.
// Rules are shared between elements of the same size and look, in one
// stylesheet, and elements point at them with data-sq (or data-sq-h for
// one that paints only when hovered, pressed or on). Svelte rewrites inline
// styles, so nothing is written to them.
//
// start() is called by App.svelte while the flag is on and returns a stop
// function that removes every attribute, observer and rule it added.

const MIN_R = 2;
const FAR = 160; // the outer rect's reach past the element: room for shadows and focus rings
// Deck tabs draw their selected underline a pixel past their own box; a
// clip would notch both its ends (b-K28), so they keep CSS's round corners.
const SKIP = '.fp, .flag-show, svg, svg *, .modes button';
// When an element that draws nothing at rest may start to.
const STATES = ":hover, :active, :focus-visible, .on, .sel, .set, .lit, .playing, .rec, [aria-pressed='true'], [aria-checked='true'], [aria-selected='true'], [aria-expanded='true']";

/** Whether this engine draws squircles natively (CSS corner-shape). */
export const supported = () => typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'superellipse(2)');

/**
 * How much bigger a superellipse(1 + s) corner's radius must be for its 45°
 * point to sit where a circular corner of radius 1 puts it.
 */
export function nativeScale(s) {
  const n = 2 ** (1 + s); // superellipse(K) is |x|^(2^K) + |y|^(2^K) = 1
  return (1 - Math.SQRT1_2) / (1 - 2 ** (-1 / n));
}

/**
 * The smoothing that fits: a smoothed corner starts further along its edges
 * than its radius, so where there isn't room for that (a short key) it is
 * smoothed less, and its 45° point stays put.
 */
export function fit(w, h, radii, s) {
  const [tl, tr, br, bl] = radii;
  const room = Math.min(w / (tl + tr || 1e-9), w / (bl + br || 1e-9), h / (tl + bl || 1e-9), h / (tr + br || 1e-9));
  if (nativeScale(s) <= room) return s;
  let lo = 0;
  for (let i = 0, hi = s; i < 12; i++) {
    const m = (lo + hi) / 2;
    if (nativeScale(m) <= room) lo = m;
    else hi = m;
  }
  return Math.floor(lo * 100) / 100;
}

const f = (n) => Math.round(n * 1000) / 1000;

/**
 * One superellipse corner of the plain radius r as points on cubic curves,
 * from the box's horizontal edge to its vertical one, in distances from the
 * box's corner: the same curve corner-shape draws.
 * @returns {{ R: number, c: number[][] }} c: [x1, y1, x, y] per piece
 */
function superCorner(r, s) {
  const n = 2 ** (1 + s);
  const R = r * nativeScale(s);
  const at = (deg) => {
    // The point whose edge runs at this angle: a, b are its distances from the curve's centre, over R.
    const t = deg <= 0 ? 0 : deg >= 90 ? Infinity : Math.tan((deg * Math.PI) / 180) ** (1 / (n - 1));
    if (t === Infinity) return [0, R];
    const b = (1 + t ** n) ** (-1 / n);
    return [R - t * b * R, R - b * R];
  };
  // Quadratic pieces: each end's tangents meet at its control point. Shorter where the curve leaves the edge.
  const turns = [0, 6, 14, 28, 45, 62, 76, 84, 90];
  const c = [];
  for (let k = 0; k < turns.length - 1; k++) {
    const [p, q] = [at(turns[k]), at(turns[k + 1])];
    const [u, v] = [turns[k], turns[k + 1]].map((a) => [-Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)]);
    const z = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / (u[0] * v[1] - u[1] * v[0]);
    c.push([p[0] + u[0] * z, p[1] + u[1] * z, ...q]);
  }
  return { R, c };
}

/** The corners' pieces in order round the box: [start, pieces] each, clockwise from the top right. */
function corners(w, h, radii, s, x, y) {
  const [tl, tr, br, bl] = radii;
  const out = [];
  // [radius, box corner, which way "in from the corner" points, whether the curve is walked backwards]
  for (const [r, cx, cy, sx, sy, back] of [[tr, x + w, y, -1, 1, 0], [br, x + w, y + h, -1, -1, 1], [bl, x, y + h, 1, -1, 0], [tl, x, y, 1, 1, 1]]) {
    if (!(r > 0)) {
      out.push({ r: 0, cx, cy, sx, sy, back, d: `${f(cx)} ${f(cy)}`, start: [cx, cy] });
      continue;
    }
    const { R, c } = superCorner(r, s);
    const pt = (a, b) => `${f(cx + sx * a)} ${f(cy + sy * b)}`;
    let pieces = c.map((k) => `Q${pt(k[0], k[1])} ${pt(k[2], k[3])}`);
    let start = [cx + sx * R, cy];
    if (back) {
      const ends = [[R, 0], ...c.map((k) => [k[2], k[3]])];
      pieces = c.map((k, i) => `Q${pt(k[0], k[1])} ${pt(ends[i][0], ends[i][1])}`).reverse();
      start = [cx, cy + sy * R];
    }
    out.push({ r, cx, cy, sx, sy, back, d: pieces.join(''), start });
  }
  return out;
}

/** The smoothed rounded rect at (x, y), w × h, radii [tl, tr, br, bl]. */
export function squirclePath(w, h, radii, s, x = 0, y = 0) {
  return (
    corners(w, h, radii, s, x, y)
      .map((k, i) => `${i ? 'L' : 'M'}${f(k.start[0])} ${f(k.start[1])}${k.r ? k.d : ''}`)
      .join('') + 'Z'
  );
}

/**
 * What lies between a plain round corner and the smoothed one, for every
 * corner, as a clip (even-odd, in a rect reaching far past the box). Only the
 * slivers: an outline that ran along the box's own edges would be antialiased
 * a second time there, which drew a notch where each curve begins.
 */
export function slivers(w, h, radii, s, far) {
  let d = `M${-far} ${-far}H${f(w + far)}V${f(h + far)}H${-far}Z`;
  for (const { r, cx, cy, sx, sy, back, d: curve, start } of corners(w, h, radii, s, 0, 0)) {
    if (!r) continue;
    const ends = [`${f(cx + sx * r)} ${f(cy)}`, `${f(cx)} ${f(cy + sy * r)}`];
    if (back) ends.reverse();
    d += `M${f(start[0])} ${f(start[1])}${curve}L${ends[1]}A${f(r)} ${f(r)} 0 0 0 ${ends[0]}Z`;
  }
  return d;
}

/** The plain circular rounded rect, as CSS draws it. */
function roundPath(w, h, radii, x = 0, y = 0) {
  const [tl, tr, br, bl] = radii;
  return (
    `M${f(x + tl)} ${f(y)}L${f(x + w - tr)} ${f(y)}` +
    (tr ? `a${f(tr)} ${f(tr)} 0 0 1 ${f(tr)} ${f(tr)}` : '') +
    `L${f(x + w)} ${f(y + h - br)}` +
    (br ? `a${f(br)} ${f(br)} 0 0 1 ${f(-br)} ${f(br)}` : '') +
    `L${f(x + bl)} ${f(y + h)}` +
    (bl ? `a${f(bl)} ${f(bl)} 0 0 1 ${f(-bl)} ${f(-bl)}` : '') +
    `L${f(x)} ${f(y + tl)}` +
    (tl ? `a${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} ${f(-tl)}` : '') +
    'Z'
  );
}

/** One corner's used radius in px (the horizontal one, if elliptical). */
function px(v, size) {
  const first = v.split(' ')[0];
  return first.endsWith('%') ? (parseFloat(first) / 100) * size : parseFloat(first) || 0;
}

/** Splits a computed CSS list at top-level commas. */
function layers(v) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) (out.push(cur.trim()), (cur = ''));
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The element's ring: an inset 0 0 0 Npx box-shadow, or else its border. */
function ring(cs) {
  for (const l of layers(cs.boxShadow === 'none' ? '' : cs.boxShadow)) {
    if (!/\binset\b/.test(l)) continue;
    const color = l.match(/rgba?\([^)]*\)|#[0-9a-f]+|color\([^)]*\)/i)?.[0];
    const nums = l.replace(/rgba?\([^)]*\)|color\([^)]*\)/gi, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    const [x = 0, y = 0, blur = 0, spread = 0] = nums;
    if (!x && !y && !blur && spread > 0 && color) return { w: spread, color };
  }
  const bw = parseFloat(cs.borderTopWidth);
  if (bw > 0 && cs.borderTopStyle !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(cs.borderTopColor)) return { w: bw, color: cs.borderTopColor };
  return null;
}

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export function start() {
  const root = document.documentElement;
  const native = supported();
  const style = document.createElement('style');
  style.dataset.flag = 'squircles';
  document.head.append(style);
  const sheet = /** @type {CSSStyleSheet} */ (style.sheet);
  /** @type {Map<string, string>} key → rule id */
  const rules = new Map();
  /** @type {Set<Element>} */
  const tracked = new Set();
  /** @type {WeakMap<Element, { w: number, h: number }>} */
  let sizes = new WeakMap();
  let smoothing = 0.6;

  function readSmoothing() {
    const v = parseFloat(root.style.getPropertyValue('--flag-squircles-smoothing'));
    smoothing = Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.6;
  }

  /** A rule's id for this key, making the rule if it's new. */
  function rule(key, make) {
    let id = rules.get(key);
    if (id) return id;
    if (rules.size > 400) compact();
    id = String(rules.size + 1) + '-' + Math.random().toString(36).slice(2, 6);
    rules.set(key, id);
    for (const css of make(id)) sheet.insertRule(css, sheet.cssRules.length);
    return id;
  }

  /** Give one element the right corners for its size, or none. */
  function update(el) {
    const size = sizes.get(el);
    if (!size) return;
    const { w, h } = size;
    // Read the element's own look, without what this added.
    el.removeAttribute('data-sq');
    el.removeAttribute('data-sq-h');
    const cs = getComputedStyle(el);
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => px(v, w));
    // CSS shrinks radii that don't fit; so does this.
    const scale = Math.min(1, w / (radii[0] + radii[1] || 1), w / (radii[2] + radii[3] || 1), h / (radii[0] + radii[3] || 1), h / (radii[1] + radii[2] || 1));
    const r = radii.map((v) => f(v * scale));
    const half = Math.min(w, h) / 2;
    // Nothing to smooth: no radius worth it, or a circle or capsule.
    if (!w || !h || Math.max(...r) < MIN_R || r.every((v) => v === 0 || v >= half - 0.5) || smoothing === 0) return;
    const sm = fit(w, h, r, smoothing);
    if (sm < 0.05) return;

    if (native) {
      const k = nativeScale(sm);
      const id = rule(`n:${r}:${sm}`, (id) => [
        `:root[data-flag-squircles] [data-sq='${id}'] { corner-shape: superellipse(${f(1 + sm)}); border-radius: ${r.map((v) => `${f(v * k)}px`).join(' ')} !important; }`,
      ]);
      el.setAttribute('data-sq', id);
      return;
    }

    // An element that draws nothing at rest (a ghost button, an unselected
    // row) is only clipped while it might: hovered, pressed, on, selected.
    const paints = cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0;
    const rg = ring(cs);
    const bg = cs.backgroundImage;
    const key = `p:${f(w)}x${f(h)}:${r}:${sm}:${rg ? `${rg.w}/${rg.color}` : ''}:${rg ? bg + cs.backgroundSize + cs.backgroundPosition + cs.backgroundRepeat + cs.backgroundOrigin + cs.backgroundClip : ''}`;
    const id = rule(key, (id) => {
      const sel = `:root[data-flag-squircles] :is([data-sq='${id}'], [data-sq-h='${id}']:is(${STATES}))`;
      const clip = slivers(w, h, r, sm, FAR);
      const out = [`${sel} { clip-path: path(evenodd, '${clip}'); }`];
      if (rg) {
        // The ring along the smoothed edge, less the part of the element's
        // own (round) ring that the clip leaves: together, one even ring.
        const t = rg.w;
        const inner = r.map((v) => Math.max(0, v - t));
        const sq = squirclePath(w, h, r, sm) + squirclePath(w - 2 * t, h - 2 * t, inner, sm, t, t);
        const rd = roundPath(w, h, r) + roundPath(w - 2 * t, h - 2 * t, inner, t, t);
        const svg =
          `<svg xmlns='http://www.w3.org/2000/svg' width='${f(w)}' height='${f(h)}' viewBox='0 0 ${f(w)} ${f(h)}'>` +
          `<defs><mask id='m' maskUnits='userSpaceOnUse' x='0' y='0' width='${f(w)}' height='${f(h)}'><rect width='${f(w)}' height='${f(h)}' fill='white'/><path d='${rd}' fill='black' fill-rule='evenodd'/></mask></defs>` +
          `<path d='${sq}' fill='${rg.color}' fill-rule='evenodd' mask='url(#m)'/></svg>`;
        const has = bg !== 'none';
        const pre = (v, first) => (has ? `${first}, ${v}` : first);
        out.push(
          `${sel} { background-image: ${pre(bg, svgUrl(svg))}; background-size: ${pre(cs.backgroundSize, '100% 100%')}; background-position: ${pre(cs.backgroundPosition, '0 0')}; background-repeat: ${pre(cs.backgroundRepeat, 'no-repeat')}; background-origin: ${pre(cs.backgroundOrigin, 'border-box')}; background-clip: ${pre(cs.backgroundClip, 'border-box')}; }`,
        );
      }
      return out;
    });
    el.setAttribute(paints ? 'data-sq' : 'data-sq-h', id);
  }

  /** Rebuild the sheet with only the rules elements point at now. */
  function compact() {
    const inUse = new Set();
    for (const el of document.querySelectorAll('[data-sq], [data-sq-h]')) inUse.add(el.getAttribute('data-sq') ?? el.getAttribute('data-sq-h'));
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const m = /** @type {CSSStyleRule} */ (sheet.cssRules[i]).selectorText?.match(/data-sq=["']([^"']+)/);
      if (m && !inUse.has(m[1])) sheet.deleteRule(i);
    }
    for (const [k, id] of rules) if (!inUse.has(id)) rules.delete(k);
  }

  // While an element is being resized (the library split, the window), its
  // clip would change every frame; in the path mode it drops its corners
  // while the size changes and gets them back once it has held still.
  /** @type {Set<Element>} */
  const settling = new Set();
  /** @type {WeakMap<Element, number>} */
  const changed = new WeakMap();
  let settle = 0;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      const had = sizes.get(e.target);
      const el = /** @type {HTMLElement} */ (e.target);
      sizes.set(el, box ? { w: box.inlineSize, h: box.blockSize } : { w: el.offsetWidth, h: el.offsetHeight });
      // A small one that has held still changes once (a key whose words grew):
      // it's cut again at once. Changing again soon after, it's being resized.
      const at = performance.now();
      const again = at - (changed.get(el) ?? -1e9) < 200;
      changed.set(el, at);
      const small = (box ? box.inlineSize * box.blockSize : 1e9) < 20000;
      if (had && !native && (again || !small)) {
        el.removeAttribute('data-sq');
        el.removeAttribute('data-sq-h');
        settling.add(el);
      } else update(el);
    }
    if (settling.size) {
      clearTimeout(settle);
      settle = setTimeout(() => {
        for (const el of settling) if (el.isConnected) update(el);
        settling.clear();
      }, 150);
    }
  });

  /** Start watching an element if it has a radius. */
  function consider(el) {
    if (tracked.has(el) || el.closest(SKIP)) return;
    const cs = getComputedStyle(el);
    const any = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].some((v) => parseFloat(v) > 0);
    if (!any) return;
    tracked.add(el);
    ro.observe(el, { box: 'border-box' });
  }
  function scan(node) {
    if (!(node instanceof Element)) return;
    consider(node);
    for (const el of node.querySelectorAll('*')) consider(el);
  }
  function forget(node) {
    if (!(node instanceof Element)) return;
    for (const el of [node, ...node.querySelectorAll('*')]) {
      if (!tracked.delete(el)) continue;
      ro.unobserve(el);
      sizes.delete(el);
      settling.delete(el);
    }
  }

  /** Radii or smoothing may have changed: look at everything again. */
  function rescan() {
    while (sheet.cssRules.length) sheet.deleteRule(0);
    rules.clear();
    readSmoothing();
    for (const el of document.querySelectorAll('[data-sq], [data-sq-h]')) {
      el.removeAttribute('data-sq');
      el.removeAttribute('data-sq-h');
    }
    for (const el of tracked) ro.unobserve(el);
    tracked.clear();
    settling.clear();
    sizes = new WeakMap();
    scan(document.body);
  }

  // New elements (rows scrolling in, menus, toasts), and tracked elements
  // whose class changed (a row selected, a toggle turned on): their look,
  // and so their ring, may have too. Not style attributes: those change
  // every frame (meters, play heads).
  let pending = /** @type {Node[]} */ ([]);
  const restyled = new Set();
  let frame = 0;
  const mo = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === 'attributes') {
        const el = /** @type {Element} */ (rec.target);
        if (tracked.has(el)) restyled.add(el);
        continue;
      }
      rec.removedNodes.forEach(forget);
      pending.push(...rec.addedNodes);
    }
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        const nodes = pending;
        pending = [];
        nodes.forEach((n) => n.isConnected && scan(n));
        for (const el of restyled) if (el.isConnected) update(el);
        restyled.clear();
      });
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Flags and their settings live on <html> (attributes and CSS variables);
  // when they change, radii, looks or the smoothing may have too.
  let again = 0;
  let last = flagState();
  const rootMo = new MutationObserver(() => {
    const now = flagState();
    if (now === last) return;
    last = now;
    cancelAnimationFrame(again);
    again = requestAnimationFrame(rescan);
  });
  rootMo.observe(root, { attributes: true });
  function flagState() {
    return [...root.attributes]
      .filter((a) => a.name.startsWith('data-flag'))
      .map((a) => `${a.name}=${a.value}`)
      .concat(
        [...root.style]
          .filter((p) => p.startsWith('--flag'))
          .map((p) => `${p}=${root.style.getPropertyValue(p)}`),
      )
      .sort()
      .join(';');
  }

  rescan();

  return () => {
    mo.disconnect();
    rootMo.disconnect();
    ro.disconnect();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(again);
    clearTimeout(settle);
    for (const el of document.querySelectorAll('[data-sq], [data-sq-h]')) {
      el.removeAttribute('data-sq');
      el.removeAttribute('data-sq-h');
    }
    style.remove();
  };
}
