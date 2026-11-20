// #5: killing an EQ widened the mixer.
//
// Killing a band changed its dial's label from "Low" to "Low · kill". The
// wider label widened the channel's dial column, which pushed the fader,
// the master section and the rest of the mixer about 4px sideways, and back
// again on release. The label now stays the same text, and the kill shows
// in its colour plus a mark that takes no room (Knob.svelte keeps the
// " · kill" suffix off while this flag is on; the aria-pressed state and
// the tooltip still say it's killed). The record button also stops
// changing width as "Rec" becomes a running clock: it keeps the room of
// "0:00:00" from the start.
export default {
  id: 'no-shift',
  n: 5,
  title: 'Killing an EQ no longer nudges the mixer',
  group: 'Stability',
  notes: 'The kill shows as the label in red with a mark, not extra text, so the dial column keeps its width. Rec keeps a clock\'s width.',
  settings: {
    mark: {
      type: 'choice',
      label: 'Kill mark',
      options: [
        ['strike', 'Strike'],
        ['dot', 'Dot'],
        ['colour', 'Colour only'],
      ],
      default: 'strike',
    },
  },
};

/** Show me: kills deck A's Low and ghosts where the mixer's columns would be with the flag off. */
export const show = {
  note: "Deck A's Low is killed; dashed is where the mixer's columns would be with the flag off.",
  target: (app) => app.$$('.mixer .ch')[0]?.querySelectorAll('.knob')[3],
  async setup(app, ctx) {
    const low = () => app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    if (!low().classList.contains('killed')) await app.click(low());
    await app.until(() => low().classList.contains('killed'), 1000, 'the kill');
    ctx.parts = () => [app.$$('.mixer .ch')[0], app.$('.mixer .cen')];
    ctx.names = ['channel A', 'master'];
    ctx.b = app.both('no-shift', ctx.parts());
  },
  async replay(app) {
    const low = () => app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    await app.click(low());
    await app.wait(500);
    await app.click(low());
  },
  aid(d, app, ctx) {
    const other = app.other('no-shift', ctx.b);
    const off = app.isOn('no-shift') ? 'off:' : 'on:';
    ctx.parts().forEach((el, i) => el && d.ghost(other[i], el.getBoundingClientRect(), { label: `${off} ${ctx.names[i]}`, side: 'above' }));
  },
};
