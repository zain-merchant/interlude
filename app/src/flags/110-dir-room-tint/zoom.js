// #110 (UI audit flag): where the waveforms' zoom stands.
//
// Floating over the waveform (the default), or at the window's top right, out
// of it. There is one zoom and it is moved, never drawn twice. A title bar
// takes it by carrying an element with data-zoom-slot; without one it stands
// in a strip of its own (style.css).
/** @param {HTMLElement} node @param {boolean} bar */
export function placeZoom(node, bar) {
  const home = node.parentElement;
  const next = node.nextSibling;
  const slot = () => document.querySelector('[data-zoom-slot]') ?? node.ownerDocument.querySelector('.app');
  /** @type {MutationObserver | undefined} */
  let watch;
  const place = (/** @type {boolean} */ on) => {
    watch?.disconnect();
    watch = undefined;
    const put = () => {
      const to = on ? slot() : home;
      if (!to || node.parentElement === to) return;
      if (to === home) home?.insertBefore(node, next?.parentNode === home ? next : null);
      else to.append(node);
    };
    put();
    // The bar may be switched on or off while the app runs.
    if (on) {
      watch = new MutationObserver(put);
      watch.observe(document.body, { childList: true, subtree: true });
    }
  };
  // The app's root is in the page only after this runs.
  if (bar) queueMicrotask(() => place(true));
  return {
    update: place,
    destroy() {
      watch?.disconnect();
      node.remove();
    },
  };
}
