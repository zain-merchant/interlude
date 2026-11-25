// #60 (mixer): meters you can read (M1, C21).
//
// A red flash on a meter was gone before you looked, nothing marked 0 dB,
// red started at about −8.6 dBFS, and the master pair was 72px tall beside
// channel meters that run the fader's height, so the same level sat at
// different heights. With the flag on (hooks: Meter.svelte, Mixer.svelte):
// - a 1px peak-hold line that stays for a moment (the Hold setting);
// - on the channel meters, a 4px clip light on top that stays red until
//   clicked, lit only by a real over (a peak above 0 dBFS; a track peaking
//   at full scale doesn't light it). The master meters have none: the
//   limiter, shown by LIM, keeps the master under full scale;
// - marks at 0, −6 and −18 dB on the side facing the middle;
// - colour zones in dBFS: green under −12, amber to −1, red above;
// - the master pair taller, down to the channel meters' foot, centred
//   under Master and Cue mix (or, as an option, full length beside them).
export default {
  id: 'meters',
  n: 60,
  title: 'Meters with a scale, peak hold and a clip light',
  group: 'Controls',
  notes: 'Meter.svelte: peak hold (setTimeout, no frame loop, unitless --pk), latched clip light (channels only, `light` false on the master; above 0 dBFS only, a button only while lit, its target the light plus 4px, away from the fader), 0 dB mark 5px --fg-2, −6/−18 3px --fg-4, zones at −12 and −1 dBFS on the bar under the light. Mixer.svelte passes ticks/what/light. style.css: the master pair under the dials (default) or beside them, its bars level with the channel bars.',
  settings: {
    master: {
      type: 'choice',
      label: 'Master meters',
      default: 'below',
      options: [
        ['below', 'Under the dials', 'The pair stays centred under Master and Cue mix, on the same middle line as Rec and the crossfader, and runs down to the channel meters\' foot.'],
        ['beside', 'Full length, beside the dials', 'The pair runs exactly as long as the channel meters\' bars, so a level sits at one height on all four, but Master and Cue mix move off the mixer\'s middle line to make room.'],
      ],
    },
    hold: { type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: '', label: 'Peak hold (s)' },
  },
};

/** Show me: both decks playing, a clip lit on channel A, the mixer's meters ringed and magnified. */
export const show = {
  about: "A red flash on a meter was gone before you could look, nothing marked 0 dB, and the master meters were a short stub beside the channel meters. Now each meter has a scale, holds its last peak, keeps a red clip light on each channel until you click it, and the master meters run down to the same foot as the channel ones.",
  before: 'The meters are plain bars: a peak flickers and is gone, a clip is a red flash you missed, there is no 0 dB mark, and the master pair is a short stub, so the same level sits lower on the channels than on the master.',
  after: 'A thin line holds each peak for a moment, a red light at the top of a channel meter stays on after a clip until you click it, small marks show 0 dB (the longer one), −6 and −18 dB, and the master meters are taller and end on the channel meters\' line.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
    await app.wait(400);
    // The simulated tracks never go over 0 dBFS (nor should they), so the show plays one
    // simulated over on channel A, +1 dB, to light the latch; the engine decays it from there.
    const { engine } = await import('../../lib/engine.svelte.js');
    ctx.clip = () => (engine.deckLevels[0] = 1.12);
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
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'held peaks, a clip light that stays, dB marks, a taller master' : 'no scale, no held peak, the clip flash is gone, a short master', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
