// #10: middle dots as separators.
//
// The UI joined related bits with " · ": the deck's "Bm · 10A · BPM" line,
// every tooltip ("Crossfader · 50% · double-click to reset"), the library's
// "48 tracks · analyzing, 12 to go" and the import dialog's "where · when".
// The dots add noise without adding meaning. This sets the parts apart with
// space and a step in tone instead: the first, most important part stays
// bright and the rest step down a level. Hooks: Tooltip.svelte, Deck.svelte,
// Library.svelte, Import.svelte. The EQ knob's "Low · kill" label is left
// alone (another flag owns it).
export default {
  id: 'no-dots',
  n: 10,
  title: 'Space instead of middle dots',
  group: 'Type and colour',
  notes: 'Tooltips, the deck key/BPM line, the library count and import sources: parts are spaced and stepped in tone instead of joined with " · ".',
  settings: {
    gap: { type: 'range', min: 4, max: 16, step: 1, default: 8, unit: 'px', label: 'Gap between parts' },
    tone: { type: 'choice', options: [['step', 'Step down'], ['same', 'Same tone']], default: 'step', label: 'Later parts' },
  },
};

/** Show me: loupes on deck A's key line, the library count and a tooltip, flipping between " · " joins and spaced parts. */
export const show = {
  about: 'Bits of information were strung together with " · " dots everywhere, which made short lines look busy. Now they are set apart by a little space, with the less important part a shade dimmer.',
  before: 'The key under the BPM ("C · 8B · BPM"), the library count and every tooltip join their parts with middle dots: lots of tiny marks that say nothing.',
  after: 'A small gap separates the parts and the extra detail is a step dimmer, so the main word stands out and the line reads more quietly.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await show.each(app);
  },
  // Point at the crossfader, so its tooltip is up (again after a flip).
  async each(app) {
    app.hover("[aria-label='Crossfader']");
    await app.until(() => app.$("[role='tooltip']"), 2000, 'the tooltip');
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit"), app.$('section.library .bar .count'), app.$("[role='tooltip']")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    /** A loupe on `el`'s text at `zoom`, placed at `at`, with a caption under it. */
    const look = (key, el, zoom, at, caption) => {
      const r = el && (app.textRect(el) ?? el.getBoundingClientRect());
      if (!r) return null;
      const src = { x: r.x - 8, y: r.y - 3 };
      const size = { w: Math.round((r.width + 40) * zoom), h: Math.round((r.height + 6) * zoom) };
      const l = d.loupe(key, src, { zoom, size, at, caption: '' });
      d.text(l.rect.x, l.rect.bottom + 14, caption, { tone: before ? 'bad' : 'ok', fixed: true });
      return l;
    };
    const unit = app.$("[data-region='deck0'] .bpm .unit");
    const ur = unit?.getBoundingClientRect();
    const a = ur && look('key', unit, 4, { x: ur.right - 330, y: ur.bottom + 40 }, before ? 'key, code and unit joined by dots' : 'key and code, then the unit, set apart by space');
    if (a) ctx.at = a.rect;
    const count = app.$('section.library .bar .count');
    const cr = count?.getBoundingClientRect();
    // The library's count, while it has an analysis note after it.
    if (cr && app.$('section.library .bar .count .pending')) look('count', count, 3, { x: cr.x + 120, y: cr.bottom + 40 }, before ? 'count and analysis joined by a dot' : 'count, then a gap, then the analysis');
    const tip = app.$("[role='tooltip']");
    const tr = tip?.getBoundingClientRect();
    if (tr) look('tip', tip, 2.5, { x: tr.x - 120, y: tr.y - 140 }, before ? 'tooltip parts joined by dots' : 'tooltip parts spaced, details dimmer');
  },
};
