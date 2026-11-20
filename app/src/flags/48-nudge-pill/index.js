// #48: the nudge pair reads as a control (batch D12).
//
// Two bare ‹ › glyphs floated under each pitch fader. They looked like
// the beat-jump arrows, but they bend the tempo while held. With the flag
// they're one outlined 24px pill split in two (inset 1px --line-2, --r, a
// 1px --line divider); hit areas stay 28×24. The Glyph setting is owner's
// call 8: − / + (the recommendation, audit C27: nudge is slower/faster,
// not back/forward) or the ‹ › arrows as today. Hook: Deck.svelte
// (nudgeGlyph).
export default {
  id: 'nudge-pill',
  n: 48,
  title: 'The nudge buttons look like buttons',
  group: 'Controls',
  notes: 'The two nudge buttons under each pitch fader become one outlined pill split in two, with − / + glyphs (or the old ‹ ›).',
  settings: {
    glyph: {
      type: 'choice',
      label: 'Glyphs',
      default: 'signs',
      options: [
        ['signs', '− and +', 'Slower and faster, which is what nudging does; no longer the same arrows as beat jump, which moves the play position.'],
        ['arrows', '‹ and ›', "Keeps today's arrows; only the pill shape is new."],
      ],
    },
  },
};

/** Show me: deck A's pitch column; flipping shows two stray arrows (before) and the pill (after), magnified. */
export const show = {
  about: 'Under each pitch fader, two small ‹ › arrows floated on their own. They looked like the beat-jump arrows but bend the tempo. Now they are one outlined pill with − and +.',
  before: 'Two bare ‹ › glyphs sit under the pitch fader. They look like decoration, or like the beat-jump arrows, not like buttons that slow down or speed up the track.',
  after: 'They are one small outlined pill split in two, − for a touch slower and + for a touch faster while you hold it.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: "[data-region='deck0'] .pitch .nudge",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const n = app.$("[data-region='deck0'] .pitch .nudge")?.getBoundingClientRect();
    if (!n) return;
    const z = 3;
    const l = d.loupe('nudge', { x: n.left - 8, y: n.top - 8 }, { zoom: z, size: { w: (n.width + 16) * z, h: (n.height + 16) * z }, near: n, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + l.rect.width + 10, l.at.y + l.rect.height / 2, before ? 'two loose arrows' : 'one pill: slower, faster', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
