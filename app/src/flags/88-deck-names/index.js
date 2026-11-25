// #88 (E13, C61; Owner's call 4 (a)): the words said "deck A" and "Deck B",
// but the screen never shows a letter.
//
// The decks carry no "A" or "B" (the design doc rules letters out: colour
// and position tell them apart), yet toasts, menus, tooltips and Settings
// named them by letter: "Load to deck A", "Deck B is playing", "Kill deck A
// high". With the flag on they say what you see: "the left deck", "the
// right deck" in sentences, and tersely in menus ("Load to left deck",
// "Replace track on left deck", like "Add to Friday warmup"). Each builder hooks their own strings on flag('deck-names'):
// Library.svelte (the track menu, screen-reader text), App.svelte (toasts
// and announcements), Deck, Performance, FxUnit and Stems (announcements,
// undo labels, region names, tooltips), Mixer and Knob (control names,
// "Kill left deck high EQ", "40% to the left deck"), Settings and Report.
export default {
  id: 'deck-names',
  n: 88,
  title: 'Say "left deck" and "right deck", not A and B',
  group: 'Polish',
  notes: 'Copy names decks by position ("the left deck") instead of letters the UI never shows. Hooks: Library, App, Deck, Performance, FxUnit, Stems, Mixer, Knob, Settings, Report.',
};

/** Show me: the track menu, reopened on each flip: "Load to deck A" (before), "Load to left deck" (after). */
export const show = {
  about: 'Menus and messages talked about "deck A" and "deck B", but no deck is labelled with a letter, so you had to guess which is which. Now they say "the left deck" and "the right deck".',
  before: 'Right-click a track: "Load to deck A", "Load to deck B". Nothing on screen is called A or B, so which is which?',
  after: '"Load to left deck", "Load to right deck": the words match what you see.',
  async setup(app, ctx) {
    await app.clearSearch();
    await show.each(app, ctx);
  },
  // The menu's words are set as it opens, so each flip opens it again.
  async each(app, ctx) {
    const open = app.$('.menu');
    if (open) await app.key('Escape', { target: open });
    const row = app.rows()[2];
    if (!row) return;
    const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 320, clientY: r.top + r.height / 2 }));
    await app.until(() => app.$('.menu'), 2000, 'the track menu');
  },
  async cleanup(app) {
    const open = app.$('.menu');
    if (open) await app.key('Escape', { target: open });
  },
  target: '.menu',
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const m = app.$('.menu')?.getBoundingClientRect();
    if (m) d.text(m.right + 16, m.top + 20, before ? 'which deck is "A"?' : 'named by where they are', { tone: before ? 'bad' : 'ok' });
  },
};
