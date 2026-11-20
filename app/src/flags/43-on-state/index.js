// #43: one look for "on" in the deck's mode row (batch D6, audit C13).
//
// "4 beats" on the Loop tab is the loop's on/off control
// (Performance.svelte), but it looked like a label, and on the left deck
// "on" only tinted it ice white, almost the normal text colour. FX On/Off
// and the stem dots each used their own idiom. With the flag the three
// share one mark inside the Text Row (no pads, owner's call 6a): a 6px
// dot before the label, filled in the deck's colour when on and hollow
// --fg-3 when off; when on, the label goes --fg on a --sel fill with a
// --line-2 edge. The resting loop value gets --raise so it reads as the
// row's one control. FX keeps its word ("On"/"Off"), and its level ring
// dims to --fg-3 while the effect is off (FxUnit.svelte hook). Stems use
// the same 6px dot; one playing alone gets the on fill.
export default {
  id: 'on-state',
  n: 43,
  title: 'A running loop or effect looks on',
  group: 'Controls',
  notes: 'Loop, FX on and stems share one on mark: a 6px dot (deck colour on, hollow off) and, when on, a --sel fill with --fg text. The loop value rests on --raise; the FX level ring dims while FX is off.',
};

/** Show me: deck A's Loop tab with the loop running; flipping shows a tinted label (before) and the on mark (after), magnified. */
export const show = {
  about: "On the Loop tab, \"4 beats\" is the button that starts and stops the loop, but it looked like a label, and when the loop ran it only turned a shade whiter. Now it has a dot that lights and a fill when it's on, like FX and stems.",
  before: 'The loop is running, but "4 beats" just turned slightly whiter: from across the booth, running and stopped look the same.',
  after: "A filled dot in the deck's colour and a light fill mark the loop as running; stopped, the dot is hollow. FX On and the stems use the same mark.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    await app.play(0);
    const D = "[data-region='deck0']";
    if (app.$(`${D} .perf .big[aria-pressed='false']`)) await app.click(`${D} .perf .big`);
  },
  target: "[data-region='deck0'] .perf .grp",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const g = app.$("[data-region='deck0'] .perf .grp")?.getBoundingClientRect();
    if (!g) return;
    const z = 2;
    const w = Math.min(g.width, 360);
    const l = d.loupe('loop', { x: g.left + g.width / 2 - w / 2, y: g.top - 6 }, { zoom: z, size: { w: w * z, h: (g.height + 12) * z }, near: g, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'loop running: only the text turns a bit whiter' : 'loop running: lit dot and a fill', { tone: before ? 'bad' : 'ok', fixed: true });
  },
  async cleanup(app) {
    const D = "[data-region='deck0']";
    if (app.$(`${D} .perf .big[aria-pressed='true']`)) await app.click(`${D} .perf .big`);
  },
};
