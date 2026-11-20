// #45: hot cue 1 is no longer the Cue point's amber (batch D9, audit C5).
//
// --hc-1 was #e8b04a, the same as --cue, so on the waveform, the overview
// and the cue row hot cue 1 and the main cue marker were identical. With
// the flag amber leaves the slot palette and the other hues move up one:
// --hc-1 #ef7a64, --hc-2 #6fd08c, --hc-3 #c99cff, --hc-4 #5fd4d4,
// --hc-5 #ff9fc8, --hc-6 #d8d27a, --hc-7 #7cb6ff, and slot 8 takes a new
// hue (Slot 8 setting). Amber then means the Cue point only. The
// waveforms read the colours again when the flag flips (Waveform.svelte).
export default {
  id: 'cue-colour',
  n: 45,
  title: 'Hot cue 1 is no longer the Cue colour',
  group: 'Type and colour',
  notes: 'Amber leaves the hot cue palette (slots move up one hue; slot 8 gets a new one), so amber on screen always means the Cue point.',
  settings: {
    eight: {
      type: 'choice',
      label: 'Slot 8',
      default: 'mint',
      options: [
        ['mint', 'Light mint', 'A pale mint, clearly apart from slot 2\'s green and from the decks\' whites.'],
        ['lilac', 'Light lilac', 'A pale lilac; close-ish to slot 3\'s purple, so it relies on lightness to tell them apart.'],
        ['lime', 'Lime', 'A yellow-green; brighter, but nearer slot 6\'s olive yellow.'],
      ],
    },
  },
};

/** Show me: deck A with hot cue 1 set right by the cue point; flipping shows two amber marks (before) and coral beside amber (after). */
export const show = {
  about: "Hot cue 1 was the same amber as the Cue point, so on the waveform you couldn't tell the two apart. Now amber means the Cue point only; hot cues use the other colours.",
  before: 'Hot cue 1 and the Cue point are both amber: on the waveform and the overview, which mark is which?',
  after: 'Hot cue 1 is coral now and the Cue point stays amber, so each mark says what it is. All eight hot cue colours are distinct from the Cue.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.pause(0);
    await app.tab(0, 'Cues');
    const D = "[data-region='deck0']";
    await app.seek(0, 0.2);
    if (app.$(`${D} button[aria-label='Set hot cue 1']`)) await app.click(`${D} button[aria-label='Set hot cue 1']`);
    await app.seek(0, 0.18);
  },
  target: (app) => [app.$("[data-region='deck0'] .overview"), app.$("[data-region='deck0'] .perf .row")],
  badge: (app) => app.$("[data-region='deck0'] .overview")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const o = app.$("[data-region='deck0'] .overview")?.getBoundingClientRect();
    if (!o) return;
    const before = ctx.phase === 'before';
    d.text(o.left + o.width / 2, o.bottom + 14, before ? 'hot cue 1 and the Cue point: the same amber' : 'hot cue 1: coral; amber is the Cue point only', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
