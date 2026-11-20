// #47: the FX level dial is labelled (batch D11, audit C52).
//
// The FX row's level knob had no label (FxUnit.svelte passes label=""),
// so its dial was the one unnamed control on the deck. With the flag a
// "Level" caption (11px --fg-3) sits beside the dial. CSS only: the
// caption is the knob's ::after.
export default {
  id: 'fx-label',
  n: 47,
  title: 'The FX level dial says "Level"',
  group: 'Polish',
  notes: 'The FX level dial is captioned Level beside the dial (11px --fg-3).',
};

/** Show me: deck A's FX tab; flipping shows the unnamed dial (before) and its caption (after), magnified. */
export const show = {
  about: 'On the FX tab the small dial had no name, so you had to hover it to learn it sets the effect level. Now it says "Level".',
  before: 'The FX row has a small unnamed dial: is it the effect amount, the time, a filter?',
  after: 'The dial is captioned "Level" beside it.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'FX');
  },
  target: "[data-region='deck0'] .fx .knob",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const k = app.$("[data-region='deck0'] .fx .knob")?.getBoundingClientRect();
    if (!k) return;
    const z = 3;
    const l = d.loupe('lvl', { x: k.left - 20, y: k.top - 6 }, { zoom: z, size: { w: 110 * z, h: (k.height + 12) * z }, near: k, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'a dial with no name' : 'the dial says what it sets', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
