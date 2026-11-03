// Shared behaviour for knobs and faders, so every continuous control
// answers the same gestures: drag (⇧ for fine), scroll, arrow keys (⇧ for
// fine, Home/End for the ends), double-click or right-click to reset, and
// a gentle detent at the default value that ⇧ ignores.

/** How far, in pixels of drag, the detent holds the value at its default. */
export const DETENT_PX = 6;

/**
 * Applies the detent: a raw value within `px` pixels of `reset` snaps to it.
 * @param {number} raw @param {number} reset @param {number} perPx value per pixel
 */
export function detent(raw, reset, perPx, fine) {
  return !fine && Math.abs(raw - reset) < DETENT_PX * Math.abs(perPx) ? reset : raw;
}

/** Arrow / Home / End keys. Returns the new value, or null if the key isn't ours. */
export function keyValue(e, value, min, max) {
  const step = (max - min) * (e.shiftKey ? 0.01 : 0.05);
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return value + step;
    case 'ArrowDown':
    case 'ArrowLeft':
      return value - step;
    case 'Home':
      return min;
    case 'End':
      return max;
    case 'PageUp':
      return value + step * 4;
    case 'PageDown':
      return value - step * 4;
  }
  return null;
}
