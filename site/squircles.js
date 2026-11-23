// Continuous-curvature (squircle) corners on every rounded rect on the
// page, ported from the app (app/src/flags/01-squircles/squircles.js).
//
// The shape is Figma's corner smoothing: at 0% it is the plain border-radius;
// as smoothing rises the curve starts further along each edge and eases in,
// but its middle (the 45° point) stays exactly where the plain radius puts
// it, so a corner never looks bigger or smaller, only smoother.
//
// Two ways to draw it:
//
// - Native, where the engine has `corner-shape` (Chrome 139+):
//   superellipse(1 + s) with the radius scaled so the curve's 45° point
//   matches the plain radius's. Borders, shadows and backdrop blurs follow
//   the shape by themselves.
//
// - Path, everywhere else (Safari): each element gets a clip-path that cuts
//   only the thin slivers between its circular corners and the smoothed
//   ones (an even-odd path of a rect far outside, the round rect and the
//   smoothed one), so drop shadows outside the box are kept. The clip would
//   also cut the element's inset ring or border where the curves part, so
//   that is drawn back along the smoothed edge, as an SVG layer in front of
//   the element's own backgrounds.
//
// Also ::before and ::after. Circles and capsules keep their shape (they have
// no straight edge to ease into: the maths gives the same curve back), and
// radii under 4px change by less than a tenth of a pixel, so both are left
// alone. Elements are only re-measured when their size or class changes:
// nothing runs at rest. In the path way a focused element's outline is cut to
// the smoothed shape too (it would be a round one). (?squircles=off turns it off; ?squircles=NN sets
// the smoothing, default 60.)

const MIN_R = 4;
const FAR = 240; // the outer rect's reach past the element: room for shadows and focus rings
// Not done here: what SVG draws; the nav's glass and edge, which the page
// shapes itself as they morph (index.html); the grain over a button, which
// takes the button's shape (style.css); the hero's glow, light with no edge;
// the Tune panel. In the native way also the phone menu's pieces, shaped by
// style.css, and in the path way the hero's frame, which clips itself while
// the app plays (its picture, its edge and the app in it are done).
const SKIP = 'svg, svg *, .grain, .glow, .nav-glass, .nav-edge, .dialkit-root, .dialkit-root *, [class*="dialkit"], [class*="dialkit"] *';
const SKIP_NATIVE = '.menu, .menu-sheet, .nav-rim, .nav-rim *';
const SELF_PATH = '.screen';
// When an element that draws nothing at rest may start to.
const STATES = ":hover, :active, :focus-visible, [aria-pressed='true'], [aria-checked='true'], [aria-selected='true'], [aria-expanded='true'], [data-done]";

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
 * The most smoothing a native corner of radius r has room for in half a side.
 */
function nativeFit(s, r, half) {
  if (r * nativeScale(s) <= half) return s;
  let lo = 0, hi = s;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (r * nativeScale(m) <= half) lo = m; else hi = m; }
  return lo;
}

/** Figma's corner smoothing, for one corner (figma-squircle's maths). */
function corner(r, s, budget) {
  r = Math.min(r, budget);
  let p = (1 + s) * r;
  // Not enough room for the full smoothing: use what fits.
  s = Math.max(0, Math.min(s, budget / r - 1));
  p = Math.min(p, budget);
  const arc = 90 * (1 - s);
  const L = Math.sin(((arc / 2) * Math.PI) / 180) * r * Math.SQRT2;
  const alpha = (90 - arc) / 2;
  const p3p4 = r * Math.tan(((alpha / 2) * Math.PI) / 180);
  const beta = 45 * s;
  const c = p3p4 * Math.cos((beta * Math.PI) / 180);
  const d = c * Math.tan((beta * Math.PI) / 180);
  const b = (p - L - c - d) / 3;
  const a = 2 * b;
  return { r, p, a, b, c, d, L };
}

const f = (n) => Math.round(n * 100) / 100;

