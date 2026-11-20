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
  title: 'Text in five clear sizes',
  group: 'Type and colour',
  notes: 'Snaps the stray 12px and 22px text and the one 600 weight onto the --t-* scale and 300/400/500. Tooltips can go to 13 or 11.',
  settings: {
    tip: { type: 'choice', options: [['sm', 'Tooltips 13'], ['xs', 'Tooltips 11']], default: 'sm', label: 'Tooltip size' },
    titles: { type: 'choice', options: [['400', 'Regular'], ['500', 'Medium']], default: '400', label: 'Dialog title weight' },
  },
};

/** Show me: the Import dialog, flipping; before, the text in sizes between the app's five is boxed. */
export const show = {
  about: 'Text came in a few odd in-between sizes (12 next to 11 and 13, 22 next to 24), so dialogs like Import looked slightly uneven. Now every text is one of five sizes.',
  before: 'In the Import dialog, the boxed text uses sizes the rest of the app never does (12px beside 11 and 13, a 22px title beside 24): too close to tell apart on purpose, so it just looks a little off.',
  after: 'Every text is one of five clearly different sizes and three weights, so headings, sentences and small print each look like what they are, the same everywhere.',
  async setup(app) {
    await app.openImport();
  },
  target: ".card[aria-labelledby='import-title']",
  badge: (app) => app.$(".card[aria-labelledby='import-title']")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const card = app.$(".card[aria-labelledby='import-title']");
    if (!card) return;
    const SIZES = [11, 13, 16, 24, 32];
    const WEIGHTS = [300, 400, 500];
    const said = new Set();
    let off = 0;
    for (const el of [card, ...card.querySelectorAll('*')]) {
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!own) continue;
      const r = app.textRect(el);
      if (!r || !r.width || r.bottom > card.getBoundingClientRect().top + 340) continue;
      const cs = getComputedStyle(el);
      const size = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      const weight = Number(cs.fontWeight);
      const odd = !SIZES.includes(size);
      const heavy = !WEIGHTS.includes(weight);
      if (!odd && !heavy) continue;
      off++;
      d.box(new DOMRect(r.x - 2, r.y - 1, r.width + 4, r.height + 2), { c: d.C.bad, w: 1.25, rx: 3 });
      const what = odd ? `${size}px` : `weight ${weight}`;
      if (said.has(what)) continue;
      said.add(what);
      d.text(r.right + 8, r.top + r.height / 2, odd ? `${size}px: an in-between size` : `weight ${weight}: heavier than anything else`, { tone: 'bad' });
    }
    const cr = card.getBoundingClientRect();
    if (!off) d.text(cr.right - 8, cr.top - 19, 'every text here is one of the five sizes', { anchor: 'end', tone: 'ok', fixed: true });
    void ctx;
  },
};
