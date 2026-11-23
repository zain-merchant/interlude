// #56 (against the design doc; addendum part 3): hot cues as pads, and
// eight of them on wide decks.
//
// The doc's mode panel is a "Text Row": "Cues are a coloured dot, a number
// and a time. Empty slots read 'Set'." Owner's call 6 recommends keeping it
// (with flag 43's on mark). The panel dropped six clusters asking for pads
// (b-K74 with 16 judges, a-K83, d-K71, b-K76, d-K72, a-K87) and one for
// eight cues (b-K82): with no pad body there is nothing to aim at, and an
// empty slot looks like a caption. With this flag each hot cue is a 40px
// pad on the deck's columns (empty: an outlined tile; set: tinted in its
// slot's colour). Count setting: four, or all eight in two rows of four
// (Performance.svelte renders eight under that option; the mode row grows
// by a row, taken from the overview).
// Since the merge of upstream main the deck shows all eight hot cues in two
// rows itself, so this flag's "eight" count adds nothing over upstream; its
// pads (a body to hit) are still the thing to judge.
export default {
  id: 'against-cue-pads',
  n: 56,
  title: 'Hot cues as pads',
  group: 'Controls',
  against: '"Mode panel: \'Text Row\' for Cues, Loop, FX and Stems. Underline tabs sit over one quiet row: Cues are a coloured dot, a number and a time."',
  notes: 'Hot cues become 40px pads (outlined when empty, tinted in the slot colour when set). Count: four, or eight in two rows.',
  settings: {
    count: {
      type: 'choice',
      label: 'How many',
      default: 'four',
      options: [
        ['four', 'Four', 'The same four hot cues as today, as pads: something solid to aim at, without changing what the tab holds.'],
        ['eight', 'Eight in two rows', 'All eight hot cues the engine keeps, in two rows of four: more cues at hand, at the cost of a taller mode row and a shorter overview.'],
      ],
    },
  },
};

/** Show me: deck A's Cues tab with two cues set; flipping shows the Text Row (before) and pads (after). */
export const show = {
  about: 'Against the design doc\'s quiet "Text Row" of hot cues. Many judges wanted pads: something with a body to hit, as on a controller, and some wanted all eight cues. Turn this on to judge it.',
  before: 'Hot cues are a dot, a number and a time in one quiet row, as the design doc intends. An empty slot is just "1 Set".',
  after: 'Each hot cue is a pad: an outlined tile when empty, tinted in its colour when set. With "Eight in two rows", all eight are there. The cost: a busier deck.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const D = "[data-region='deck0']";
    for (const [n, at] of [[1, 0.1], [2, 0.3]]) {
      if (app.$(`${D} button[aria-label='Set hot cue ${n}']`)) {
        await app.seek(0, at);
        await app.click(`${D} button[aria-label='Set hot cue ${n}']`);
      }
    }
  },
  target: "[data-region='deck0'] .perf",
  badge: (app) => app.$("[data-region='deck0'] .perf")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const p = app.$("[data-region='deck0'] .perf")?.getBoundingClientRect();
    if (!p) return;
    const before = ctx.phase === 'before';
    d.text(p.left, p.bottom + 16, before ? 'the doc: a quiet text row' : 'against the doc: pads', { tone: before ? undefined : 'ok' });
  },
};
