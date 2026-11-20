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

/** Show me: the deck's key line, the library count and a tooltip, with the gaps between their parts measured. */
export const show = {
  note: "Deck A's key line, the library count and a tooltip: parts are spaced (measured) instead of joined by \" · \".",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    app.hover("[aria-label='Crossfader']");
    await app.until(() => app.$("[role='tooltip']"), 2000, 'the tooltip');
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit"), app.$('section.library .bar .count'), app.$("[role='tooltip']")],
  aid(d, app) {
    /** Measures the gaps between consecutive rects, just under them. */
    const gaps = (rects) => {
      for (let i = 1; i < rects.length; i++) {
        const a = rects[i - 1];
        const b = rects[i];
        if (b.left - a.right > 0.5) d.measure(a.right, Math.max(a.bottom, b.bottom) + 3, b.left, Math.max(a.bottom, b.bottom) + 3, { label: `${Math.round(b.left - a.right)}` });
      }
    };
    const node = (n) => {
      const range = document.createRange();
      range.selectNodeContents(n);
      return range.getBoundingClientRect();
    };
    // Each place's parts: element children and text runs, in order.
    const parts = (el) =>
      [...el.childNodes]
        .filter((n) => n.textContent.trim())
        .map((n) => (n.nodeType === 1 ? /** @type {Element} */ (n).getBoundingClientRect() : node(n)))
        .filter((r) => r.width);
    const tip = app.$("[role='tooltip']");
    if (tip) gaps(app.$$('.part', tip).map((p) => p.getBoundingClientRect()));
    const unit = app.$("[data-region='deck0'] .bpm .unit");
    if (unit) gaps(parts(unit));
    const count = app.$('section.library .bar .count');
    if (count) gaps(parts(count));
  },
};
