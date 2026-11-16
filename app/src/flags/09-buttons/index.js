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
  title: 'Button styles',
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

/** Show me: every button the style applies to, labelled, with a loupe on two of them. */
export const show = {
  note: 'Outlined: the normal buttons this restyles (Sync, beat jump, Sampler, the gear, the headphone cues, Rec; also Settings and dialog buttons, select menus and the toast\'s Undo). Loupes (4×) on Sync and a headphone button. Click through Style under More and watch them; Outline also takes weight and strength.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: (app) => [app.$("[data-region='deck0'] .btn.sync"), app.$("[data-region='deck0'] .btn.jumps"), app.$('section.library .btn.samp'), app.$('section.library .btn.gear'), ...app.$$('.mixer .hp'), app.$('.mixer button.rec')],
  aid(d, app) {
    const sync = app.$("[data-region='deck0'] .btn.sync")?.getBoundingClientRect();
    const hp = app.$('.mixer .hp')?.getBoundingClientRect();
    if (sync) d.loupe('sync', { x: sync.x - 6, y: sync.y - 6 }, { zoom: 4, size: { w: 300, h: 120 }, at: { x: 16, y: 10 }, caption: 'Sync, 4×' });
    if (hp) d.loupe('hp', { x: hp.x - 8, y: hp.y - 6 }, { zoom: 4, size: { w: 200, h: 120 }, at: { x: 330, y: 10 }, caption: 'headphone cue, 4×' });
    for (const el of [app.$("[data-region='deck0'] .btn.sync"), app.$("[data-region='deck0'] .btn.jumps"), app.$('section.library .btn.samp'), app.$('.mixer button.rec')]) {
      const r = el?.getBoundingClientRect();
      if (r) d.box(r, { c: d.C.aid, dash: '2 2' });
    }
  },
};
