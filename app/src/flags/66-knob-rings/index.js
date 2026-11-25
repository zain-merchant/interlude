// #66 (mixer): the set-and-forget rings were the brightest marks (M6).
//
// Master, Cue mix and the sampler's Level light their tick rings in full
// white with a glow, from the minimum up, so these dials you set once
// outshine the EQs you ride; Cue mix, a centred balance, lit half its ring
// at rest. With the flag on: global dials light in --fg-2 (per-deck ones
// keep their deck colour), Cue mix lights from 12 o'clock like the EQs,
// and lit ticks lose their glow. Hooks: Mixer.svelte, Sampler.svelte (arc,
// fromMin); style.css drops the drop-shadow.
export default {
  id: 'knob-rings',
  n: 66,
  title: 'Quieter rings on Master, Cue mix and sampler Level',
  group: 'Type and colour',
  notes: 'Rule: per-deck rings in --deck-a/--deck-b, global rings in --fg-2. Cue mix loses fromMin (lights from its 50% default). Lit ticks: no drop-shadow.',
};

/** Show me: the mixer's middle dials at their defaults, magnified, flipping. */
export const show = {
  about: "Master and Cue mix, dials you set once and leave, had the brightest, glowing rings in the mixer, brighter than the EQs you actually work. Now they're a step quieter, and Cue mix only lights when you move it off centre.",
  before: 'Master and Cue mix glow full white, the loudest marks in the mixer, and Cue mix lights half its ring even though it sits at the centre.',
  after: "Their rings light in a softer grey without a glow, so the deck-coloured EQ rings lead, and Cue mix stays dark at the centre like the EQs at 0 dB.",
  setup() {},
  target: (app) => app.$$('.mixer .cen .knob'),
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const ks = app.$$('.mixer .cen .knob').map((k) => k.getBoundingClientRect());
    const eq = app.$$('.mixer .ch')[0]?.getBoundingClientRect();
    if (!ks.length || !eq) return;
    const zoom = 2.5;
    const top = Math.min(...ks.map((r) => r.top)) - 6;
    const bottom = Math.max(...ks.map((r) => r.bottom)) + 6;
    const src = { x: eq.left - 6, y: top };
    const w = Math.max(...ks.map((r) => r.right)) + 8 - src.x;
    const l = d.loupe('rings', src, { zoom, size: { w: w * zoom, h: (bottom - top) * zoom }, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'Master and Cue mix a step under the EQ rings; Cue mix dark at the centre' : 'Master and Cue mix glow brightest; Cue mix half lit at the centre', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
