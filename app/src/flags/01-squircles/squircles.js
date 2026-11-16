// #1: continuous-curvature (squircle) corners on every rounded rect.
//
// CSS says this directly: `corner-shape: superellipse(k)` changes the curve
// of a corner without changing its radius, and draws borders, box-shadows
// and outlines along the new curve, so nothing is cropped. k = 1 is the
// plain circular corner, k = 2 is the squircle; the Smoothing setting maps
// 0 to 100% onto that span.
//
// It can't be one blanket rule: a superellipse on a capsule or a circle (the
// switches, dots, the play head knob) would square it off. So this marks the
// elements that are rounded rects (data-sq) and the stylesheet gives only
// those the corner shape (style.css).
//
// Where an engine has no corner-shape (WebKit, which the app ships in, as of
// macOS 26.4; Chrome before 139) this does nothing at all and the corners
// stay plain border-radius.
//
// start() is called by App.svelte while the flag is on and returns a stop
// function that removes every attribute and observer it added.

const MIN_R = 4;
const SKIP = '.flagbar, .flag-show, svg, svg *';

/** Whether this engine can draw squircles natively. */
export const supported = () => typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'superellipse(2)');

/** One corner's used radius in px (the horizontal one, if elliptical). */
function px(v, size) {
  const first = v.split(' ')[0];
  return first.endsWith('%') ? (parseFloat(first) / 100) * size : parseFloat(first) || 0;
}

export function start() {
  if (!supported()) return () => {};
  const root = document.documentElement;
  /** @type {Set<Element>} */
  const tracked = new Set();

  /** Mark one element if it's a rounded rect at its current size. */
  function update(el, w, h) {
    const cs = getComputedStyle(el);
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => px(v, w));
    // CSS shrinks radii that don't fit; so does this.
    const scale = Math.min(1, w / (radii[0] + radii[1] || 1), w / (radii[2] + radii[3] || 1), h / (radii[0] + radii[3] || 1), h / (radii[1] + radii[2] || 1));
    const r = radii.map((v) => v * scale);
    const half = Math.min(w, h) / 2;
    // Nothing to smooth: no radius worth it, or a circle or capsule.
    const rect = w && h && Math.max(...r) >= MIN_R && !r.every((v) => v === 0 || v >= half - 0.5);
    el.toggleAttribute('data-sq', !!rect);
  }

  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      const el = /** @type {HTMLElement} */ (e.target);
      update(el, box ? box.inlineSize : el.offsetWidth, box ? box.blockSize : el.offsetHeight);
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
    }
  }

  /** Radii may have changed (a flag or setting): look at everything again. */
  function rescan() {
    for (const el of document.querySelectorAll('[data-sq]')) el.removeAttribute('data-sq');
    for (const el of tracked) ro.unobserve(el);
    tracked.clear();
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

  // Other flags change radii through attributes on <html>; look again when
  // they change. (The smoothing itself is a CSS variable, so it needs no
  // rescan.)
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
    for (const el of document.querySelectorAll('[data-sq]')) el.removeAttribute('data-sq');
  };
}
