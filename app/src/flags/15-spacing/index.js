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
  title: 'Even margins everywhere',
  group: 'Layout',
  notes: 'Mixer sides pad 16 like every panel; library cells, search, menus, tooltips, toast, banner, Settings rows and the two dialogs move onto 4/8/12/16 (24 for dialogs). Settings\' Mixxx note gets its 12px gap back.',
};

/** Show me: the inner margins of the mixer against the decks beside it, shaded with their sizes, flipping. */
export const show = {
  // Before turns these off too (they hide this change while on): #2 concentric also sets every panel's padding (the mixer's 12 to 16), so with it on the mixer doesn't move here.
  masks: ['concentric'],
  about: 'Inside panels and popups the margins were a mix of near-identical sizes (12 here, 16 there, 10, 14, 6), so edges looked slightly ragged. Now every gap is 4, 8, 12 or 16.',
  before: "The mixer keeps its knobs 12px from its edges while the decks either side keep 16px, and the search box, library rows, toast and menus each have their own odd margin: close, but not the same.",
  after: 'Every panel keeps its contents 16px from its edges, and the smaller gaps are 4, 8 or 12, so neighbouring panels match and the whole window feels even.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: (app) => [app.$('.mixer')],
  badge: (app) => app.$('.mixer')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const mixer = app.$('.mixer');
    const decks = [app.deck(0), app.deck(1)];
    if (!mixer || decks.some((x) => !x)) return;
    d.padding(mixer, { sides: 'lr' });
    d.padding(decks[0], { sides: 'r' });
    d.padding(decks[1], { sides: 'l' });
    const pl = parseFloat(getComputedStyle(mixer).paddingLeft);
    const dl = parseFloat(getComputedStyle(decks[0]).paddingRight);
    const same = Math.abs(pl - dl) < 0.5;
    const r = mixer.getBoundingClientRect();
    d.text(r.x + r.width / 2, r.bottom + 40, same ? `mixer and decks: the same ${Math.round(pl)}px margin` : `mixer margin ${Math.round(pl)}px, decks ${Math.round(dl)}px`, { anchor: 'middle', tone: same ? 'ok' : 'bad', fixed: true });
    void ctx;
  },
};
