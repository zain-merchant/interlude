// #67 (mixer): the sampler strip says what to do and fits its dial (M8, C24).
//
// The Level dial's 40px box filled the 40px strip, touching both edges,
// with the close × crowding it; the eight slots were dark numbered wells
// that said nothing about dropping or clicking, and clicking an empty one
// did nothing. With the flag on (hooks in Sampler.svelte):
// - the Level dial is size 14, its tick ring 6px clear of the strip's
//   edges, 8px from its label and 12px from the close ×;
// - empty slots get a faint ring over the well, and the first empty one
//   reads "Drag a track here" ("Drag here" when narrow) in --fg-3;
// - clicking an empty slot puts the library's selected track in it, and
//   its tooltip says so.
export default {
  id: 'sampler-strip',
  n: 67,
  title: 'Sampler slots say what they take, and the Level dial fits',
  group: 'Controls',
  notes: 'Sampler.svelte: Knob size 14, "Drag a track here" in the first empty slot (it moves on as slots fill), click an empty slot = put(selected()), empty slots not aria-disabled. style.css: dial 2px down to centre its ring, gap 8, --line ring on empty wells, hint --fg-3, container query for the short hint.',
};

/** Show me: the sampler open with a track selected; loupes on the first slots and on the Level dial, flipping. */
export const show = {
  about: "The sampler's empty slots were dark boxes that gave no hint you could drop a track on them, clicking one did nothing, and the Level dial touched the strip's edges. Now an empty slot says \"Drag a track here\", a click loads the selected track, and the dial fits.",
  before: 'Eight dark numbered boxes: nothing says to drag a track onto them, and clicking one does nothing. At the right end, the Level dial fills the strip from edge to edge and crowds the ×.',
  after: 'Empty slots have a faint outline and the first one reads "Drag a track here"; clicking an empty slot loads the track selected in the library. The Level dial sits inside the strip with room around it.',
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
    // Two loupes side by side over the strip: the first two slots, and the Level dial with the ×.
    const h = s.height + 8;
    const wa = slots[1].right + 8 - (slots[0].left - 8);
    const wb = s.right + 8 - (k.left - 40);
    const zoom = Math.min(3, (innerWidth - 48) / 2 / Math.max(wa, wb));
    const y = Math.max(8, s.top - h * zoom - 40);
    const a = d.loupe('slots', { x: slots[0].left - 8, y: s.top - 4 }, { zoom, size: { w: wa * zoom, h: h * zoom }, at: { x: 16, y }, caption: '' });
    const b = d.loupe('level', { x: k.left - 40, y: s.top - 4 }, { zoom, size: { w: wb * zoom, h: h * zoom }, at: { x: innerWidth - 16 - wb * zoom, y }, caption: '' });
    ctx.at = a.rect;
    const after = ctx.phase === 'after';
    d.text(a.rect.x, a.rect.bottom + 16, after ? 'outlined, "Drag a track here", click loads the selected track' : 'blank wells: no hint, a click does nothing', { tone: after ? 'ok' : 'bad', fixed: true });
    d.text(b.rect.x, b.rect.bottom + 16, after ? 'the dial sits inside the strip' : 'the dial touches the strip edges', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
