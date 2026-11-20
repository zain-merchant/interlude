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

/** Show me: kills deck A's Low; flipping shows the mixer jumping sideways (before) and holding still (after). */
export const show = {
  about: 'Cutting an EQ band (a "kill") made its label longer, which shoved the mixer sideways. Now the label stays the same length and nothing moves.',
  before: 'Kill the Low on deck A and its label becomes "Low · kill": the wider label pushes the fader and the master section sideways, and back when you let go.',
  after: 'The label turns red with a line through it instead, so it says "killed" without taking more room. The mixer stays put.',
  async setup(app, ctx) {
    const low = () => app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    if (low().classList.contains('killed')) await app.click(low());
    await app.wait(80);
    ctx.parts = () => [app.$$('.mixer .ch')[0]?.querySelector('.fader'), app.$('.mixer .cen')];
    // Where they sit before the kill, with the flag on and off.
    ctx.rest = app.both('no-shift', ctx.parts());
    await app.click(low());
    await app.until(() => low().classList.contains('killed'), 1000, 'the kill');
    ctx.low = low;
  },
  async replay(app, ctx) {
    await app.click(ctx.low());
    await app.wait(500);
    await app.click(ctx.low());
  },
  target: (app) => app.$$('.mixer .ch')[0]?.querySelectorAll('.knob')[3],
  badge: (app) => app.$('.mixer')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const rest = before ? ctx.rest.off : ctx.rest.on;
    const [fader, master] = ctx.parts().map((e) => e?.getBoundingClientRect());
    const lab = ctx.low()?.getBoundingClientRect();
    if (lab) d.text(lab.x + lab.width / 2, lab.bottom + 14, before ? 'label grew: "Low · kill"' : 'same label, struck through', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
    d.moved(rest[0], fader, { quiet: true, label: 'fader moved' });
    d.moved(rest[1], master, { what: 'master section', side: 'above', still: 'master section stays put' });
  },
};
