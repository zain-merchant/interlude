// #13: a long title ran over the play head.
//
// Each waveform lane names its track at the top left, in one line with no
// limit. The play head is the lane's centre line, so a long title (a
// remaster with its mix name and label, a live set) ran across the play
// head and over the waveform it was labelling, and on lane A towards the
// zoom control. The label now stops short of the centre with an ellipsis;
// the full title is on the deck and in the library.
export default {
  id: 'declutter-lane-label',
  n: 13,
  title: 'Lane labels stop before the play head',
  group: 'Stability',
  notes: 'The track name over each waveform lane ends with an ellipsis before the centre line instead of running across it.',
};

/** Show me: a very long title on deck A's lane, with the play head marked. */
export const show = {
  note: "A very long title on deck A's lane stops short of the play head (off, it runs across).",
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app) {
    await app.loadTrack(0, 'Strings of Life');
    await app.clearSearch();
  },
  target: '.waves .lane .who',
  aid(d, app) {
    const lane = app.$('.waves .lane')?.getBoundingClientRect();
    const who = app.$('.waves .lane .who');
    if (!lane || !who) return;
    const x = lane.left + lane.width / 2;
    const r = app.textRect(who) ?? who.getBoundingClientRect();
    const end = Math.min(r.right, who.getBoundingClientRect().right);
    const gap = x - end;
    const y = r.top + r.height / 2;
    if (gap > 0) d.measure(end, y, x, y, { label: `${Math.round(gap)}px clear`, side: 'below', tone: 'ok' });
    else d.text(x + 8, y, `${Math.round(-gap)}px over the play head`, { tone: 'bad' });
  },
};
