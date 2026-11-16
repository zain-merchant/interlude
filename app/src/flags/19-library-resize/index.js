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

/** Show me: points at the handle and, while you drag it, draws the pointer against the library's top edge. */
export const show = {
  note: "Drag the handle above the library (outlined) up and down. The pink line follows the pointer and the dashed box is the library, with its height: on, its top edge stays under the pointer the whole way. Turn the flag off and drag again: the library drops to a 12px sliver while you hold the handle and jumps to its size when you let go.",
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
    if (!lib) return;
    d.box(lib, { c: d.C.aid, dash: '3 3', label: `library ${Math.round(lib.height)}px` });
    if (ctx.pointer != null) {
      const off = Math.round(lib.top - 6 - ctx.pointer);
      d.hguide(ctx.pointer, { c: d.C.hl, label: off ? `pointer: library top ${off > 0 ? off + 'px below' : -off + 'px above'} it` : 'pointer: library top follows', lx: lib.left + 220 });
    }
  },
};
