// #1: continuous-curvature (squircle) corners on every rounded rect.
//
// CSS can say this directly with `corner-shape: superellipse()`, but the
// webview the app ships in (WebKit) doesn't support it yet, and neither does
// the Chromium the audit tests in. So this finds every element with a
// rounded-rect radius and gives it a clip-path that trims the thin slivers
// between its circular corners and a smoothed (Figma/iOS style) corner of the
// same radius.
//
// The clip is an even-odd path of three shapes: a rect far outside the
// element, the element's own circular rounded rect, and the smoothed one
// inside it. Only the slivers between the last two fall outside the clip, so
// what's drawn outside the box survives: drop shadows, focus rings, popovers.
//
// Clips are shared rules in one stylesheet, keyed by size and radii, and
// elements point at them with a data-sq attribute. Svelte rewrites inline
// styles (the library rows' positions), so nothing is written to them.
//
// Circles, capsules and radii under 4px are left alone: there's nothing to
// smooth. The "native" method uses `corner-shape` instead where an engine
// supports it, and only marks the elements (so circles stay circles); it is
// untested, as no engine the audit ran supports it.
//
// start() is called by App.svelte while the flag is on and returns a stop
// function that removes every attribute, observer and rule it added.

const MIN_R = 4;
const FAR = 160; // the outer rect's reach past the element: room for shadows and focus rings
const SKIP = '.flagbar, svg, svg *';
// When an element that draws nothing at rest may start to.
const STATES = ":hover, :active, :focus-visible, .on, .sel, .set, .lit, .playing, .rec, [aria-pressed='true'], [aria-checked='true'], [aria-selected='true'], [aria-expanded='true']";

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

/** The smoothed rounded rect, w × h, radii [tl, tr, br, bl]. */
function squirclePath(w, h, radii, s) {
  const budget = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => (r > 0 ? corner(r, s, budget) : null));
  let d = '';
  // Top edge, then the top-right corner.
  d += tr ? `M${f(w - tr.p)} 0` : `M${f(w)} 0`;
  if (tr) {
    const { a, b, c, d: dd, L, r } = tr;
    d += `c${f(a)} 0 ${f(a + b)} 0 ${f(a + b + c)} ${f(dd)}a${f(r)} ${f(r)} 0 0 1 ${f(L)} ${f(L)}c${f(dd)} ${f(c)} ${f(dd)} ${f(b + c)} ${f(dd)} ${f(a + b + c)}`;
  }
  d += `L${f(w)} ${f(br ? h - br.p : h)}`;
  if (br) {
    const { a, b, c, d: dd, L, r } = br;
    d += `c0 ${f(a)} 0 ${f(a + b)} ${f(-dd)} ${f(a + b + c)}a${f(r)} ${f(r)} 0 0 1 ${f(-L)} ${f(L)}c${f(-c)} ${f(dd)} ${f(-(b + c))} ${f(dd)} ${f(-(a + b + c))} ${f(dd)}`;
  }
  d += `L${f(bl ? bl.p : 0)} ${f(h)}`;
  if (bl) {
    const { a, b, c, d: dd, L, r } = bl;
    d += `c${f(-a)} 0 ${f(-(a + b))} 0 ${f(-(a + b + c))} ${f(-dd)}a${f(r)} ${f(r)} 0 0 1 ${f(-L)} ${f(-L)}c${f(-dd)} ${f(-c)} ${f(-dd)} ${f(-(b + c))} ${f(-dd)} ${f(-(a + b + c))}`;
  }
  d += `L0 ${f(tl ? tl.p : 0)}`;
  if (tl) {
    const { a, b, c, d: dd, L, r } = tl;
    d += `c0 ${f(-a)} 0 ${f(-(a + b))} ${f(dd)} ${f(-(a + b + c))}a${f(r)} ${f(r)} 0 0 1 ${f(L)} ${f(-L)}c${f(c)} ${f(-dd)} ${f(b + c)} ${f(-dd)} ${f(a + b + c)} ${f(-dd)}`;
  }
  return d + 'Z';
}

/** The plain circular rounded rect, as CSS draws it. @param {number} w @param {number} h @param {number[]} radii */
function roundPath(w, h, radii) {
  const [tl, tr, br, bl] = radii;
  return (
    `M${f(tl)} 0L${f(w - tr)} 0` +
    (tr ? `a${f(tr)} ${f(tr)} 0 0 1 ${f(tr)} ${f(tr)}` : '') +
    `L${f(w)} ${f(h - br)}` +
    (br ? `a${f(br)} ${f(br)} 0 0 1 ${f(-br)} ${f(br)}` : '') +
    `L${f(bl)} ${f(h)}` +
    (bl ? `a${f(bl)} ${f(bl)} 0 0 1 ${f(-bl)} ${f(-bl)}` : '') +
    `L0 ${f(tl)}` +
    (tl ? `a${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} ${f(-tl)}` : '') +
    'Z'
  );
}

/** One corner's used radius in px (the horizontal one, if elliptical). */
function px(v, size) {
  const first = v.split(' ')[0];
  return first.endsWith('%') ? (parseFloat(first) / 100) * size : parseFloat(first) || 0;
}

