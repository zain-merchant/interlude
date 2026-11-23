// #39 (against the design doc, addendum parts 3 and 4): brighter or larger
// quiet text, and a brighter off level.
//
// The panel dropped these because the doc rules them out:
// - 11px --fg-3 captions "too small or faint" (a-K82, d-K67, d-K68, c-K89,
//   b-K47): the doc's type scale includes 11px and --fg-3 is its quietest
//   readable level. Measured 4.45 to 4.6:1, not the judges' 3 to 4:1.
// - Empty and disabled items at --fg-4 (c-K90, b-K80, d-K74, e-K42,
//   d-K78): the doc's "off" level, 30%, for empty or disabled items only.
// The owner wants to judge them, so this flag (off by default) tries the
// judges' versions: captions at 60% or 12px (or both), and the off level at
// 40%. #25 quiet-text (52%) is the in-doc fix; with both on, this one wins.
export default {
  id: 'against-text-levels',
  n: 39,
  disabled: 'Against the doc\'s text levels; #25 is the adopted contrast fix.',
  title: 'Brighter, larger quiet text and empty items',
  group: 'Type and colour',
  against: '"Type: five sizes, 11, 13, 16, 24 and 32px." "--fg-3 is 50%. This is the quietest level that still passes 4.5:1." "--fg-off is 30%, for empty or disabled items only."',
  notes: 'Off by default; against the doc. Quiet text (--fg-3) to 60%, or 11px text (--t-xs) to 12px, or both; the off level (--fg-4) to 40%. Not under Increase Contrast.',
  settings: {
    quiet: {
      type: 'choice',
      label: 'Quiet text',
      default: 'brighter',
      options: [
        ['brighter', 'Brighter', 'Captions and labels at 60% instead of 50%: easier to read in a dark booth, but the steps between the text levels get smaller, so less stands out.'],
        ['larger', 'Larger', 'Every 11px caption at 12px: easier to read at arm\'s length, but it adds a sixth size to the doc\'s five and some labels may crowd.'],
        ['both', 'Both', 'Brighter and larger: the most readable, and the furthest from the quiet, layered look the doc asks for.'],
      ],
    },
    off: {
      type: 'choice',
      label: 'Empty and disabled',
      default: 'brighter',
      options: [
        ['brighter', 'Brighter', 'Empty slots ("Set") and disabled controls at 40% instead of 30%: you can read them, but they look more like they can be used.'],
        ['doc', 'As the doc', 'Keeps the doc\'s 30% off level, to judge the quiet text on its own.'],
      ],
    },
  },
};

/** Show me: loupes on deck A's empty hot cues and the mixer's captions, flipping the doc's levels and the judges'. */
export const show = {
  about: 'Against the design doc, for you to judge: several reviewers found the small grey captions and the empty "Set" slots too faint to read in a dark booth, and asked for them brighter or bigger. The doc keeps them quiet on purpose, so the bright things stand out.',
  before: "The doc's levels: captions at 50% and 11px, empty slots and disabled controls at 30%. Calm and layered, but the smallest words are hard to read from a step back.",
  after: "The judges' version (pick it below): captions brighter and/or a size up, empty slots brighter. Easier to read, at the cost of a busier screen where less stands out.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: (app) => [app.$("[data-region='deck0'] .perf"), app.$('.mixer .knob')],
  aid(d, app, ctx) {
    const perf = app.$("[data-region='deck0'] .perf")?.getBoundingClientRect();
    const m = app.$('.mixer')?.getBoundingClientRect();
    if (perf) d.loupe('cues', { x: perf.x, y: perf.y + perf.height / 2 - 20 }, { zoom: 2.5, size: { w: 340, h: 100 }, near: perf });
    if (m) {
      const l = d.loupe('captions', { x: m.x + 8, y: m.y + 40 }, { zoom: 3, size: { w: 300, h: 240 }, near: m });
      // A step of 10% white is hard to judge by eye: the captions' contrast, measured live.
      d.contrast(app.$('.mixer .knob button.label'), { x: l.rect.x, y: l.rect.bottom + 46, w: l.rect.width }, { what: 'captions', lo: 4, hi: 7 });
    }
  },
};
