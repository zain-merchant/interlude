// #25 (critique panel, owner's call 5): the quietest text level sat right
// on 4.5:1.
//
// --fg-3 is 50% of the text colour, which the design doc calls "the
// quietest level that still passes 4.5:1". Measured over the deck glass it
// is 4.45 to 4.57:1 (4.49:1 at rgb(28 29 33)), so some 11px captions fall
// just under. Several judges called it too faint. 52% puts text straight on
// glass clearly over 4.5:1, and the step is too small to see. Text on raised
// or tonal fills needs --fg-2 either way (E11, #11 colour-scale).
// Increase Contrast keeps its own 68%. This changes a doc token, so the doc
// line becomes "--fg-3 is 52%" when it ships.
export default {
  id: 'quiet-text',
  n: 25,
  title: 'The quietest grey clears contrast everywhere',
  group: 'Type and colour',
  notes: '--fg-3 from 50% to 52% (not under Increase Contrast, which has its own 68%). Captions on deck glass go from about 4.5:1 to about 4.8:1.',
};

/** Show me: a loupe on the mixer's channel captions and deck A's BPM caption, flipping 50% and 52%. */
export const show = {
  // #39 against-text-levels sets --fg-3 itself (60%) and wins, so with it
  // on this changes nothing, and After would show #39's level: it's off
  // for the whole show (back on Done).
  overrides: ['against-text-levels'],
  about: 'The quietest grey (captions like "Trim", "BPM", "Set") sat right on the minimum contrast for small text, and on some panels just under it. Now it is a hair brighter and always clears it.',
  before: 'Small grey captions are at 50% brightness: on the deck glass that measures 4.45 to 4.57 to 1, right on (and sometimes under) the 4.5 to 1 small text needs to be easy to read.',
  after: 'They are at 52%: you will barely see the change, but every caption now clears 4.5 to 1 with room to spare, on every panel.',
  target: (app) => [app.$('.mixer .knob')],
  aid(d, app, ctx) {
    const m = app.$('.mixer')?.getBoundingClientRect();
    if (!m) return;
    const zoom = 3;
    const size = { w: 300, h: 240 };
    const l = d.loupe('captions', { x: m.x + 8, y: m.y + 40 }, { zoom, size, near: m });
    // 2% more white can't be seen, even magnified: what it changes is the
    // captions' contrast, measured live over the deck glass and drawn on a
    // scale with the 4.5 to 1 line.
    d.contrast(app.$('.mixer .knob button.label'), { x: l.rect.x, y: l.rect.bottom + 46, w: l.rect.width }, { what: 'captions', lo: 4.2, hi: 5.2 });
  },
};
