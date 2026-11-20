// #11: font sizes and weights on one scale.
//
// The app's tokens give five sizes (11, 13, 16, 24, 32) and the CSS mostly
// keeps to them, but a few places drifted: 12px in tooltips, Settings'
// shortcut keys and notes, and most of the import dialog; 22px for the
// import dialog's titles and totals; 600 on the waveform's hot cue chips;
// 500 on the 24px dialog titles, the only 24px text that isn't 400 or 300.
// Big numerals were tracked -0.02em or -0.03em at the same size.
//
// With the flag on, every text is one of five sizes and three weights:
// 300 for large numerals, 400 for text, 500 for small headings and
// emphasis. 12px snaps by role: sentences and values to 13, metadata
// (paths, dates, captions) to 11. Tracking goes by size: -0.03em at 32,
// -0.02em at 24.
export default {
  id: 'type-scale',
  n: 11,
  title: 'Five sizes, three weights',
  group: 'Type and colour',
  notes: 'Snaps the stray 12px and 22px text and the one 600 weight onto the --t-* scale and 300/400/500. Tooltips can go to 13 or 11.',
  settings: {
    tip: { type: 'choice', options: [['sm', 'Tooltips 13'], ['xs', 'Tooltips 11']], default: 'sm', label: 'Tooltip size' },
    titles: { type: 'choice', options: [['400', 'Regular'], ['500', 'Medium']], default: '400', label: 'Dialog title weight' },
  },
};

/** Show me: the Import dialog, with any text off the type scale tagged with its size and weight. */
export const show = {
  note: 'The Import dialog: any text off the scale (11, 13, 16, 24 or 32px; weight 300 to 500) is tagged in red; flip the flag to see some.',
  async setup(app) {
    await app.openImport();
  },
  target: ".card[aria-labelledby='import-title']",
  aid(d, app) {
    const card = app.$(".card[aria-labelledby='import-title']");
    if (!card) return;
    const SIZES = [11, 13, 16, 24, 32];
    const WEIGHTS = [300, 400, 500];
    let off = 0;
    for (const el of [card, ...card.querySelectorAll('*')]) {
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!own) continue;
      const r = app.textRect(el);
      if (!r || !r.width) continue;
      const cs = getComputedStyle(el);
      const size = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      const weight = Number(cs.fontWeight);
      if (SIZES.includes(size) && WEIGHTS.includes(weight)) continue;
      off++;
      d.box(r, { c: d.C.bad, w: 1, rx: 2 });
      d.text(r.right + 6, r.top + r.height / 2, `${size}/${weight}`, { tone: 'bad' });
    }
    const cr = card.getBoundingClientRect();
    if (!off) d.text(cr.left, cr.top - 14, 'every text on the scale', { tone: 'ok', fixed: true });
  },
};
