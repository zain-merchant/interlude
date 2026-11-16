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
  note: "Three places that used \" · \": deck A's key line (key, Camelot code, BPM), the library count (\"analyzing, N to go\" while it lasts) and the crossfader's tooltip (shown now). The bars measure the space between parts. Off, the parts are joined by middle dots; on, by space and a step down in tone. Tune the gap under More.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    app.hover("[aria-label='Crossfader']");
    await app.until(() => app.$("[role='tooltip']"), 2000, 'the tooltip');
  },
  target: (app) => [app.$("[data-region='deck0'] .bpm .unit"), app.$('section.library .bar .count'), app.$("[role='tooltip']")],
  aid(d, app) {
    const gaps = (parts, label) => {
      for (let i = 1; i < parts.length; i++) {
        const a = parts[i - 1].getBoundingClientRect();
        const b = parts[i].getBoundingClientRect();
        if (b.left > a.right) d.measure(a.right, a.bottom + 4, b.left, a.bottom + 4, { label: `${Math.round(b.left - a.right)}` });
      }
      if (parts[0] && label) {
        const r = parts[0].getBoundingClientRect();
        d.text(r.x, r.y - 10, label);
      }
    };
    const tip = app.$("[role='tooltip']");
    if (tip) {
      const parts = app.$$('.part', tip);
      if (parts.length) gaps(parts, 'tooltip');
      else d.text(tip.getBoundingClientRect().x, tip.getBoundingClientRect().y - 10, 'tooltip (dots: flag off)');
    }
    const unit = app.$("[data-region='deck0'] .bpm .unit");
    const key = app.$("[data-region='deck0'] .bpm .unit .key");
    if (unit && key) {
      const kr = key.getBoundingClientRect();
      const ur = app.textRect(unit);
      if (ur) d.text(ur.right, ur.bottom + 10, 'key line', { anchor: 'end' });
      // The unit text after the key.
      const rest = [...unit.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (rest.length) {
        const range = document.createRange();
        range.selectNode(rest[rest.length - 1]);
        const rr = range.getBoundingClientRect();
        if (rr.left > kr.right) d.measure(kr.right, kr.bottom + 3, rr.left, kr.bottom + 3, { label: `${Math.round(rr.left - kr.right)}` });
      }
    }
    const pend = app.$('section.library .bar .count .pending');
    if (pend) {
      const pr = pend.getBoundingClientRect();
      const cr = app.textRect(app.$('section.library .bar .count'));
      d.text(pr.x, pr.bottom + 10, 'analysis note');
      if (cr) d.box(cr, { dash: '2 2' });
    }
  },
};
