// #62 (C7): bigger targets. A dial took the pointer only on its 14-20px
// cap, not on the 38px tick ring around it, so a quick grab mid-blend
// often did nothing. With the flag on, Knob.svelte moves its pointer,
// wheel, double-click and right-click handlers from the cap (.dial) to
// the ring (.wrap), and pressing the ring focuses the dial like the cap
// does. Every dial gets it: mixer, FX level and the sampler's Level.
// Faders (round 2, C11, approved in round 1 and never built): a press on
// a fader's track threw the cap there (full volume to half in one click,
// d-K03). Now every press, cap or track, starts a relative drag from the
// fader's current value, as the dials do; keys and double-click reset are
// unchanged (Fader.svelte). Channel faders, crossfader and pitch.
// The flag id is shared: the deck and library builders gate their own
// 24px-target rules (zoom buttons, search clear) on it too.
export default {
  id: 'hit-areas',
  n: 62,
  title: 'Dials grab on their whole ring',
  group: 'Controls',
  notes: 'Knob.svelte: gesture handlers on .wrap while on, on .dial while off (onRing/onCap). style.css: round .wrap so overlapping rings split cleanly, ns-resize cursor. Fader.svelte: a press on the track drags from the current value instead of jumping there.',
};

/** Show me: channel A's dials with the area that takes the pointer drawn on each. */
export const show = {
  about: 'A mixer dial only reacted if you hit its small centre cap; grabbing the ring of ticks around it did nothing. Now the whole ring is the handle.',
  before: 'Only the small cap in the middle of each dial takes the pointer (outlined). Catch the ring of ticks instead, as you would in a hurry, and nothing happens.',
  after: 'The whole dial, ticks and all, takes the pointer (outlined): about four times the area, so a quick grab lands.',
  setup() {},
  target: (app) => app.$$('.mixer .ch')[0]?.querySelectorAll('.knob .wrap') ?? [],
  aid(d, app, ctx) {
    const after = ctx.phase === 'after';
    const wraps = [...(app.$$('.mixer .ch')[0]?.querySelectorAll('.knob .wrap') ?? [])];
    wraps.forEach((w, i) => {
      const r = (after ? w : w.querySelector('.dial'))?.getBoundingClientRect();
      if (!r) return;
      d.box(r, { c: after ? d.C.ok : d.C.bad, w: 1.5, rx: r.width / 2, fill: after ? 'rgb(79 227 155 / .16)' : 'rgb(255 106 92 / .16)' });
      if (i === 0) d.text(r.right + 10, r.top + r.height / 2, after ? 'the whole ring grabs' : 'only the cap grabs', { tone: after ? 'ok' : 'bad' });
    });
  },
};