export function start() {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.dataset.flag = 'squircles';
  document.head.append(style);
  const sheet = /** @type {CSSStyleSheet} */ (style.sheet);
  /** @type {Map<string, string>} key → data-sq value */
  const rules = new Map();
  /** @type {Set<Element>} */
  const tracked = new Set();
  /** @type {WeakMap<Element, { w: number, h: number }>} */
  let sizes = new WeakMap();
  let smoothing = 0.6;
  let native = false;

  function settings() {
    const v = parseFloat(root.style.getPropertyValue('--flag-squircles-smoothing'));
    smoothing = Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.6;
    // Native is opt-in: no engine the audit could run supports it, and a CSS
    // superellipse pushes corners outward where this clip trims inward.
    const method = root.getAttribute('data-flag-squircles-method') ?? 'clip';
    native = method === 'native' && CSS.supports('corner-shape', 'superellipse(2)');
    sheet.insertRule(
      // superellipse(1) is a circular corner; 2 is the squircle. Smoothing
      // 0 to 100% maps onto that span.
      `:root[data-flag-squircles] [data-sq='native'] { corner-shape: superellipse(${f(1 + smoothing)}); }`,
      0,
    );
  }

  /** Give one element the right clip for its size, or none. */
  function update(el) {
    const size = sizes.get(el);
    if (!size) return;
    const { w, h } = size;
    const cs = getComputedStyle(el);
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => px(v, w));
    // CSS shrinks radii that don't fit; so does this.
    const scale = Math.min(1, w / (radii[0] + radii[1] || 1), w / (radii[2] + radii[3] || 1), h / (radii[0] + radii[3] || 1), h / (radii[1] + radii[2] || 1));
    const r = radii.map((v) => v * scale);
    const max = Math.max(...r);
    const half = Math.min(w, h) / 2;
    // Nothing to smooth: no radius worth it, or a circle or capsule.
    if (!w || !h || max < MIN_R || r.every((v) => v === 0 || v >= half - 0.5)) {
      el.removeAttribute('data-sq');
      el.removeAttribute('data-sq-h');
      return;
    }
    if (native) {
      el.removeAttribute('data-sq-h');
      el.setAttribute('data-sq', 'native');
      return;
    }
    // An element that draws nothing at rest (a ghost button, an unselected
    // row) is only clipped while it might: hovered, pressed, on, selected.
    // Clipping the many idle ones costs repaints for nothing.
    const paints = cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0;
    const [attr, other] = paints ? ['data-sq', 'data-sq-h'] : ['data-sq-h', 'data-sq'];
    el.removeAttribute(other);
    const key = `${f(w)}x${f(h)}:${r.map(f).join(',')}`;
    let id = rules.get(key);
    // Rules pile up as sizes come and go; past a few hundred, keep only
    // the ones in use.
    if (!id && rules.size > 300) {
      compact();
      id = rules.get(key);
    }
    if (!id) {
      id = String(rules.size + 1);
      rules.set(key, id);
      const path = `M${-FAR} ${-FAR}H${f(w + FAR)}V${f(h + FAR)}H${-FAR}Z` + roundPath(w, h, r) + squirclePath(w, h, r, smoothing);
      sheet.insertRule(`:root[data-flag-squircles] :is([data-sq='${id}'], [data-sq-h='${id}']:is(${STATES})) { clip-path: path(evenodd, '${path}'); }`, sheet.cssRules.length);
    }
    if (el.getAttribute(attr) !== id) el.setAttribute(attr, id);
  }

  /** Rebuild the sheet with only the rules elements point at now. */
  function compact() {
    const inUse = new Set();
    for (const el of document.querySelectorAll('[data-sq], [data-sq-h]')) inUse.add(el.getAttribute('data-sq') ?? el.getAttribute('data-sq-h'));
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const m = /** @type {CSSStyleRule} */ (sheet.cssRules[i]).selectorText?.match(/data-sq=["']([^"']+)/);
      if (m && m[1] !== 'native' && !inUse.has(m[1])) sheet.deleteRule(i);
    }
    for (const [k, id] of rules) if (!inUse.has(id)) rules.delete(k);
  }

  // While an element is being resized (the library split, the window), a
  // new clip every frame would mean a new rule and a style change every
  // frame. So a clipped element that changes size drops its clip (its
  // plain round corners differ by a fraction of a pixel) and gets the
  // new one once the size has held still.
  /** @type {Set<Element>} */
  const settling = new Set();
  let settle = 0;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      // borderBoxSize is in the element's own CSS px, unaffected by
      // transforms (the toast) or the interface zoom.
      const had = sizes.get(e.target);
      sizes.set(e.target, box ? { w: box.inlineSize, h: box.blockSize } : { w: /** @type {HTMLElement} */ (e.target).offsetWidth, h: /** @type {HTMLElement} */ (e.target).offsetHeight });
      if (had && !native) {
        e.target.removeAttribute('data-sq');
        e.target.removeAttribute('data-sq-h');
        settling.add(e.target);
      } else update(e.target);
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
      if (!tracked.has(el)) continue;
      ro.unobserve(el);
      tracked.delete(el);
      sizes.delete(el);
      settling.delete(el);
    }
  }

  /** Radii may have changed (a flag or setting): look at everything again. */
  function rescan() {
    while (sheet.cssRules.length) sheet.deleteRule(0);
    rules.clear();
    settings();
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

  // New elements (rows scrolling in, menus, toasts). Child lists only:
  // attribute changes happen every frame (meters, playheads).
  let pending = /** @type {Node[]} */ ([]);
  let frame = 0;
  const mo = new MutationObserver((records) => {
    for (const rec of records) {
      rec.removedNodes.forEach(forget);
      pending.push(...rec.addedNodes);
    }
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        const nodes = pending;
        pending = [];
        nodes.forEach((n) => n.isConnected && scan(n));
      });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Flags and their settings live on <html> (attributes and CSS variables);
  // when they change, radii may have too. (Attribute filters can't match a
  // prefix, so this compares the flag state on any change to <html>.)
  let again = 0;
  function scheduleRescan() {
    cancelAnimationFrame(again);
    again = requestAnimationFrame(rescan);
  }
  let last = flagState();
  const rootMo = new MutationObserver(() => {
    const now = flagState();
    if (now === last) return;
    last = now;
    scheduleRescan();
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
