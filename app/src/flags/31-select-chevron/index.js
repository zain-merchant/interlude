// #31 (critique panel S1, C29): Settings' drop-down menus looked exactly
// like buttons.
//
// "Automatic" (Audio), "5 GB" (Stems) and the controller and action pickers
// (Controllers) are <select class="btn sm">, drawn with no indicator, so
// they read as push buttons beside "Learn" and "Clear cache". With the flag
// on each gets an 8px up-down chevron at --fg-3 on the right (layered over
// flag 9's fill, whichever style it uses), its value starts at the left,
// and the menus that had no visible name get an 11px caption: "Keep up to",
// "Controller", "Action" (hooks in Settings.svelte).
export default {
  id: 'select-chevron',
  n: 31,
  title: 'Menus in Settings look like menus',
  group: 'Controls',
  notes: 'Settings selects: an up-down chevron at the right (--fg-3, 1.3px), padding-right 28px, value left-aligned; captions before the unlabelled ones (Stems cache size, controller, action).',
};

/** Show me: Settings > Controllers, a loupe on the controller and action menus beside Learn, flipping. */
export const show = {
  about: 'In Settings, the drop-down menus ("Automatic", "5 GB", the controller and action pickers) looked exactly like the buttons next to them. Now they have a small up-down arrow and a name, so you can tell a menu from a button.',
  before: 'The action menu ("Play") and the Learn button beside it are the same grey box, so nothing says one opens a list and the other does something; "Play" on its own doesn\'t say what it is.',
  after: 'Menus carry a small up-down arrow at the right and a short name before them ("Controller", "Action"), so you can see at a glance which boxes open a list.',
  async setup(app, ctx) {
    await app.openSettings('Controllers');
    await app.until(() => app.$(".settings select[aria-label='Action']"), 3000, 'the action menu');
  },
  target: (app) => [app.$(".settings select[aria-label='Action']")?.parentElement],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const row = app.$(".settings select[aria-label='Action']")?.parentElement;
    const ctlRow = app.$(".settings select[aria-label='Controller']")?.parentElement;
    if (!row || !ctlRow) return;
    const a = ctlRow.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    // Over the decks, left of the card, clear of Settings.
    const top = app.$('.settings')?.getBoundingClientRect().top ?? 500;
    const src = { x: a.x - 12, y: a.y - 10 };
    const vw = 330;
    const vh = b.bottom - a.y + 20;
    const zoom = Math.min(2.5, 470 / vw, (top - 72) / vh);
    const size = { w: Math.round(vw * zoom), h: Math.round(vh * zoom) };
    const l = d.loupe('menus', src, { zoom, size, at: { x: 16, y: Math.max(16, top - size.h - 56) }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x + 10, l.rect.bottom + 16, `Settings > Controllers, ${zoom.toFixed(1)}× bigger`, { fixed: true });
    d.text(l.rect.x + 10, l.rect.bottom + 40, before ? 'menus and buttons look the same' : 'a menu shows its arrow and its name', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
