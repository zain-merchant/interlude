// #27 (C50; critique E3): one look for each dialog's main action.
//
// Main buttons were styled four ways: Import's "Continue" was a solid cream
// chip (a <span class="go"> inside the row, 6px radius), Report's "Save
// report" a tonal grey that read as disabled next to Cancel, the banner's
// action a third style and the toast's Undo a fourth. Import also showed
// two identical "Continue" chips, one per library found.
//
// Import's local .btn.primary becomes a shared class (style.css): solid
// --fg fill, --ink text, weight 500, the control height and radius. Each
// dialog's one main action uses it: Report's Save (and Done once saved),
// Import's Import and Done. On Import's first step every library found
// gets the same tonal Import chip (round 2: one solid chip beside a faint
// one made the choice for you); the newest says so in its age line
// ("exported 3 hours ago, newest"). Cancel stays a ghost button. The
// device-lost banner's button keeps the class but #23 draws it tonal. Hooks: Report.svelte,
// Import.svelte.
//
// The design doc keeps one solid primary, Play. Owner's call 3: allow a
// solid primary only inside dialogs and alert banners, never on the
// performance surface (decided; the outlined variant was dropped in the
// per-fix review). Save stays enabled with an empty box: the logs alone
// are useful.
export default {
  id: 'primary-button',
  n: 27,
  title: "Each dialog's main button looks like one",
  group: 'Controls',
  notes:
    'Shared .btn.primary (solid --fg, --ink text, 500). Report: Save and Done; Import: every library found gets the same tonal Import chip, the newest named in its age line.',
};

/** Show me: the Report dialog, its Save button in a loupe beside Cancel; flipping between the tonal grey that read as disabled and the main button. */
export const show = {
  about: 'In the Report dialog the main button, Save, was a grey that looked switched off next to Cancel, and Import used a different solid chip twice. Now each dialog has one clearly marked main button, styled the same everywhere.',
  before: "Report's Save button is a grey box like any other button, and next to Cancel it can read as switched off, so it isn't clear it's the thing to press.",
  after: 'Save is the one solid button in the dialog, so it reads as the thing to press; Cancel stays quiet beside it.',
  async setup(app, ctx) {
    await app.openReport();
    ctx.acts = () => app.$(".card[aria-labelledby='report-title'] .actions");
  },
  async each(app) {
    if (!app.$(".card[aria-labelledby='report-title']")) await app.openReport();
  },
  target: (app, ctx) => [ctx.acts?.()],
  aid(d, app, ctx) {
    const r = ctx.acts?.()?.getBoundingClientRect();
    if (!r) return;
    const before = ctx.phase === 'before';
    const l = d.loupe('acts', { x: r.x - 8, y: r.y - 8 }, { zoom: 2.5, size: { w: (r.width + 16) * 2.5, h: (r.height + 16) * 2.5 }, near: r, caption: '' });
    d.text(l.at.x + l.rect.width / 2, l.at.y + l.rect.height + 14, before ? 'Save looks switched off' : 'Save is the one main button', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
