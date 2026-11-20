// #64 (mixer): the crossfader's two scales disagreed (M4).
//
// The 41-tick ruler spans the whole row, while the fader's own five marks
// (and the cap's travel) are inset 6px each side, so the ends and quarters
// missed by 3-12px and the row showed two scales that don't agree. With the
// flag on the fader's own marks go (its centre tick stays) and the ruler is
// inset to the cap's travel. CSS only.
export default {
  id: 'crossfader-scale',
  n: 64,
  title: 'One scale on the crossfader',
  group: 'Controls',
  notes: 'style.css: .xr .fader .mark hidden, .xr .ruler width calc(100% - 12px) with 6px margins (the fader is inset 6px, so the cap centre travels exactly the ruler).',
};

/** Show me: the crossfader slammed to one side, a loupe on each end with the cap's travel drawn, flipping. */
export const show = {
  about: "The crossfader had two sets of marks, a ruler above and the fader's own marks below, and they didn't line up: the ends and quarters missed each other by a few pixels. Now there's one scale, and its ends are where the handle stops.",
  before: "The ruler's end ticks sit past the ends of the handle's travel, and the fader's own quarter marks below fall between the ruler's: two scales that disagree.",
  after: "One scale: the ruler's ends and quarters line up with where the handle actually goes, and the doubled marks under the slot are gone.",
  setup() {},
  target: '.mixer .xf',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const xr = app.$('.mixer .xr')?.getBoundingClientRect();
    const fader = app.$('.mixer .xr .fader')?.getBoundingClientRect();
    const ruler = app.$('.mixer .xr .ruler')?.getBoundingClientRect();
    if (!xr || !fader || !ruler) return;
    const zoom = 4;
    const size = { w: 260, h: (xr.height + 12) * zoom };
    const l = d.loupe('xl', { x: xr.left - 10, y: xr.top - 6 }, { zoom, size, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    // Where the cap's centre stops (the fader's left edge), against the ruler's first tick.
    const stop = l.map(fader.left, 0).x;
    const tick = l.map(ruler.left, 0).x;
    d.line(stop, l.rect.y, stop, l.rect.bottom, { c: d.C.ghost, dash: '5 4', w: 1.5 });
    const off = Math.abs(fader.left - ruler.left);
    d.text(l.rect.x, l.rect.bottom + 16, off < 0.5 ? "the ruler's end tick is where the handle stops (dashed)" : `the ruler's end tick is ${Math.round(off)}px past where the handle stops (dashed)`, { tone: off < 0.5 ? 'ok' : 'bad', fixed: true });
    void tick;
  },
};
