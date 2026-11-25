// #35 (critique panel S9; C66, part of C67): Settings checkboxes.
//
// An enabled, unchecked box was outlined at --fg-4 (30%, about 2.5:1), the
// level the design doc keeps for disabled and empty things, so "Slip on
// deck A" looked unavailable. It's now --fg-3 (about 4.6:1). And Stems used
// a second checkbox row (.check: a tighter gap, a grey label, the box 1-3px
// off centre) where every other page uses .opt; it uses .opt now (hook in
// Settings.svelte). Disabled boxes keep the off level.
//
// Backlog c-K52 (a ticked box is the brightest mark on the page): kept
// solid; the softer variant was dropped in the per-fix review.
export default {
  id: 'settings-checks',
  n: 35,
  title: 'Checkboxes that look ready to tick',
  group: 'Controls',
  notes: 'Unchecked boxes outlined at --fg-3 (was --fg-4, the disabled level); Stems uses the same .opt row as other pages.',
};

/** Show me: Settings > Decks with the Slip boxes unticked, flipping; a loupe on them. */
export const show = {
  about: 'In Settings, an unticked checkbox was drawn as faint as a disabled one, so "Slip on deck A" looked unavailable; and the Stems page used a different, misaligned checkbox. Now every box is clearly ready to tick, and they all match.',
  before: 'The empty Slip boxes are a faint outline, the same faintness the app uses for things you can\'t use, so they look switched off rather than ready.',
  after: 'Empty boxes have a clear outline, so they look ready to tick while still plainly unticked; Stems uses the same row as every other page.',
  async setup(app) {
    await app.openSettings('Decks');
    const slip = await app.until(() => app.$$('.settings .display').find((s) => /Slip/.test(s.querySelector('h3')?.textContent ?? '')), 2000, 'the Slip section');
    slip.scrollIntoView({ block: 'center' });
  },
  target: (app) => [...(app.$$('.settings .display').find((s) => /Slip/.test(s.querySelector('h3')?.textContent ?? ''))?.querySelectorAll('.opt') ?? [])],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const opts = [...(app.$$('.settings .display').find((s) => /Slip/.test(s.querySelector('h3')?.textContent ?? ''))?.querySelectorAll('.opt') ?? [])];
    if (!opts.length) return;
    const a = opts[0].getBoundingClientRect();
    const b = opts.at(-1).getBoundingClientRect();
    // Over the decks, left of the card, clear of Settings.
    const top = app.$('.settings')?.getBoundingClientRect().top ?? 500;
    const src = { x: a.x - 6, y: a.y - 4 };
    const vw = 130;
    const vh = b.bottom - a.y + 8;
    const zoom = Math.min(3.5, 470 / vw, (top - 72) / vh);
    const size = { w: Math.round(vw * zoom), h: Math.round(vh * zoom) };
    const l = d.loupe('checks', src, { zoom, size, at: { x: 16, y: Math.max(16, top - size.h - 56) }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x + 10, l.rect.bottom + 16, `the Slip checkboxes, ${zoom.toFixed(1)}× bigger`, { fixed: true });
    d.text(l.rect.x + 10, l.rect.bottom + 40, before ? 'faint, like a disabled control' : 'clear: ready to tick', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
