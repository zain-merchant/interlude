// #26 (critique panel polish backlog: toast, banner, dialogs).
// - d-K57: the toast's Undo was weight 500 against a 400 message; it goes
//   to 400 (its outline is what marks it as a button).
// - e-K52: the Undo chip sat 4px from the toast's edge on three sides and
//   12px after the message; now 8px all round (12 before the text), the
//   rule #15 uses for the banner. With #2 the toast's radius follows (+8).
// - e-K53: the banner's button label sat about 1px below its sentence;
//   they share a baseline now.
// - e-K59: menus, the toast and the banner float on --popover (#1b1c20)
//   but the two dialogs hard-coded #121214. A --dialog token (app.css when
//   shipped) for both; "Same as menus" sets it to --popover.
// Already elsewhere: the toast's radius against its real inset (c-K56,
// e-K51) is in #2; hover holds the toast (e-K64, C20) in #13.
export default {
  id: 'overlay-polish',
  n: 26,
  title: 'Toast, banner and dialog details',
  group: 'Polish',
  notes: 'Undo at weight 400 with 8px round it; the banner\'s button on its sentence\'s baseline; one --dialog surface token for both dialogs (or the menus\' --popover).',
  settings: {
    surface: {
      type: 'choice',
      label: 'Dialog surface',
      default: 'popover',
      options: [
        ['popover', 'Same as menus', 'Dialogs on the same grey as menus, the toast and the banner, so everything that floats over the app is one surface.'],
        ['dialog', 'Darker, as now', 'Dialogs keep their darker #121214 (now a named token): they sit a step further back than the small popups.'],
      ],
    },
  },
};

/** Show me: a load brings the toast up; a loupe on it flips the Undo's weight and insets. */
export const show = {
  about: 'Small things on the popups: the toast\'s Undo was bolder than its message and squeezed against the toast\'s edge, the banner\'s button sat a pixel low, and the dialogs used a different grey from every other popup.',
  before: 'Undo is heavier than the message beside it and nearly touches the toast\'s edge on three sides.',
  after: 'Undo matches the message\'s weight and has an even 8px round it, so the toast reads as one calm line; dialogs share the popups\' grey.',
  period: 2200,
  async setup(app, ctx) {
    await show.each(app, ctx);
  },
  async each(app, ctx) {
    ctx.n = ((ctx.n ?? 1) % 6) + 2;
    await app.loadTrack(0, ctx.n);
    await app.until(() => app.$('.toastbox .toast'), 2000, 'the toast');
    await app.wait(250);
  },
  target: '.toastbox .toast',
  aid(d, app, ctx) {
    const t = app.$('.toastbox .toast')?.getBoundingClientRect();
    if (!t) return;
    const zoom = 2;
    const size = { w: Math.min(innerWidth - 32, (t.width + 16) * zoom), h: (t.height + 16) * zoom };
    const l = d.loupe('toast', { x: t.x - 8, y: t.y - 8 }, { zoom, size, at: { x: Math.max(16, Math.min(innerWidth - size.w - 16, t.right - size.w)), y: t.y - size.h - 40 } });
    d.text(l.rect.x + 10, l.rect.y - 14, ctx.phase === 'before' ? 'Undo bolder than the message, 4px from the edge' : 'Undo at the same weight, 8px all round', { tone: ctx.phase === 'before' ? 'bad' : 'ok', fixed: true });
  },
};
