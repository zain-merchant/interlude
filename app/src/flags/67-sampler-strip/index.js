// #67 (mixer): the sampler strip says what to do and fits its dial (M8, C24).
//
// The Level dial's 40px box filled the 40px strip, touching both edges,
// with the close × crowding it; the eight slots were dark numbered wells
// that said nothing about dropping or clicking, and clicking an empty one
// did nothing. With the flag on (hooks in Sampler.svelte):
// - the Level dial is size 16 (34px with its ticks), 8px from its label,
//   and the close × is 8px further off;
// - empty slots get a faint ring over the well, and the first empty one
//   reads "Drop a track" in --fg-4;
// - clicking an empty slot puts the library's selected track in it, and
//   its tooltip says so.
export default {
  id: 'sampler-strip',
  n: 67,
  title: 'Sampler slots say what they take, and the Level dial fits',
  group: 'Controls',
  notes: 'Sampler.svelte: Knob size 16, "Drop a track" in the first empty slot, click an empty slot = put(selected()), empty slots not aria-disabled. style.css: dial gap 8, close margin 8, --line ring on empty wells.',
};

/** Show me: the sampler open with a track selected; loupes on the first slots and on the Level dial, flipping. */
export const show = {
  about: "The sampler's empty slots were dark boxes that gave no hint you could drop a track on them, clicking one did nothing, and the Level dial touched the strip's edges. Now an empty slot says \"Drop a track\", a click loads the selected track, and the dial fits.",
  before: 'Eight dark numbered boxes: nothing says to drag a track onto them, and clicking one does nothing. At the right end, the Level dial fills the strip from edge to edge and crowds the ×.',
  after: 'Empty slots have a faint outline and the first one reads "Drop a track"; clicking an empty slot loads the track selected in the library. The Level dial sits inside the strip with room around it.',
  async setup(app, ctx) {
    if (!app.$('.sampler')) {
      ctx.opened = true;
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
      await app.key('KeyS');
      await app.until(() => app.$('.sampler'), 2000, 'the sampler');
    }
    await app.selectRow(2);
    app.hideTips();
  },
  async cleanup(app, ctx) {
    if (ctx.opened && app.$('.sampler')) {
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
      await app.key('KeyS');
    }
  },
  target: '.sampler',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const s = app.$('.sampler')?.getBoundingClientRect();
    const k = app.$('.sampler .knob')?.getBoundingClientRect();
    const slots = app.$$('.sampler .slot').map((e) => e.getBoundingClientRect());
    if (!s || !k || slots.length < 3) return;
    const zoom = 3;
    const a = d.loupe('slots', { x: slots[0].left - 8, y: s.top - 4 }, { zoom, size: { w: (slots[1].right + 8 - slots[0].left + 8) * zoom, h: (s.height + 8) * zoom }, at: { x: s.left, y: s.top - (s.height + 8) * zoom - 40 }, caption: '' });
    const b = d.loupe('level', { x: k.left - 40, y: s.top - 4 }, { zoom, size: { w: (s.right + 8 - k.left + 40) * zoom, h: (s.height + 8) * zoom }, at: { x: s.right - (s.right + 8 - k.left + 40) * zoom, y: s.top - (s.height + 8) * zoom - 40 }, caption: '' });
    ctx.at = a.rect;
    const after = ctx.phase === 'after';
    d.text(a.rect.x, a.rect.bottom + 16, after ? 'outlined, "Drop a track", click loads the selected track' : 'blank wells: no hint, a click does nothing', { tone: after ? 'ok' : 'bad', fixed: true });
    d.text(b.rect.x, b.rect.bottom + 16, after ? 'the dial sits inside the strip' : 'the dial touches the strip edges', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
