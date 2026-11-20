// #17: the headphone cue button didn't line up with anything.
//
// Under each channel fader sits the fader and its level meter, with the
// headphone (cue) button below them. The button was centred on the pair as
// a whole, so it sat 4.5px off the fader's axis and nowhere near the meter:
// aligned to neither. This puts it under the fader, which is the line the
// eye follows down the channel, or (the other choice) spans the fader and
// meter together so its edges meet theirs.
export default {
  id: 'headphone-align',
  n: 17,
  title: 'Headphone button lined up with the fader',
  group: 'Layout',
  notes: 'Fader: the button is the fader\'s width and centred on its slot. Strip: it spans fader and meter, edge to edge. Room (d-K53): the channel strips move 7px inward so the button clears the Filter dial by 12px.',
  settings: {
    to: {
      type: 'choice',
      options: [
        ['fader', 'Fader', "The button sits right under the fader, on the line your eye follows down the channel."],
        ['strip', 'Fader and meter', 'The button spans the fader and its meter, so its edges meet theirs; it sits a little off the fader\'s line.'],
      ],
      default: 'fader',
      label: 'Align to',
    },
    room: {
      type: 'choice',
      options: [
        ['gap', '12px from the Filter dial', "Each channel's fader, meter and button move 7px toward the middle, so the button keeps a clear 12px from the Filter dial's ticks (d-K53)."],
        ['tight', 'As now', 'The strip stays where it is; the button comes within 5px of the Filter dial\'s ticks.'],
      ],
      default: 'gap',
      label: 'Room by the Filter dial',
    },
  },
};

/** Show me: each channel fader's centre line carried down through its headphone button, and a loupe on channel A's, flipping. */
export const show = {
  about: 'The headphone button under each channel fader sat a few pixels off the fader, lined up with nothing. Now it sits right under the fader.',
  before: "Follow a channel fader down to the headphone button under it: the button is centred on the fader and its level meter together, so it sits a little to one side of the fader's line.",
  after: 'The button sits squarely under its fader, so the channel reads as one straight column and your eye finds its headphone button at once.',
  setup(app, ctx) {
    void ctx;
  },
  target: '.mixer .hp',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const wraps = app.$$('.mixer .fwrap');
    wraps.forEach((wrap, i) => {
      const fader = app.$('.fader', wrap)?.getBoundingClientRect();
      const hp = app.$('.hp', wrap)?.getBoundingClientRect();
      if (!fader || !hp) return;
      const axis = fader.left + fader.width / 2;
      const off = hp.left + hp.width / 2 - axis;
      const ok = Math.abs(off) < 0.5;
      d.vguide(axis, { y1: fader.top, y2: hp.bottom + 6, c: ok ? d.C.ok : d.C.ghost, dash: '4 3' });
      if (i === 0) {
        // A loupe on the bottom of channel A's fader and its button.
        const zoom = 4;
        const size = { w: 240, h: 220 };
        const src = { x: axis - size.w / zoom / 2, y: hp.bottom + 6 - size.h / zoom };
        const l = d.loupe('hp', src, { zoom, size, at: { x: 300, y: 200 }, caption: '' });
        ctx.at = l.rect;
        const a = l.map(axis, 0).x;
        d.line(a, l.rect.y, a, l.rect.bottom, { c: ok ? d.C.ok : d.C.ghost, dash: '5 4', w: 1.5 });
        d.text(l.rect.x + 10, l.rect.y + 16, "dashed: the fader's centre line, 4×", { fixed: true });
        d.text(l.rect.x, l.rect.bottom + 16, ok ? 'the button sits right under the fader' : `the button sits ${Math.round(Math.abs(off) * 10) / 10}px to the ${off > 0 ? 'right' : 'left'} of the fader`, { tone: ok ? 'ok' : 'bad', fixed: true });
      }
    });
    void before;
  },
};
