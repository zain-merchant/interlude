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
  notes: 'Fader: the button is the fader\'s width and centred on its slot. Strip: it spans fader and meter, edge to edge.',
  settings: {
    to: {
      type: 'choice',
      options: [
        ['fader', 'Fader'],
        ['strip', 'Fader and meter'],
      ],
      default: 'fader',
      label: 'Align to',
    },
  },
};

/** Show me: each fader's axis down through its headphone button, with the verdict. */
export const show = {
  note: "The line is each fader's axis: the headphone button now sits on it (or spans the strip, in Strip).",
  target: '.mixer .hp',
  aid(d, app) {
    for (const wrap of app.$$('.mixer .fwrap')) {
      const fader = app.$('.fader', wrap)?.getBoundingClientRect();
      const meter = app.$('.meter', wrap)?.getBoundingClientRect();
      const hp = app.$('.hp', wrap)?.getBoundingClientRect();
      if (!fader || !hp) continue;
      const axis = fader.left + fader.width / 2;
      d.vguide(axis, { y1: fader.top, y2: hp.bottom + 4 });
      const c = hp.left + hp.width / 2;
      const off = c - axis;
      const spans = meter && Math.abs(hp.left - Math.min(fader.left, meter.left)) < 0.5 && Math.abs(hp.right - Math.max(fader.right, meter.right)) < 0.5;
      const ok = Math.abs(off) < 0.5 || spans;
      d.text(axis, hp.bottom + 15, Math.abs(off) < 0.5 ? 'on the axis' : spans ? 'spans the strip' : `${Math.round(Math.abs(off) * 10) / 10}px off`, { anchor: 'middle', tone: ok ? 'ok' : 'bad' });
    }
  },
};