/** The smoothed rounded rect at (x, y), w × h, radii [tl, tr, br, bl]. */
export function squirclePath(w, h, radii, s, x = 0, y = 0) {
  const budget = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => (r > 0 ? corner(r, s, budget) : null));
  let d = `M${f(x + (tr ? w - tr.p : w))} ${f(y)}`;
  if (tr) {
    const { a, b, c, d: dd, L, r } = tr;
    d += `c${f(a)} 0 ${f(a + b)} 0 ${f(a + b + c)} ${f(dd)}a${f(r)} ${f(r)} 0 0 1 ${f(L)} ${f(L)}c${f(dd)} ${f(c)} ${f(dd)} ${f(b + c)} ${f(dd)} ${f(a + b + c)}`;
  }
  d += `L${f(x + w)} ${f(y + (br ? h - br.p : h))}`;
  if (br) {
    const { a, b, c, d: dd, L, r } = br;
    d += `c0 ${f(a)} 0 ${f(a + b)} ${f(-dd)} ${f(a + b + c)}a${f(r)} ${f(r)} 0 0 1 ${f(-L)} ${f(L)}c${f(-c)} ${f(dd)} ${f(-(b + c))} ${f(dd)} ${f(-(a + b + c))} ${f(dd)}`;
  }
  d += `L${f(x + (bl ? bl.p : 0))} ${f(y + h)}`;
  if (bl) {
    const { a, b, c, d: dd, L, r } = bl;
    d += `c${f(-a)} 0 ${f(-(a + b))} 0 ${f(-(a + b + c))} ${f(-dd)}a${f(r)} ${f(r)} 0 0 1 ${f(-L)} ${f(-L)}c${f(-dd)} ${f(-c)} ${f(-dd)} ${f(-(b + c))} ${f(-dd)} ${f(-(a + b + c))}`;
  }
  d += `L${f(x)} ${f(y + (tl ? tl.p : 0))}`;
  if (tl) {
    const { a, b, c, d: dd, L, r } = tl;
    d += `c0 ${f(-a)} 0 ${f(-(a + b))} ${f(dd)} ${f(-(a + b + c))}a${f(r)} ${f(r)} 0 0 1 ${f(L)} ${f(-L)}c${f(c)} ${f(-dd)} ${f(b + c)} ${f(-dd)} ${f(a + b + c)} ${f(-dd)}`;
  }
  return d + 'Z';
}

