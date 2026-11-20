// #9: nicer normal buttons.
//
// The shared .btn (app.css) is a transparent control with a 1px outline at
// 11% white (--line-2), which also draws the mixer's headphone and Rec
// buttons and the toast's Undo. This flag offers whole styles to compare,
// applied to every normal button: Sync, the beat jump box, Sampler, the
// settings gear, Settings and dialog buttons, select menus, the mixer's
// headphone cue and Rec, and Undo. Play, Cue, ghost and primary buttons
// keep their own looks. The outline style takes a line weight and an edge
// strength; the others ignore them.
export default {
  id: 'buttons',
  n: 9,
  title: 'Buttons that look pressable',
  group: 'Controls',
  notes:
    'Outline (tune weight and strength), tonal fill, glass, ghost with a fill, or raised keys. Hover, selected and pressed follow each style.',
  settings: {
    style: {
      type: 'choice',
      label: 'Style',
      default: 'tonal',
      options: [
        ['outline', 'Outline'],
        ['tonal', 'Tonal fill'],
        ['glass', 'Glass'],
        ['ghost', 'Ghost + fill'],
        ['raised', 'Raised'],
      ],
    },
    weight: { type: 'range', label: 'Outline weight', min: 0.5, max: 2, step: 0.25, default: 1, unit: 'px' },
    edge: { type: 'range', label: 'Outline strength', min: 0.5, max: 2.5, step: 0.1, default: 1 },
  },
};

/** Show me: loupes on deck A's Sync and beat-jump buttons and on the library's Sampler and settings buttons, flipping between today's outlined buttons and the chosen style. */
export const show = {
  about: 'Ordinary buttons were empty outlines, so they read as frames rather than things to press. Now they have a soft solid fill.',
  before: 'Sync, Sampler, Rec and the other everyday buttons are hollow boxes with a thin grey outline: they look more like frames than buttons, and the screen fills up with lines.',
  after: "They're soft grey shapes with no outline, so they read as buttons at a glance and the screen looks calmer. (Style in this flag's settings tries other looks.)",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    // Both decks loaded, so Sync is live rather than dimmed.
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: (app) => [app.$("[data-region='deck0'] .btn.sync"), app.$("[data-region='deck0'] .btn.jumps"), app.$('section.library .btn.samp'), app.$('section.library .btn.gear'), ...app.$$('.mixer .hp'), app.$('.mixer button.rec')],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const sync = app.$("[data-region='deck0'] .btn.sync")?.getBoundingClientRect();
    const jumps = app.$("[data-region='deck0'] .btn.jumps")?.getBoundingClientRect();
    if (sync && jumps) {
      const zoom = 2.5;
      const src = { x: sync.x - 8, y: sync.y - 8 };
      const size = { w: Math.round((jumps.right + 8 - src.x) * zoom), h: Math.round((sync.height + 16) * zoom) };
      const l = d.loupe('deck', src, { zoom, size, at: { x: 40, y: 200 }, caption: '' });
      ctx.at = l.rect;
      d.text(l.rect.x + 10, l.rect.bottom - 16, "deck A's Sync and beat jump, 2.5× bigger", { fixed: true });
      d.text(l.rect.x + 10, l.rect.y + 16, before ? 'hollow: a thin outline' : 'filled: a soft grey shape', { tone: before ? 'bad' : 'ok', fixed: true });
    }
    const rec = app.$('.mixer button.rec')?.getBoundingClientRect();
    if (rec) {
      const zoom = 4;
      const src = { x: rec.x - 10, y: rec.y - 8 };
      const size = { w: Math.round((rec.width + 20) * zoom), h: Math.round((rec.height + 16) * zoom) };
      const l = d.loupe('rec', src, { zoom, size, at: { x: rec.right + 120, y: rec.y - size.h / 2 }, caption: '' });
      d.text(l.rect.x + 10, l.rect.bottom - 16, "the mixer's Rec, 4×", { fixed: true });
    }
  },
};
