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

/** Show me: kills deck A's Low and ghosts where the mixer's columns stood. */
export const show = {
  note: "Deck A's Low is killed: ghosts show the mixer's columns held still. Toggle: off, \"Low · kill\" widens the column and the mixer shifts 9px.",
  target: (app) => app.$$('.mixer .ch')[0]?.querySelectorAll('.knob')[3],
  async setup(app, ctx) {
    ctx.parts = () => [app.$('.mixer .fwrap'), app.$('.mixer .cen'), app.$('.mixer .fwrap.mirror'), app.$$('.mixer .ch')[1]];
    ctx.names = ['fader A', 'master', 'fader B', 'channel B'];
    const low = () => app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    if (low().classList.contains('killed')) await app.click(low());
    // At rest (nothing killed) the mixer is the same with the flag on or off.
    ctx.rest = app.snap(ctx.parts());
    // Where they stand with the flag off, too: the ghost compares like with like.
    ctx.restOff = app.without('no-shift', () => app.snap(ctx.parts()));
    await app.click(low());
    await app.until(() => low().classList.contains('killed'), 1000, 'the kill');
  },
  async replay(app) {
    const low = () => app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    await app.click(low());
    await app.wait(500);
    await app.click(low());
  },
  aid(d, app, ctx) {
    ctx.parts().forEach((el, i) => el && d.ghost((app.isOn('no-shift') ? ctx.rest : ctx.restOff)[i], el.getBoundingClientRect(), { label: ctx.names[i], below: i % 2 === 1 }));
  },
};
