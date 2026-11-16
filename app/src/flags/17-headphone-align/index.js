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

/** Show me: guides on each channel's fader axis and meter edges, against the headphone button. */
export const show = {
  note: "Guides down each channel strip: the fader's axis (the slot's centre, dashed) and the outer edges of fader and meter. Off, the headphone button is centred on the pair, on neither line (4.5px off the axis). On, \"Fader\" centres it on the axis; \"Fader and meter\" (under More) spans both edges.",
  target: '.mixer .hp',
  aid(d, app) {
    for (const wrap of app.$$('.mixer .fwrap')) {
      const fader = app.$('.fader', wrap)?.getBoundingClientRect();
      const meter = app.$('.meter', wrap)?.getBoundingClientRect();
      const hp = app.$('.hp', wrap)?.getBoundingClientRect();
      if (!fader || !hp) continue;
      const axis = fader.left + fader.width / 2;
      const y1 = fader.top;
      const y2 = hp.bottom + 6;
      d.vguide(axis, { y1, y2, c: d.C.aid });
      if (meter) {
        const l = Math.min(fader.left, meter.left);
        const r = Math.max(fader.right, meter.right);
        d.vguide(l, { y1, y2, c: d.C.ghost, dash: '1 3' });
        d.vguide(r, { y1, y2, c: d.C.ghost, dash: '1 3' });
      }
      const c = hp.left + hp.width / 2;
      const off = c - axis;
      const ok = Math.abs(off) < 0.5 || (meter && Math.abs(hp.left - Math.min(fader.left, meter.left)) < 0.5 && Math.abs(hp.right - Math.max(fader.right, meter.right)) < 0.5);
      d.dot(c, hp.top + hp.height / 2, { c: ok ? d.C.ok : d.C.bad });
      d.text(c, hp.bottom + 12, Math.abs(off) < 0.5 ? 'on the axis' : ok ? 'spans the strip' : `${off > 0 ? '+' : ''}${Math.round(off * 10) / 10}px off the axis`, { c: ok ? d.C.ok : d.C.bad, anchor: 'middle' });
    }
  },
};
