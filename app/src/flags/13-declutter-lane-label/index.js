// #13: a long title ran over the play head.
//
// Each waveform lane names its track at the top left, in one line with no
// limit. The play head is the lane's centre line, so a long title (a
// remaster with its mix name and label, a live set) ran across the play
// head and over the waveform it was labelling, and on lane A towards the
// zoom control. The label now stops short of the centre with an ellipsis;
// the full title is on the deck and in the library. It also sits on a
// dark backing like the zoom pill's (rgb(11 11 13 / 0.7), 24px tall), so
// the waveform's peaks no longer cut through the letters. An empty lane
// draws no chip, only its deck bar.
export default {
  id: 'declutter-lane-label',
  n: 13,
  title: 'Waveform titles stop before the play head',
  group: 'Stability',
  notes: 'The track name over each waveform lane ends with an ellipsis before the centre line instead of running across it, on a dark backing so peaks don\'t cut through it.',
};

/** Show me: a very long title on deck A's waveform, in a narrow window; flipping shows it running over the play head (before) and stopping short (after). */
export const show = {
  about: 'A long track title over its waveform ran across the play head line, right where you watch the beats. Now it stops short with "…".',
  before: 'Load a track with a long title (a remaster, a live set) and its name runs straight across the play head, covering the waveform where the beat is playing.',
  after: 'The name ends with "…" before the play head, so the middle of the waveform stays clear. The full title is still on the deck and in the library.',
  needs: { 'stress-data': { set: 'worst' } },
  async setup(app, ctx) {
    await app.loadTrack(0, "Can't Get You Out Of My Head");
    await app.clearSearch();
    // A smaller window (1024 wide in the app's own pixels): the lanes are
    // narrower, so a long title reaches the middle.
    ctx.was = app.zoom(Math.max(1, innerWidth / 1024));
    await app.wait(250);
  },
  cleanup(app, ctx) {
    if (ctx.was != null) app.zoom(ctx.was);
  },
  target: (app) => [app.$('.waves .lane .who')],
  badge: (app) => app.$('.waves .lane .who')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const lane = app.$('.waves .lane')?.getBoundingClientRect();
    const who = app.$('.waves .lane .who');
    if (!lane || !who) return;
    const x = lane.left + lane.width / 2;
    const box = who.getBoundingClientRect();
    const r = app.textRect(who) ?? box;
    // The visible end of the name (it's cut at its box when it ends in "…").
    const end = Math.min(r.right, box.right);
    d.vguide(x, { y1: lane.top, y2: lane.bottom, dash: '3 3' });
    d.text(x + 6, lane.bottom - 12, 'play head', { free: true });
    const y = r.top + r.height / 2;
    if (end > x) d.text(x + 10, r.bottom + 14, 'title runs over the play head', { tone: 'bad' });
    else d.text(end + 8, r.bottom + 14, `title stops ${Math.round(x - end)}px before the play head`, { tone: 'ok' });
    void y;
  },
};
