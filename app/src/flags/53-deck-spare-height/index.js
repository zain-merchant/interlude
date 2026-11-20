// #53: the deck's spare height goes to the overview (batch L3).
//
// On every deck the Cues row (and Loop, FX, Stems) sat in a band about
// 100px tall holding one 32px row, with 36px of nothing above and below,
// while the overview waveform above it was a thin 48px strip. With the
// flag the deck body's rows are `auto minmax(32px, 1fr) auto auto auto`:
// the overview takes the spare height (about 80px at the designed 360px
// deck), and the mode row hugs its tabs, 8px under the tab rule.
// Fit setting: 'overview' (default) or 'tight', which keeps the overview
// at 48px and collects the spare room above the transport, for the
// panel-sizes flag to trim.
export default {
  id: 'deck-spare-height',
  n: 53,
  title: "The deck's spare height goes to the overview",
  group: 'Layout',
  notes: 'Deck body rows become auto minmax(32px, 1fr) auto auto auto: the overview grows into the dead space and the mode row sits right under its tabs.',
  settings: {
    fit: {
      type: 'choice',
      label: 'Spare height',
      default: 'overview',
      options: [
        ['overview', 'To the overview', "The deck's overview waveform grows into the empty band, so you see the whole track bigger; the cue row sits right under its tabs."],
        ['tight', 'Tight', 'The overview stays a thin strip; the cue row sits under its tabs and the spare room gathers above the transport, ready for the panel-sizes flag to trim the deck.'],
      ],
    },
  },
};

/** Show me: both decks loaded on the Cues tab; flipping shows the cue row floating in an empty band (before) and the taller overview (after). */
export const show = {
  about: "Each deck's cue row floated in a tall empty band, while the overview waveform above it was a thin strip. Now the overview gets that room, and the cue row sits right under its tabs.",
  before: 'Look at the space around the hot cues: one small row in the middle of a tall empty band. The overview of the whole track above it is a thin strip.',
  after: "The overview is taller and easier to read; the cue row sits just under the tabs, and the empty band is gone.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    ctx.parts = () => [app.$("[data-region='deck0'] .overview"), app.$("[data-region='deck0'] .perf .row")];
    ctx.rest = app.both('deck-spare-height', ctx.parts());
  },
  target: (app) => [app.$("[data-region='deck0'] .overview"), app.$("[data-region='deck0'] .mp")],
  badge: (app) => app.$("[data-region='deck0'] .overview")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const [o, row] = ctx.parts().map((e) => e?.getBoundingClientRect());
    if (!o || !row) return;
    const before = ctx.phase === 'before';
    d.text(o.right + 10, o.top + o.height / 2, `overview ${Math.round(o.height)}px tall`, { tone: before ? 'bad' : 'ok', free: true });
    d.moved(before ? ctx.rest.off[1] : ctx.rest.on[1], row, { what: 'cue row' });
  },
};
