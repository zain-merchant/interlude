// #68 (mixer): small fixes from the critique panel's backlog.
//
// - a-K45: a dial's pointer was a 2px line on a dark cap, hard to read at a
//   glance; it's 3px with rounded ends.
// - e-K74: the sampler slot's menu said "Put Afterglow here" while the menu
//   itself half covered the slot; it says "Load Afterglow into slot 2"
//   (Sampler.svelte).
// Checked and left as they are (no change): b-K63 (the hairline above the
// crossfader), b-K65 (fader caps near the top), e-K67 (disabled items in an
// empty slot's menu keep its shape); b-K53 closes with #60 (meters).
export default {
  id: 'mixer-polish',
  n: 68,
  title: 'Mixer details: dial pointers, sampler menu',
  group: 'Polish',
  notes: 'style.css: .dial i 3px, rounded. Sampler.svelte: slot menu names the slot.',
};

/** Show me: channel A's Trim dial magnified, flipping. */
export const show = {
  about: "The line on each dial that shows where it points was a thin hairline, hard to read at arm's length. Now it's a little thicker with rounded ends. (The sampler's slot menu also names the slot it acts on.)",
  before: "The pointer on each dial is a 2px hairline: from a step back you can't tell where the dials sit.",
  after: 'Each pointer is a 3px rounded bar, so every dial position reads at a glance.',
  setup() {},
  target: (app) => [app.$$('.mixer .ch')[0]],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const k = app.$$('.mixer .ch')[0]?.querySelector('.knob .wrap')?.getBoundingClientRect();
    if (!k) return;
    const zoom = 5;
    const l = d.loupe('ptr', { x: k.left, y: k.top }, { zoom, size: { w: k.width * zoom, h: k.height * zoom }, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'a 3px rounded pointer' : 'a 2px hairline pointer', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
