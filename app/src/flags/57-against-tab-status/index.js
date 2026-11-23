// #57 (against the design doc; addendum part 4): idle tabs say what their
// mode is doing.
//
// The doc's mode panel: "Underline tabs sit over one quiet row", one mode
// showing at a time; today an idle tab only gets a 4px dot when its mode is
// active. The panel dropped b-K79: you can't see a running loop, an
// engaged effect or a muted stem without switching tabs. With this flag an
// idle tab names its state after its label in 11px --fg-3: "Cues 2 set",
// "Loop 4" (while looping), "FX Echo" (while on), "Stems 1 off".
// Hook: Deck.svelte (tabStatus).
export default {
  id: 'against-tab-status',
  n: 57,
  disabled: 'Against the doc\'s quiet underline tabs.',
  title: 'Idle tabs show their state',
  group: 'Controls',
  against: '"Mode panel: \'Text Row\' for Cues, Loop, FX and Stems. Underline tabs sit over one quiet row."',
  notes: 'An idle mode tab adds a word or two about its mode: hot cues set, the loop size while looping, the effect while on, stems muted.',
};

/** Show me: deck A on Cues with a loop running and FX on; flipping shows bare tabs (before) and tabs with their state (after). */
export const show = {
  about: 'Against the design doc\'s quiet tabs. A judge noted you can\'t see a running loop or an effect without opening its tab (only a tiny dot hints at it). Turn this on to judge tabs that name their state.',
  before: 'The Loop and FX tabs only show a tiny dot while something is on, as the design doc intends; what is on is hidden until you switch.',
  after: 'The idle tabs say "Loop 4" and "FX Echo", so you can see the loop size and the effect while staying on Cues. The cost: busier tabs.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.play(0);
    const D = "[data-region='deck0']";
    await app.tab(0, 'Loop');
    if (app.$(`${D} .perf .big[aria-pressed='false']`)) await app.click(`${D} .perf .big`);
    await app.tab(0, 'FX');
    if (app.$(`${D} .fx .tog[aria-pressed='false']`)) await app.click(`${D} .fx .tog`);
    await app.tab(0, 'Cues');
  },
  async cleanup(app) {
    const D = "[data-region='deck0']";
    await app.tab(0, 'Loop');
    if (app.$(`${D} .perf .big[aria-pressed='true']`)) await app.click(`${D} .perf .big`);
    await app.tab(0, 'FX');
    if (app.$(`${D} .fx .tog[aria-pressed='true']`)) await app.click(`${D} .fx .tog`);
    await app.tab(0, 'Cues');
  },
  target: "[data-region='deck0'] .modes",
  badge: (app) => app.$("[data-region='deck0'] .modes")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const m = app.$("[data-region='deck0'] .modes")?.getBoundingClientRect();
    if (!m) return;
    const before = ctx.phase === 'before';
    d.text(m.left + m.width / 2, m.top - 14, before ? 'the doc: a dot says something is on' : 'against the doc: the tab says what', { anchor: 'middle', tone: before ? undefined : 'ok' });
  },
};
