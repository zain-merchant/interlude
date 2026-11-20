// #69 (mixer, against the design doc): wells, fader slots and dial ticks
// the way some reviewers asked for (a-K93, b-K83, b-K84).
//
// The design doc's depth layers say recessed wells are "darker, with an
// inner shadow", not outlined, and the dials carry an engraved tick scale.
// Reviewers called the near-black fader slots hard to see, the unoutlined
// wells flat, and the 27 idle ticks per dial busy. The owner asked to judge
// these himself, so each is an option here, all off with the flag. CSS only.
export default {
  id: 'mixer-against-doc',
  n: 69,
  title: "Mixer wells, slots and dial ticks the reviewers' way",
  group: 'Type and colour',
  against: 'Recessed wells: darker, with an inner shadow. Used for waveforms and search.',
  notes: 'style.css only: --line-2 ring on fader slots, meters and empty sampler slots; slot #070708 -> #1b1c20; idle ticks 0.16/0.28 -> 0.09/0.20, or majors only.',
  settings: {
    wells: {
      type: 'choice',
      label: 'Wells',
      default: 'outlined',
      options: [
        ['outlined', 'Outlined', 'A faint 1px ring around fader slots, meters and empty sampler slots, so each recess has an edge you can see.'],
        ['doc', 'As the doc', "Dark and shadowed with no outline, the doc's recessed look."],
      ],
    },
    slot: {
      type: 'choice',
      label: 'Fader slot',
      default: 'lighter',
      options: [
        ['lighter', 'Lighter', 'The slot a step lighter than near-black, so the track a fader runs in is easier to see.'],
        ['doc', 'As the doc', 'The near-black slot, the deepest layer.'],
      ],
    },
    ticks: {
      type: 'choice',
      label: 'Dial ticks',
      default: 'quiet',
      options: [
        ['quiet', 'Quieter', 'The idle ticks fade back, so the lit ones and the pointer stand out more.'],
        ['majors', 'Long ticks only', 'Only the seven long ticks stay at rest: a calmer mixer, a coarser scale.'],
        ['doc', 'As the doc', "All 27 engraved ticks at today's strength."],
      ],
    },
  },
};

/** Show me: channel A's dials and fader, magnified, flipping between the doc's look and the reviewers'. */
export const show = {
  about: "Against the design doc, for you to judge: some reviewers found the mixer's fader slots too dark to see, its recessed wells flat without an edge, and the 27 small ticks on every dial busy. The doc keeps wells dark and unoutlined and the dials engraved. This shows the reviewers' version.",
  before: "The doc's look: near-black fader slots and meters with no outline, and 27 engraved ticks on every dial.",
  after: "The reviewers' version: slots a step lighter, a faint outline on every recess, and quieter idle ticks so the lit ones and the pointer lead.",
  setup() {},
  target: '.mixer',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const ch = app.$$('.mixer .ch')[0]?.getBoundingClientRect();
    const f = app.$('.mixer .fwrap')?.getBoundingClientRect();
    if (!ch || !f) return;
    const zoom = 2.5;
    const src = { x: ch.left - 6, y: ch.top - 4 };
    const w = f.right + 6 - src.x;
    const h = Math.min(ch.height * 0.5, (innerHeight - 160) / zoom);
    const l = d.loupe('doc', src, { zoom, size: { w: w * zoom, h: h * zoom }, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? "the reviewers' version: lighter, outlined slots and quieter ticks" : "the doc's look: dark unoutlined wells, full tick scales", { fixed: true });
  },
};
