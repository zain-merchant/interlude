// #5: the deck's mode row and beat-jump readout moved as values changed.
//
// Measured at 1440×900, deck A:
// - Setting a hot cue turned "Set" into "0:32": the cue's dot and number
//   moved 3px left.
// - Changing the loop size (4 → 16 → 1/16 beats) resized the loop button,
//   and with the row spaced evenly, both arrows moved 3–6px.
// - The beat-jump size in the transport ("4" → "1/16") resized the middle of
//   the jump control, moving its ‹ › hit areas by up to 4px.
// - Choosing another effect (Echo → Flanger) widened its button and pushed
//   everything after it 9px right; On/Off also changed width.
// Each value now has a slot sized for its longest form, so pressing a
// control never moves the one next to it. Hot cue and FX slots apply where
// the deck has room (320px and up); in the narrowest decks they'd overflow,
// so those keep their old sizing (see stress-narrow-strip for that width).
export default {
  id: 'no-shift-strip',
  n: 5,
  title: 'Cues, loop, FX and beat jump hold their places',
  group: 'Stability',
  notes: 'Hot cue times, loop and beat-jump sizes, the effect name and On/Off sit in fixed slots, so the controls beside them stay put.',
};

/** Show me: shrinks deck A's loop from 4 beats to 1/4; flipping shows its arrows sliding (before) and holding (after). */
export const show = {
  about: 'Changing a loop size, an effect or a hot cue resized its button, which nudged the arrows and buttons beside it. Now each value has a fixed slot and nothing around it moves.',
  before: 'Halve the loop from 4 beats to 1/4: the size label gets wider, so the ‹ › arrows on either side slide away from where your mouse was.',
  after: 'The size sits in a slot made for its longest value, so the arrows stay exactly where they were and you can keep clicking.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    const D = "[data-region='deck0']";
    const size = () => {
      const s = app.$(`${D} .perf .big b`)?.textContent.trim() ?? '4';
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : a;
    };
    // To 4 beats, measured, then down to 1/4.
    for (let i = 0; i < 10 && size() !== 4; i++) await app.click(`${D} button[aria-label='${size() < 4 ? 'Double loop' : 'Halve loop'}']`);
    ctx.parts = () => app.$$(`${D} .perf .tb.ar`);
    ctx.rest = app.both('no-shift-strip', ctx.parts());
    for (let i = 0; i < 4; i++) await app.click(`${D} button[aria-label='Halve loop']`);
  },
  target: "[data-region='deck0'] .perf",
  badge: (app) => app.$("[data-region='deck0'] .perf")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    const live = ctx.parts().map((e) => e.getBoundingClientRect());
    let most = 0;
    live.forEach((r, i) => {
      if (!rest[i]) return;
      const dx = Math.max(Math.abs(r.x - rest[i].x), Math.abs(r.right - rest[i].right));
      if (dx > 0.5) {
        most = Math.max(most, dx);
        d.box(rest[i], { c: d.C.ghost, dash: '4 3', w: 1.25 });
      }
    });
    if (live.length < 2) return;
    const x = (live[0].left + live[live.length - 1].right) / 2;
    const y = Math.max(...live.map((r) => r.bottom)) + 16;
    if (most) d.text(x, y, `loop arrows slid ${Math.round(most)}px (dashed: where they were)`, { anchor: 'middle', tone: 'bad' });
    else d.text(x, y, 'loop arrows stay put', { anchor: 'middle', tone: 'ok' });
  },
};