/** The plain circular rounded rect, as CSS draws it. */
export function roundPath(w, h, radii, x = 0, y = 0) {
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

/** A clip that cuts only the slivers between the round corners and the smoothed ones. */
export const sliverPath = (w, h, r, s) => `M${-FAR} ${-FAR}H${f(w + FAR)}V${f(h + FAR)}H${-FAR}Z` + roundPath(w, h, r) + squirclePath(w, h, r, s);

/** The native shape, all four corners alike, as a path (to lay a line along). */
function superPath(w, h, R, s, o = 0) {
  const e = 2 / 2 ** (1 + s), pts = [];
  // (Each corner from its side to the next, clockwise from the top right.)
  const C = [[w - R, R, 1, -1], [w - R, h - R, 1, 1], [R, h - R, -1, 1], [R, R, -1, -1]];
  C.forEach(([cx, cy, sx, sy], i) => {
    for (let k = 0; k <= 24; k++) {
      const t = (i % 2 ? k : 24 - k) / 24 * (Math.PI / 2);
      let x = cx + sx * R * Math.cos(t) ** e, y = cy + sy * R * Math.sin(t) ** e;
      // (Set in by o: toward the middle of the corner's own curve.)
      if (o) { const nx = sx * Math.cos(t) ** (2 - e), ny = sy * Math.sin(t) ** (2 - e), n = Math.hypot(nx, ny) || 1; x -= (o * nx) / n; y -= (o * ny) / n; }
      pts.push(`${f(x)} ${f(y)}`);
    }
  });
  return `M${pts.join('L')}Z`;
}

/**
 * The hairline of a picture whose corners are cut smoother than it was drawn
 * (the recorded app): what the cut took of it, laid back along the new edge.
 * Its two ends, top and bottom, as background layers for a strip over each.
 */
function edgeStrips(w, h, r, s, native, line, light) {
  const k = native ? r * nativeScale(s) : r, all = [r, r, r, r], inn = all.map((v) => v - 1), H = Math.ceil(r * 2);
  const ring = native ? superPath(w, h, k, s) + superPath(w, h, k, s, 1) : squirclePath(w, h, all, s) + squirclePath(w - 2, h - 2, inn, s, 1, 1);
  const was = roundPath(w, h, all) + roundPath(w - 2, h - 2, inn, 1, 1);
  const svg = (y) =>
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${H}' viewBox='0 ${y} ${w} ${H}'><defs><linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='${r}'><stop stop-color='${light}'/><stop offset='1' stop-color='${line}'/></linearGradient><mask id='m' maskUnits='userSpaceOnUse' x='0' y='0' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='white'/><path d='${was}' fill='black' fill-rule='evenodd'/></mask></defs><path d='${ring}' fill='url(#g)' fill-rule='evenodd' mask='url(#m)'/></svg>`;
  return { H, top: svgUrl(svg(0)), foot: svgUrl(svg(h - H)) };
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
  const skip = native ? `${SKIP}, ${SKIP_NATIVE}` : SKIP;
  if (!root.dataset.squircles) root.dataset.squircles = '60';
  const style = document.createElement('style');
  style.dataset.squircles = '';
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
    const v = parseFloat(root.dataset.squircles);
    smoothing = Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.6;
    // (For what the page shapes itself: the nav, the phone menu.)
    root.style.setProperty('--sq-k', String(1 + smoothing));
    root.toggleAttribute('data-sqpath', !native && smoothing > 0);
    window.sq = native || !smoothing ? null : { s: smoothing, sliver: sliverPath, path: squirclePath };
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

  const ATTRS = { '': 'data-sq', '::before': 'data-sq-b', '::after': 'data-sq-a' };
  const ALL = '[data-sq], [data-sq-h], [data-sq-b], [data-sq-a]';
  const strip = (el) => { for (const a of ['data-sq', 'data-sq-h', 'data-sq-b', 'data-sq-a']) el.removeAttribute(a); };

  /** Give one element (and its ::before and ::after) the right corners for its size, or none. */
  function update(el) {
    const size = sizes.get(el);
    if (!size) return;
    // Read the element's own look, without what this added; and without what
    // it added to the elements round it, whose radius it may inherit.
    strip(el);
    const lent = [];
    if (native)
      for (let p = el.parentElement, n = 0; p && n < 3; p = p.parentElement, n++)
        if (p.hasAttribute('data-sq')) { lent.push([p, p.getAttribute('data-sq')]); p.removeAttribute('data-sq'); }
    const out = [];
    for (const ps of el.matches('img, input, video') ? [''] : ['', '::before', '::after']) {
      const cs = getComputedStyle(el, ps || null);
      if (ps && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue;
      let { w, h } = size;
      if (ps) {
        w = parseFloat(cs.width); h = parseFloat(cs.height);
        if (cs.boxSizing !== 'border-box') { w += parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth); h += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth); }
        // (Less than what it holds: it draws nothing.)
        if (!(w > 0 && h > 0)) continue;
      }
      const id = shape(el, ps, cs, w, h);
      if (id) out.push(id);
    }
    for (const [p, id] of lent) p.setAttribute('data-sq', id);
    if (el.matches('.app-host') && out.length) {
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius), { w, h } = size;
      rule(`edge:${w}x${h}:${r}:${smoothing}`, () => {
        const e = edgeStrips(w, h, r, smoothing, native, 'rgb(255 255 255 / 0.08)', 'rgb(255 255 255 / 0.2)');
        const box = `content: ''; position: absolute; z-index: 4; left: 0; right: 0; height: ${e.H}px; pointer-events: none;`;
        return [
          `:root[data-squircles] .app-host::before { ${box} top: 0; background: ${e.top} 0 0 / 100% 100% no-repeat; }`,
          `:root[data-squircles] .app-host::after { ${box} bottom: 0; background: ${e.foot} 0 0 / 100% 100% no-repeat; }`,
        ];
      });
    }
    for (const [attr, id] of out) el.setAttribute(attr, id);
  }

  /** One box's rule: [attribute, rule id], or null where there's nothing to smooth. */
  function shape(el, ps, cs, w, h) {
    // (Clipped by the page itself: a clip of ours would replace it.)
    if (!native && cs.clipPath !== 'none') return null;
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => px(v, w));
    // CSS shrinks radii that don't fit; so does this.
    const scale = Math.min(1, w / (radii[0] + radii[1] || 1), w / (radii[2] + radii[3] || 1), h / (radii[0] + radii[3] || 1), h / (radii[1] + radii[2] || 1));
    const r = radii.map((v) => f(v * scale));
    const half = Math.min(w, h) / 2;
    // Nothing to smooth: no radius worth it, or a circle or capsule.
    if (!w || !h || Math.max(...r) < MIN_R || r.every((v) => v === 0 || v >= half - 0.5) || smoothing === 0) return null;
    const attr = ATTRS[ps];

    if (native) {
      // (No more smoothing than the sides have room for, as the path does.)
      const s = nativeFit(smoothing, Math.max(...r), half);
      const k = nativeScale(s);
      return [attr, rule(`n${ps}:${r}:${f(s)}`, (id) => [
        `:root[data-squircles] [${attr}='${id}']${ps} { corner-shape: superellipse(${Math.round((1 + s) * 1000) / 1000}); border-radius: ${r.map((v) => `${f(v * k)}px`).join(' ')} !important; }`,
      ])];
    }

    // An element that draws nothing at rest (a ghost button, an unselected
    // row) is only clipped while it might: hovered, pressed, on, selected.
    const paints = !!ps || cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0 || cs.overflow !== 'visible' || el.matches('img, video');
    const rg = ring(cs);
    const bg = cs.backgroundImage;
    const key = `p${ps}:${f(w)}x${f(h)}:${r}:${smoothing}:${rg ? `${rg.w}/${rg.color}` : ''}:${rg ? bg + cs.backgroundSize + cs.backgroundPosition + cs.backgroundRepeat + cs.backgroundOrigin + cs.backgroundClip : ''}`;
    const id = rule(key, (id) => {
      const sel = ps ? `:root[data-squircles] [${attr}='${id}']${ps}` : `:root[data-squircles] :is([data-sq='${id}'], [data-sq-h='${id}']:is(${STATES}))`;
      const out = [`${sel} { clip-path: path(evenodd, '${sliverPath(w, h, r, smoothing)}'); }`];
      if (!ps) {
        // Focused: the outline (2px, as far out as --sq-off) drawn a little
        // thicker and cut to the smoothed shape.
        const at = (o) => squirclePath(w + 2 * o, h + 2 * o, r.map((v) => (v ? v + o : 0)), smoothing, -o, -o);
        for (const o of [0, 2]) {
          const far = `M${-FAR} ${-FAR}H${f(w + FAR)}V${f(h + FAR)}H${-FAR}Z`;
          out.push(`:root[data-squircles] :is([data-sq='${id}'], [data-sq-h='${id}'])[data-sq-f='${o}']:focus-visible { outline-width: ${o ? 4 : 3}px; outline-offset: ${o ? o - 1 : 0}px; clip-path: path(evenodd, '${far}${at(o + 4)}${at(o + 2)}${o ? at(o) + at(0) : ''}'); }`);
        }
      }
      if (rg) {
        // The ring along the smoothed edge, less the part of the element's
        // own (round) ring that the clip leaves: together, one even ring.
        const t = rg.w;
        const inner = r.map((v) => Math.max(0, v - t));
        const sq = squirclePath(w, h, r, smoothing) + squirclePath(w - 2 * t, h - 2 * t, inner, smoothing, t, t);
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
    return [paints ? attr : 'data-sq-h', id];
  }

  // (The focused element's outline: how far out it sits, for the rules above.)
  const onFocus = (e) => {
    const el = /** @type {Element} */ (e.target);
    if (native || !tracked.has(el) || !el.matches(':focus-visible')) return;
    el.removeAttribute('data-sq-f');
    const cs = getComputedStyle(el);
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) === 2) el.setAttribute('data-sq-f', parseFloat(cs.outlineOffset) > 1 ? '2' : '0');
  };
  document.addEventListener('focusin', onFocus);

  /** Rebuild the sheet with only the rules elements point at now. */
  function compact() {
    const inUse = new Set();
    for (const el of document.querySelectorAll(ALL)) for (const a of ['data-sq', 'data-sq-h', 'data-sq-b', 'data-sq-a']) if (el.hasAttribute(a)) inUse.add(el.getAttribute(a));
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const m = /** @type {CSSStyleRule} */ (sheet.cssRules[i]).selectorText?.match(/data-sq(?:-[ab])?=["']([^"']+)/);
      if (m && !inUse.has(m[1])) sheet.deleteRule(i);
    }
    for (const [k, id] of rules) if (!inUse.has(id)) rules.delete(k);
  }

  // While an element is being resized (the library split, the window), its
  // clip would change every frame; in the path mode it drops its corners
  // while the size changes and gets them back once it has held still.
  /** @type {Set<Element>} */
  const settling = new Set();
  let settle = 0;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      const had = sizes.get(e.target);
      const el = /** @type {HTMLElement} */ (e.target);
      sizes.set(el, box ? { w: box.inlineSize, h: box.blockSize } : { w: el.offsetWidth, h: el.offsetHeight });
      // (Shown for the first time, or again: at once.)
      if (had && had.w > 0 && had.h > 0 && !native) {
        strip(el);
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
    if (tracked.has(el) || el.closest(skip) || (!native && el.matches(SELF_PATH))) return;
    if (!['', '::before', '::after'].some((ps) => {
      const cs = getComputedStyle(el, ps || null);
      return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].some((v) => parseFloat(v) > 0);
    })) return;
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
    document.querySelectorAll(ALL).forEach(strip);
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

  rescan();

  return () => {
    mo.disconnect();
    document.removeEventListener('focusin', onFocus);
    ro.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    document.querySelectorAll(ALL).forEach(strip);
    style.remove();
    window.sq = null;
    root.removeAttribute('data-sqpath');
    root.style.removeProperty('--sq-k');
    delete root.dataset.squircles;
  };
}
