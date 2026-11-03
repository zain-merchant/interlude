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
}

export function endDrag() {
  drag.track = null;
}

/**
 * Svelte action that makes an element a drop target for library tracks.
 * While a track hovers it, the element gets `data-drop="ok"`, or
 * `data-drop="blocked"` when `blocked()` is true (the deck is playing).
 * Dropping calls `ondrop(track)` either way, so the caller can explain why
 * a blocked drop did nothing.
 * @param {HTMLElement} node
 * @param {{ ondrop: (track: any) => void, blocked?: () => boolean }} opts
 */
export function dropTarget(node, opts) {
  let depth = 0;
  const clear = () => {
    depth = 0;
    delete node.dataset.drop;
  };
  const over = (e) => {
    if (!drag.track) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = opts.blocked?.() ? 'none' : 'copy';
    node.dataset.drop = opts.blocked?.() ? 'blocked' : 'ok';
  };
  const enter = (e) => {
    if (!drag.track) return;
    depth++;
    over(e);
  };
  // dragleave also fires when moving onto a child, so count enters.
  const leave = () => {
    if (--depth <= 0) clear();
  };
  const drop = (e) => {
    const track = drag.track;
    clear();
    if (!track) return;
    e.preventDefault();
    drag.track = null;
    opts.ondrop(track);
  };
  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  window.addEventListener('dragend', clear);
  return {
    update(next) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
      window.removeEventListener('dragend', clear);
    },
  };
}
