// #36 (critique panel S11; C43): Settings in the library's own panel.
//
// The library's sidebar sits inside its glass panel. Settings, which opens
// in the library's place, drew its page list bare on the window background
// (about 16px further left, its pills flush with the column edge, its
// focus ring poking past the window margin) with a second glass panel
// starting 224px in. So opening Settings moved the left column. With the
// flag on, Settings is one glass panel like the library: the same 200px
// list (padded like the library's, --pad with #2 on) and a --line divider,
// so only the right-hand pane changes. The list's width reads
// --library-sidebar (200px by default), so a resizable sidebar (#21
// panel-sizes) can set both at once. CSS only.
export default {
  id: 'settings-panel',
  n: 36,
  title: "Settings open in the library's panel",
  group: 'Layout',
  notes: 'Settings becomes one glass panel: 200px page list (library padding) with a --line divider, the page on the right without a second panel. Width from --library-sidebar.',
};

/** Show me: opens Settings, flipping; the left edge of the library's sidebar dashed, to compare with the page list. */
export const show = {
  about: "Opening Settings swapped the library's panel for a bare list on the background and a second panel beside it, so the whole left side jumped. Now Settings opens inside the same panel, and only the right-hand side changes.",
  before: 'The Settings page list floats on the window background, further left than the library list it replaces, with a separate panel beside it: the screen rearranges itself when you open Settings.',
  after: "Settings sits in the library's own panel, with its list exactly where the library's sidebar was and a thin line beside it; only the page on the right is new.",
  async setup(app, ctx) {
    // Where the library's sidebar sits, before Settings covers it.
    if (app.$('.settings')) await app.key('Escape', { target: app.$('.settings') });
    await app.wait(100);
    ctx.side = app.snap([app.$("section.library nav, [data-region='sidebar']")])[0];
    await app.openSettings('Audio');
  },
  target: '.settings nav',
  badge: (app) => app.$('.settings nav')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const nav = app.$('.settings nav .item')?.getBoundingClientRect();
    if (!nav || !ctx.side) return;
    d.box(ctx.side, { c: d.C.ghost, dash: '5 4', w: 1.5 });
    const main = app.$('.settings .main')?.getBoundingClientRect();
    if (main && before) d.text(main.x + 12, main.y - 14, 'a second panel starts here', { tone: 'bad' });
    d.text(ctx.side.x + 8, ctx.side.bottom + 18, before ? "the page list doesn't sit where the library's sidebar was (dashed)" : "the page list sits in the library's sidebar (dashed)", { tone: before ? 'bad' : 'ok' });
  },
};
