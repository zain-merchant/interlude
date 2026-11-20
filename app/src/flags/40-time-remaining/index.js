// #40: time remaining is the big number (batch D1, audit C8 option b).
//
// You mix against the time left, but each deck showed the time played as
// the big bright number (24px, full white) and the time left as the small
// grey one (16px, --fg-2). With the flag on the two swap sizes in place:
// the time left is the big number (--t-lg, weight 300, --fg) and the time
// played the small one (--t-md, --fg-2). Neither moves; elapsed stays on
// the left and remaining on the right, so flag 18's ending colour still
// lands on the remaining time.
//
// The pair is a button (C8 option b): click it (or Enter/Space) to make the
// other time big, for both decks; the choice is kept in localStorage as
// oss-dj.timeMode. Its tooltip says so ("Click to show time played" / "time
// left"), and a press that drags more than 3px doesn't swap.
// Hooks: Deck.svelte (the .times attributes), mode.svelte.js (the shared
// choice).
export default {
  id: 'time-remaining',
  n: 40,
  title: 'Time left is the big number',
  group: 'Type and colour',
  notes: 'Each deck shows the time left big and the time played small (sizes swap in place). Clicking the times swaps them back for both decks, remembered as oss-dj.timeMode.',
};

/** Show me: deck A playing mid-track; flipping shows the time played big (before) and the time left big (after), magnified. */
export const show = {
  about: 'You mix against the time left, but the big bright number on each deck was the time already played. Now the time left is the big one.',
  before: 'The big white number is how far into the track you are. The number you actually need mid-mix, how long until it ends, is the small grey one on the right.',
  after: 'The time left is now the big, bright number, so a glance tells you how long you have. The time played is still there, smaller. Click the times to swap them if you prefer.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.seek(0, 0.4);
    await app.play(0);
  },
  target: "[data-region='deck0'] .times",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const t = app.$("[data-region='deck0'] .times");
    if (!t) return;
    const r = t.getBoundingClientRect();
    const z = 2;
    const l = d.loupe('times', { x: r.left - 8, y: r.top - 8 }, { zoom: z, size: { w: (r.width + 16) * z, h: (r.height + 16) * z }, near: r, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'big: time played; time left is the small grey number' : 'big: time left; time played is the small one', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
