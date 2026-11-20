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

/** Show me: drags the handle above the library down and holds it, once per flip; before, the library collapses while held; after, it follows the pointer. */
export const show = {
  about: 'Dragging the bar above the library to resize it made the library collapse to a thin strip until you let go, so you couldn\'t see the size you were picking. Now it follows your pointer as you drag.',
  before: 'Grab the bar above the library and drag: the library collapses to a thin strip and the layout jumps, and you only see the new size once you let go.',
  after: 'The library\'s top edge follows your pointer the whole way, so you can see exactly how big it will be before you let go.',
  period: 1600,
  setup(app, ctx) {
    const split = app.$('.app > .split');
    // The press is synthetic, so it can't capture the pointer; the handle's
    // setPointerCapture would throw. Only on this element, only for the show.
    split.setPointerCapture = () => {};
    ctx.split = split;
    const r = split.getBoundingClientRect();
    ctx.x = r.left + r.width / 2;
    ctx.y0 = r.top + r.height / 2;
    ctx.libTop = app.$('section.library').getBoundingClientRect().top;
    ctx.pointer = null;
  },
  /** Lets go (back where the drag started, so the height is as it was), then presses and drags down 120px, and holds. */
  async each(app, ctx) {
    const split = ctx.split;
    const at = (y) => ({ bubbles: true, cancelable: true, composed: true, clientX: ctx.x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' });
    if (ctx.pointer != null) {
      split.dispatchEvent(new PointerEvent('pointermove', at(ctx.y0)));
      split.dispatchEvent(new PointerEvent('pointerup', { ...at(ctx.y0), buttons: 0 }));
      ctx.pointer = null;
      await app.wait(250);
    }
    split.dispatchEvent(new PointerEvent('pointerdown', at(ctx.y0)));
    ctx.pointer = ctx.y0;
    for (let i = 1; i <= 14; i++) {
      await app.wait(30);
      ctx.pointer = ctx.y0 + (120 * i) / 14;
      split.dispatchEvent(new PointerEvent('pointermove', at(ctx.pointer)));
    }
  },
  cleanup(app, ctx) {
    const split = ctx.split;
    if (!split) return;
    if (ctx.pointer != null) {
      const at = { bubbles: true, clientX: ctx.x, clientY: ctx.y0, button: 0, pointerId: 1, pointerType: 'mouse' };
      split.dispatchEvent(new PointerEvent('pointermove', { ...at, buttons: 1 }));
      split.dispatchEvent(new PointerEvent('pointerup', at));
    }
    delete split.setPointerCapture;
  },
  target: '.app > .split',
  badge: (app, ctx) => (ctx.pointer == null ? null : new DOMRect(ctx.x - 110, ctx.pointer + 44, 10, 10)),
  aid(d, app, ctx) {
    const lib = app.$('section.library')?.getBoundingClientRect();
    if (!lib || ctx.pointer == null) return;
    const y = ctx.pointer;
    // Where your pointer is (and so where the library's top edge should be).
    d.hguide(y, { x1: lib.left, x2: lib.right, dash: '5 4', c: d.C.ghost });
    d.circle(ctx.x, y, 9, { c: '#fff', w: 1.5 });
    d.dot(ctx.x, y, { r: 4, c: '#fff' });
    const follows = ctx.phase === 'after' && Math.abs(lib.top - (ctx.libTop + (y - ctx.y0))) < 6;
    d.text(ctx.x + 16, y, follows ? "your pointer: the library's top edge comes with it" : 'your pointer: the library has collapsed to a strip', { tone: follows ? 'ok' : 'bad', free: true, fixed: true });
  },
};
