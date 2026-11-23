// #67 (mixer): the sampler strip's Level dial fits, and empty slots show
// their edge (M8, C24).
//
// The Level dial's 40px box filled the strip, touching both edges. With the
// flag on the dial is size 14 (Sampler.svelte), its tick ring clear of the
// strip's edges and 8px from its label, and empty slots get a faint ring
// over the well and a hand cursor. Since the merge of upstream main the
// sampler is a row inside the library and upstream's empty slots say "Add
// sound" and open a file picker on a click, which covers what this flag's
// "Drag a track here" hint and click-to-load did, so those parts are gone.
export default {
  id: 'sampler-strip',
  n: 67,
  title: 'The sampler\'s Level dial fits, and empty slots show their edge',
  group: 'Controls',
  notes: 'Sampler.svelte: Knob size 14. style.css: dial 1px down, gap 8, 9px left of the label, --line ring on empty wells (brighter on hover) and a hand cursor. (The hint and click-to-load went with upstream\'s "Add sound" slots.)',
};

/** Show me: the sampler open with a track selected; loupes on the first slots and on the Level dial, flipping. */
export const show = {
  about: "The sampler's Level dial filled its strip from edge to edge, and empty slots were dark wells with no edge. Now the dial sits inside the strip, and an empty slot has a faint outline you can aim at.",
  before: 'The Level dial touches the strip above and below; the empty slots are dark wells with no edge.',
  after: 'The Level dial sits inside the strip with room around it, and each empty slot has a faint outline (brighter under the pointer).',
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
    d.text(a.rect.x, a.rect.bottom + 16, after ? 'empty slots outlined' : 'empty slots: dark wells, no edge', { tone: after ? 'ok' : 'bad', fixed: true });
    d.text(b.rect.x, b.rect.bottom + 16, after ? 'the dial sits inside the strip' : 'the dial touches the strip edges', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
