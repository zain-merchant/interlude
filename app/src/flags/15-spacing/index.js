// #15: gaps and paddings, unified.
//
// The app mostly sits on a 4px grid (panels pad 16, sit 12 apart, controls
// pad 8), but a run of one-off values had crept in beside it: the mixer
// padded its sides 12 where every other panel pads 16, library cells 6,
// the search well 10, the toast and banner 14 and 6, menu items 6 by 10,
// tooltips 5 by 9, Settings rows 30 tall with a 10 gap, and the import
// and report dialogs 18, 14, 10, 3 and 22 here and there (and 24 vs 28 vs
// 32 for the dialogs themselves).
//
// This names the scale (4, 8, 12, 16, plus 24 for dialogs) and puts each
// of those on it. Text that lined up before still lines up: the library's
// first column gives back the 2px its cells gain, so titles stay under
// the search text.
export default {
  id: 'spacing',
  n: 15,
  title: 'One spacing scale: 4, 8, 12, 16',
  group: 'Layout',
  notes: 'Mixer sides pad 16 like every panel; library cells, search, menus, tooltips, toast, banner, Settings rows and the two dialogs move onto 4/8/12/16 (24 for dialogs).',
};

/** Show me: paddings drawn as measured bands with their sizes: the mixer, the search, the library cells, the toast. */
export const show = {
  note: "Paddings are drawn as yellow bands with their size: the mixer's sides (12 off, 16 on, like every panel), the search well (10 → 8), the library's cells (6 → 8) and the toast (loaded a track to bring it up; 14 / 6 → 12 / 4). Turn the flag off and on and read the numbers. Menus, tooltips, Settings rows and the two dialogs move onto 4/8/12/16 too.",
  async setup(app) {
    await app.loadTrack(0, 2);
  },
  target: (app) => [app.$('.mixer'), app.$('section.library .search'), app.rows()[0], app.$('.toastbox .toast')],
  aid(d, app) {
    d.padding(app.$('.mixer'), { sides: 'lr', label: 'mixer' });
    d.padding(app.$('section.library .search'), { sides: 'lr', label: 'search' });
    const row = app.rows()[0];
    const cells = row ? [...row.children].filter((c) => c.offsetWidth > 30).slice(0, 2) : [];
    cells.forEach((c, i) => d.padding(c, { sides: 'lr', label: i ? '' : 'library cells' }));
    const toast = app.$('.toastbox .toast');
    if (toast) d.padding(toast, { sides: 'tlr', label: 'toast' });
  },
};
