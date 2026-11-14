// Drag and drop from the library onto the decks. The dragged track lives
// here rather than in dataTransfer, because WebKit hides dataTransfer
// contents until the drop and targets need to know what's coming.

export const drag = $state({ /** @type {import('./backend.js').LibraryTrack | null} */ track: null });

const MIME = 'application/x-oss-dj-track';

/** Starts dragging a library track. Use as the row's `ondragstart`. */
export function startDrag(e, track) {
  drag.track = track;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(MIME, track.path);
  e.dataTransfer.setData('text/plain', track.title);
  // The ghost is a small card with the title, not a picture of the row.
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = track.title;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 12, 14);
  setTimeout(() => ghost.remove());
}

export function endDrag() {
  drag.track = null;
}

/**
 * Svelte action that makes an element a drop target for library tracks.
 * While any track is being dragged the element gets `data-drop="ok"` or
 * `"blocked"` (when `blocked()` is true: the deck is playing), so every
 * target shows itself; the one under the pointer gets `"over"` or
 * `"blocked-over"`. Dropping calls `ondrop(track)` either way: for a
 * playing deck the caller warns first and replaces the track on a second
 * drop.
 * @param {HTMLElement} node
 * @param {{ ondrop: (track: any) => void, blocked?: () => boolean }} opts
 */
export function dropTarget(node, opts) {
  let depth = 0;
  const paint = () => {
    if (!drag.track) return void delete node.dataset.drop;
    const blocked = opts.blocked?.();
    node.dataset.drop = depth > 0 ? (blocked ? 'blocked-over' : 'over') : blocked ? 'blocked' : 'ok';
  };
  const stop = $effect.root(() => {
    $effect(() => {
      if (!drag.track) depth = 0;
      paint();
    });
  });
  const over = (e) => {
    if (!drag.track) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    paint();
  };
  const enter = (e) => {
    if (!drag.track) return;
    depth++;
    over(e);
  };
  // dragleave also fires when moving onto a child, so count enters.
  const leave = () => {
    depth = Math.max(0, depth - 1);
    paint();
  };
  const drop = (e) => {
    const track = drag.track;
    depth = 0;
    if (!track) return;
    e.preventDefault();
    drag.track = null;
    opts.ondrop(track);
  };
  const end = () => {
    depth = 0;
    drag.track = null;
  };
  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  window.addEventListener('dragend', end);
  return {
    update(next) {
      opts = next;
    },
    destroy() {
      stop();
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
      window.removeEventListener('dragend', end);
    },
  };
}
