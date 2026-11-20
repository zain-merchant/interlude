// #60 (mixer): meters you can read (M1, C21).
//
// A red flash on a meter was gone before you looked, nothing marked 0 dB,
// red started at about −8.6 dBFS, and the master pair was 72px tall beside
// channel meters that run the fader's height, so the same level sat at
// different heights. With the flag on (hooks: Meter.svelte, Mixer.svelte):
// - a 1px peak-hold line that stays for a moment (the Hold setting);
// - a 4px clip light on top that stays red until clicked (a channel at
//   0 dBFS; the master when its limiter catches a peak, as LIM shows);
// - marks at 0, −6 and −18 dB on the side facing the middle;
// - colour zones in dBFS: green under −12, amber to −1, red above;
// - the master pair as long as the channel meters.
export default {
  id: 'meters',
  n: 60,
  title: 'Meters with a scale, peak hold and a clip light',
  group: 'Controls',
  notes: 'Meter.svelte: peak hold (setTimeout, no frame loop), latched clip light (a button only while lit), 0/−6/−18 dB marks, zones at −12 and −1 dBFS on the bar under the light. Mixer.svelte passes ticks/over/what. style.css lays the master pair out beside the dials, full length.',
  settings: {
    master: {
      type: 'choice',
      label: 'Master meters',
      default: 'beside',
      options: [
        ['beside', 'Full length, beside the dials', 'The master pair runs exactly as long as the channel meters, so a level sits at the same height on all four; Master and Cue mix stack beside it.'],
        ['split', 'Either side of the dials', 'Left meter left of Master and Cue mix, right meter right of them: symmetrical like the channels, though it can read as four channel meters in a row.'],
        ['below', 'Under the dials', 'Keeps the pair centred under Master and Cue mix and ends it level with the channel meters, but it stays shorter than them.'],
      ],
    },
    hold: { type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: '', label: 'Peak hold (s)' },
  },
};

/** Show me: both decks playing, a clip lit on channel A, the mixer's meters ringed and magnified. */
export const show = {
  about: "A red flash on a meter was gone before you could look, nothing marked 0 dB, and the master meters were a short stub beside the channel meters. Now each meter has a scale, holds its last peak, keeps a red clip light on until you click it, and the master meters are as long as the channel ones.",
  before: 'The meters are plain bars: a peak flickers and is gone, a clip is a red flash you missed, there is no 0 dB mark, and the master pair is a short stub, so the same level sits lower on the channels than on the master.',
  after: 'A thin line holds each peak for a moment, a red light at the top stays on after a clip until you click it, small marks show 0, −6 and −18 dB, and the master meters are as long as the channel meters, so a level reads the same on all four.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
    await app.wait(400);
    // A clip on channel A: one frame at 0 dBFS lights the latch (the engine decays it from there).
    const { engine } = await import('../../lib/engine.svelte.js');
    ctx.clip = () => (engine.deckLevels[0] = 1);
    ctx.clip();
  },
  async each(app, ctx, on) {
    if (on) ctx.clip?.();
  },
  async cleanup(app) {
    await app.pause(0);
    await app.pause(1);
  },
  target: (app) => [app.$('.mixer .fwrap'), app.$('.mixer .mpair'), app.$('.mixer .fwrap.mirror')],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const a = app.$('.mixer .fwrap')?.getBoundingClientRect();
    const b = app.$('.mixer .fwrap.mirror')?.getBoundingClientRect();
    if (!a || !b) return;
    // From channel A's fader to channel B's, top to the headphone line: 2× (less on short windows).
    const src = { x: a.left - 6, y: a.top - 6 };
    const w = b.right + 6 - src.x;
    const h = a.height + 12;
    const zoom = Math.min(2, (innerHeight - 120) / h);
    const l = d.loupe('meters', src, { zoom, size: { w: w * zoom, h: h * zoom }, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'held peaks, a clip light that stays, dB marks, a full-length master' : 'no scale, no held peak, the clip flash is gone, a short master', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
