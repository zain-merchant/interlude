// When a deck gets a new track, its words arrive instead of swapping in a
// single frame: each part rises a few pixels out of a slight blur, quickly,
// one just after the other (title, artist, tempo, key). Nothing moves in
// the layout, only how each part is drawn.
//
// `use:arrive={{ key, delay }}` plays when `key` changes to something new
// (a track's path, say), never on first render. Reduced motion: a fade.

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

function play(node, { delay = 0, y = 6, blur = 4, duration = 260 }) {
  if (reduced?.matches) {
    node.animate({ opacity: [0, 1] }, { duration: 160, delay, easing: 'ease-out', fill: 'backwards' });
    return;
  }
  node.animate(
    { opacity: [0, 1], transform: [`translateY(${y}px)`, 'none'], filter: [`blur(${blur}px)`, 'blur(0)'] },
    { duration, delay, easing: EASE, fill: 'backwards' },
  );
}

/**
 * @param {HTMLElement} node
 * @param {{ key: unknown, delay?: number, y?: number, blur?: number, duration?: number }} opts
 */
export function arrive(node, opts) {
  let last = opts.key;
  return {
    update(next) {
      if (next.key === last) return;
      last = next.key;
      if (next.key == null || next.key === false) return;
      for (const a of node.getAnimations()) a.cancel();
      play(node, next);
    },
  };
}
