// #50: numbered hot cues on the overview (batch D16), and minute ticks
// (backlog a-K53, b-K46).
//
// On the deck's overview a hot cue was a coloured line and a 4px
// triangle, with no number, while the scrolling lanes show numbered chips.
// With the flag each overview marker carries the lane's chip at its top:
// 12px tall, the slot's colour, its number in 11px --ink (drawn on the
// canvas, waveform-2d.js chip()). The overview also gets 3px minute ticks
// along its foot in --fg-4 (Ticks setting), so you can read how far in a
// cue or a break is.
// Hooks: waveform-2d.js (draw, chip), Waveform.svelte.
export default {
  id: 'overview-cues',
  n: 50,
  title: 'Hot cue numbers on the overview',
  group: 'Polish',
  notes: "Each hot cue on the deck's overview gets the lane's numbered chip at its top; small minute ticks run along the overview's foot.",
  settings: {
    ticks: {
      type: 'choice',
      label: 'Minute ticks',
      default: 'minutes',
      options: [
        ['minutes', 'Every minute', 'A small tick along the bottom of the overview at each minute, so you can see how far into the track a cue or a break sits.'],
        ['none', 'None', 'No ticks; the overview shows only the waveform and the markers.'],
      ],
    },
  },
};

/** Show me: deck A with three hot cues set; flipping shows plain lines (before) and numbered chips (after) on the overview, magnified. */
export const show = {
  about: "On the deck's overview a hot cue was just a coloured line, so you had to match colours to know which was which. Now each one carries its number, as on the scrolling waveform.",
  before: "Three hot cues on the overview are three thin coloured lines: which one is cue 2? You have to remember the colours.",
  after: 'Each line has a small numbered chip on top, the same as on the scrolling waveform, and minute ticks along the bottom show where in the track they sit.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.pause(0);
    await app.tab(0, 'Cues');
    const D = "[data-region='deck0']";
    for (const [n, at] of [[1, 0.12], [2, 0.38], [3, 0.66]]) {
      if (app.$(`${D} button[aria-label='Set hot cue ${n}']`)) {
        await app.seek(0, at);
        await app.click(`${D} button[aria-label='Set hot cue ${n}']`);
      }
    }
    await app.seek(0, 0.05);
  },
  target: "[data-region='deck0'] .overview",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const o = app.$("[data-region='deck0'] .overview")?.getBoundingClientRect();
    if (!o) return;
    const z = 2;
    const l = d.loupe('ov', { x: o.left - 4, y: o.top - 4 }, { zoom: z, size: { w: Math.min(900, (o.width + 8) * z), h: (o.height + 8) * z }, near: o, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'hot cues: coloured lines, no numbers' : 'hot cues: numbered, like the scrolling lane', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
