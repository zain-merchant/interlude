// #110 (UI audit flag): where the light falls on the grooves, when it follows
// the pointer (style.css draws it). Only while that setting is on, once per
// frame at most, and only for the cut under the pointer.
import { flag, setting } from '../registry.svelte.js';

const CUTS = ".modes, .jumps, .nudge, .beats, .perf .step, .pitch .val, .bar .search";

$effect.root(() => {
  $effect(() => {
    if (!flag('dir-room-tint') || setting('dir-room-tint', 'glint') !== 'follow') return;
    let raf = 0;
    /** @param {PointerEvent} e */
    const move = (e) => {
      if (raf || e.buttons) return;
      const el = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest?.(CUTS));
      if (!el) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        // A lean, not a chase: a fifth of the way from the middle.
        el.style.setProperty('--glint-x', `${50 + ((e.clientX - r.left) / r.width - 0.5) * 40}%`);
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', move);
    };
  });
});
