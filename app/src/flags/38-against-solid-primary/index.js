// #38 (against the design doc; addendum part 3): a solid primary in
// Settings and every dialog.
//
// The design doc's depth order ends in "One solid primary control, Play",
// and the critique panel kept that (dropped c-K94, "Settings Done as a
// primary"). Owner's call 3 (#27) allows a solid button only inside dialogs
// and alert banners. Judges still asked for Settings' Done to be solid, and
// for every dialog's main action to be, so you can see at once how to
// leave or finish. This flag does that, by selector (no component hooks):
// Settings' Done and the last button of each dialog's actions. Off by
// default; it's here for the owner to judge.
export default {
  id: 'against-solid-primary',
  n: 38,
  title: 'Solid Done in Settings and dialogs',
  group: 'Controls',
  against: '"Depth, from back to front: ... 5. One solid primary control, Play."',
  notes: "Settings' Done and each dialog's last action button get #27's solid look. Goes against the doc's single solid primary (Play).",
};

/** Show me: Settings open, its Done button in a loupe, flipping between an ordinary button and a solid one. */
export const show = {
  about: "Against the design doc, which keeps Play the only solid button. Several judges found Settings' Done and the dialogs' main buttons too easy to miss and wanted them solid. Turn this on to judge it: Done and each dialog's main action become solid light buttons.",
  before: "Settings' Done is an ordinary button like Learn or Reset all, as the design doc intends: Play stays the one solid control.",
  after: 'Done is a solid light button, so the way out of Settings is the first thing you see. The cost: Play is no longer the only solid control on screen.',
  async setup(app, ctx) {
    await app.openSettings();
    ctx.done = () => app.$('.settings .main .bar > .btn:last-child');
  },
  target: (app, ctx) => [ctx.done?.()],
  aid(d, app, ctx) {
    const r = ctx.done?.()?.getBoundingClientRect();
    if (!r) return;
    const before = ctx.phase === 'before';
    const l = d.loupe('done', { x: r.x - 16, y: r.y - 12 }, { zoom: 3, size: { w: (r.width + 32) * 3, h: (r.height + 24) * 3 }, near: r, caption: '' });
    d.text(l.at.x + l.rect.width / 2, l.at.y + l.rect.height + 14, before ? 'the doc: an ordinary button' : 'against the doc: solid', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
