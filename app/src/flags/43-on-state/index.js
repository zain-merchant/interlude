// #43: a running loop or engaged effect reads as on (batch D6, audit C13).
//
// "4 beats" on the Loop tab is the loop's on/off control
// (Performance.svelte), but running and stopped looked almost the same:
// on the left deck "on" only tinted it ice white, nearly the normal text
// colour. FX On/Off and the stem dots each used their own idiom.
//
// With the flag, "on" shows where a DJ already looks, with no box or fill:
// - The loop size: a step quieter at rest (--fg-2, "beats" --fg-3);
//   running, number and "beats" both go to the deck's own white.
// - The waveforms: a running loop's stretch is tinted in the deck's colour
//   on the lanes and the overview, with its in and out lines in that
//   colour too (waveform-2d.js; a stopped loop keeps today's faint white
//   band). The Loop tab keeps its small dot while a loop runs.
// - FX keeps its word ("On"/"Off") in the deck colour when on, and its
//   level ring dims to --fg-3 while off (FxUnit.svelte hook).
// - A muted stem's hollow dot is --fg-3 (was --fg-4); one playing alone
//   keeps the deck colour, without the halo.
// The Look setting picks the mark beside the brighter text:
// - text (recommended, the owner's "quiet end" reference): a 6px dot
//   before the size, hollow --fg-3 at rest, filled in the deck colour while
//   it runs (the doc's stem idiom), on the text's baseline so it centres on
//   the x-height of "beats". FX uses the same dot.
// - ring: no dot; a 1px inset ring in the deck colour at 40% while on.
// - underline: no dot; a 2px deck-colour line under the value while on,
//   like the selected tab's.
// Nothing changes size between off and on. With no-shift-strip on, the
// size button holds one width and centres its contents (05's style.css).
export default {
  id: 'on-state',
  n: 43,
  title: 'A running loop or effect looks on',
  group: 'Controls',
  notes: 'No box: a running loop\'s size lights up in the deck\'s white (a step quieter at rest), its stretch is tinted in the deck colour on the waveforms, and the Look setting adds a dot, a thin ring or an underline. FX and stems follow; the FX level ring dims while off.',
  settings: {
    look: {
      type: 'choice',
      label: 'Look',
      default: 'text',
      options: [
        ['text', 'Dot and brighter text', 'A small dot before the loop size: hollow when stopped, filled in the deck colour while it runs, and the size turns bright. Quiet, and the same "filled is on" dot the stems use.'],
        ['ring', 'Thin ring', 'No dot; while the loop runs, a faint 1px outline in the deck colour around the size, plus the brighter text.'],
        ['underline', 'Underline', 'No dot; while the loop runs, a short line in the deck colour under the size, like the underline of the selected tab, plus the brighter text.'],
      ],
    },
  },
};

/** Show me: deck A's Loop tab; flipping shows a running loop as it was (before) and as on (after). */
export const show = {
  about: 'This shows the loop is running. Before, a running loop looked almost the same as a stopped one. Now the loop size lights up in the deck\'s colour and the looping part of the waveform is tinted, with no extra box.',
  before: 'The loop is running, but "4 beats" only turned a shade whiter, and the looped part of the waveform is a faint grey band: from a step back, running and stopped look the same.',
  after: 'This shows the loop is running: the size is bright in the deck\'s own colour with a filled dot (hollow when stopped), and the looped stretch on the waveforms is tinted in the deck colour.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    await app.play(0);
    const D = "[data-region='deck0']";
    if (app.$(`${D} .perf .big[aria-pressed='false']`)) await app.click(`${D} .perf .big`);
  },
  target: (app) => [app.$("[data-region='deck0'] .perf .grp"), app.$("[data-region='deck0'] .overview")],
  badge: (app) => app.$("[data-region='deck0'] .perf .grp")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const g = app.$("[data-region='deck0'] .perf .grp")?.getBoundingClientRect();
    if (!g) return;
    const before = ctx.phase === 'before';
    d.text(g.left + g.width / 2, g.bottom + 14, before ? 'loop running, but it looks like a label' : 'this shows the loop is running', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
  async cleanup(app) {
    const D = "[data-region='deck0']";
    if (app.$(`${D} .perf .big[aria-pressed='true']`)) await app.click(`${D} .perf .big`);
  },
};
