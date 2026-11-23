// #56 (against the design doc; addendum parts 3 and 4): empty and
// disabled items on the decks brighter than the doc's off level.
//
// The doc: "--fg-off is 30%, for empty or disabled items only" (--fg-4 in
// app.css), and owner's call 9 keeps it. The panel dropped five clusters
// (c-K90, b-K80, d-K74, e-K42, d-K78): judges measured the empty hot cue
// ring at well under 3:1 and the disabled Cue, Sync and "Set" on an empty
// deck at about 2:1. With this flag the empty hot cue rings are --fg-3
// (50%); the Reach setting can also lift the deck's disabled controls
// (40% opacity to 60%; Cue and Sync to 75%). The layout builder's token
// option covers the rest of the app.
export default {
  id: 'against-empty-rings',
  n: 56,
  disabled: 'Against the owner\'s call 9, which keeps empty hot cues quiet.',
  title: 'Brighter empty hot cues (and disabled deck controls)',
  group: 'Type and colour',
  against: '"Text: ... --fg-off is 30%, for empty or disabled items only."',
  notes: 'Empty hot cue rings at --fg-3 instead of --fg-4; optionally the deck\'s disabled controls at 60% (Cue, Sync 75%) instead of 40%.',
  settings: {
    reach: {
      type: 'choice',
      label: 'Reach',
      default: 'rings',
      options: [
        ['rings', 'Empty hot cue rings', 'Only the hollow rings of empty hot cues get brighter, so you can see the four slots exist.'],
        ['disabled', 'Rings and disabled controls', 'Also lifts disabled controls on the deck (Cue, Sync, the mode row on an empty deck): easier to read, but harder to tell from enabled ones.'],
      ],
    },
  },
};

/** Show me: an empty deck B beside a loaded deck A; flipping shows the doc's off level (before) and brighter empties (after). */
export const show = {
  about: 'Against the design doc\'s "off" level for empty and disabled things. Judges found empty hot cue rings and disabled deck controls too faint to see. Turn this on to judge them a step brighter.',
  before: 'Empty hot cue rings and an empty deck\'s disabled controls are at the doc\'s faint "off" level: clearly off, but the rings almost vanish.',
  after: 'The empty rings are a step brighter, so the four slots read as slots. (Reach can lift disabled controls too.) The cost: empty and set look a little more alike.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
  },
  target: "[data-region='deck0'] .perf",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const c = app.$("[data-region='deck0'] .perf .tc")?.getBoundingClientRect();
    if (!c) return;
    const z = 3;
    const l = d.loupe('ring', { x: c.left - 6, y: c.top - 4 }, { zoom: z, size: { w: (c.width + 12) * z, h: (c.height + 8) * z }, near: c, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'the doc: empty ring at the off level' : 'against the doc: a step brighter', { tone: before ? undefined : 'ok', fixed: true });
  },
};
