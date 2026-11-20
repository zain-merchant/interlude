// #19: resizing the library was janky and didn't show the new size.
//
// The handle between the decks and the library got the class "drag" while
// it was held (App.svelte, class:drag). "drag" is also the class of the
// window's title strip, and `.app > .drag` places that strip absolutely at
// the top of the window. So the moment a drag began the handle left the
// grid: the library fell into the 12px gap row (12px tall, its rows spilling
// out), the decks lost their place, and nothing showed the size being
// dragged until the pointer was let go, when it all jumped back. Measured
// per frame: the library was 12px tall for the whole drag, and the same on
// main. The handle now says "dragging" instead, so the layout follows the
// pointer every frame (the height was already set on each pointermove) and
// nothing else moves. Hook: App.svelte.
export default {
  id: 'library-resize',
  n: 19,
  title: 'Library resizes live as you drag',
  group: 'Stability',
  notes: 'Dragging the handle above the library resizes it under the pointer, every frame, instead of collapsing it to 12px until you let go (the handle took the title strip\'s "drag" class).',
};

/** Show me: points at the resize handle; while it's dragged, the pointer's line and the library's top are compared. */
export const show = {
  note: 'Drag the ringed handle above the library: its top follows the pointer as you drag (off, it waits until you let go).',
  target: '.app > .split',
  setup(app, ctx) {
    const move = (e) => (ctx.pointer = ctx.held ? e.clientY : null);
    const down = (e) => {
      ctx.held = !!/** @type {Element} */ (e.target).closest?.('.app > .split');
      move(e);
    };
    const up = () => ((ctx.held = false), (ctx.pointer = null));
    addEventListener('pointerdown', down, true);
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    ctx.off = () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
    };
  },
  cleanup(app, ctx) {
    ctx.off?.();
  },
  aid(d, app, ctx) {
    const lib = app.$('section.library')?.getBoundingClientRect();
    const split = app.$('.app > .split')?.getBoundingClientRect();
    if (!lib || !split) return;
    if (ctx.pointer == null) {
      d.text(split.left + split.width / 2, split.top - 13, 'drag me', { anchor: 'middle', fixed: true });
      return;
    }
    // While dragging: the pointer's line, and the gap to the library's top.
    d.hguide(ctx.pointer, { x1: lib.left, x2: lib.right });
    const gap = Math.round(lib.top - 6 - ctx.pointer);
    if (Math.abs(gap) > 1) d.measure(lib.left + 260, ctx.pointer, lib.left + 260, lib.top, { label: `library ${Math.abs(gap)}px behind`, tone: 'bad' });
    else d.text(lib.left + 260, ctx.pointer - 13, 'library follows', { tone: 'ok' });
  },
};
