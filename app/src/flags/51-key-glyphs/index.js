// #51: the flat and sharp in key names drawn to match the app's type
// (batch D17).
//
// Geist (the app's font) has no ♭ (U+266D) or ♯ (U+266F), and none of the
// @fontsource-variable/geist subsets cover them, so "B♭m" and "F♯" in the
// decks, the library and tooltips took them from a fallback font: a thin,
// tall flat sitting off the baseline, on a full-em-wide advance that left
// a gap. With the flag a tiny font of just those two glyphs (drawn from
// paths at Geist's regular stem weight, about 0.08em, cap-height tall, on
// narrow advances) goes in front of --font, limited to those two
// characters by unicode-range. Everything that shows a key picks it up
// without markup changes, and keyName() still returns plain text for
// tooltips and screen readers.
//
// Deviation from the build list: the list asked for a 0.8em inline SVG
// glyph from a helper used by keyName(). A font does the same drawing but
// needs no markup in the library (another builder's file) and keeps
// keyName() a string. make-font.mjs.txt is the generator (run it with
// opentype.js 1.3.4; it writes the font whose base64 style.css embeds).
export default {
  id: 'key-glyphs',
  n: 51,
  title: 'Flat and sharp signs that match the type',
  group: 'Type and colour',
  notes: 'A two-glyph font (♭ ♯ at Geist\'s weight and height) in front of --font, limited by unicode-range, so keys everywhere read "B♭m" in one face.',
};

/** Show me: a flat key in the library, magnified; flipping shows the fallback flat (before) and the drawn one (after). */
export const show = {
  about: 'Keys like "B♭m" showed a flat sign from a different, fallback font: thin, too tall and sitting off the line, with a gap after it. Now the flat and sharp are drawn to match the rest of the text.',
  before: 'Look at the ♭ in "B♭m": it is a spindly, tall glyph from another font, with an odd gap before the "m".',
  after: 'The flat now has the same weight and height as the letters around it, so "B♭m" reads as one word.',
  async setup(app, ctx) {
    await app.search('Glass Rooms');
    await app.wait(200);
    ctx.cell = () => app.$$("[data-region='tracks'] .row:not(.head)").find((r) => /♭|♯/.test(r.textContent));
  },
  async cleanup(app) {
    await app.clearSearch();
  },
  target: (app, ctx) => [ctx.cell?.()].filter(Boolean),
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const row = ctx.cell?.();
    if (!row) return;
    const k = [...row.querySelectorAll('*')].find((e) => e.children.length === 0 && /♭|♯/.test(e.textContent));
    const r = (k && app.textRect(k)) ?? row.getBoundingClientRect();
    const z = 4;
    const l = d.loupe('key', { x: r.left - 6, y: r.top - 4 }, { zoom: z, size: { w: (r.width + 12) * z, h: (r.height + 8) * z }, near: r, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'the flat comes from another font' : 'the flat matches the letters', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
