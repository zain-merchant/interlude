// #56 (against the design doc; addendum part 3): stronger deck colours.
//
// The doc picks "a cool and a warm white, so the decks differ by
// temperature, not by hue", and rules out "saturated deck colours" and
// "Blue and orange. They look like legacy DJ software." The panel dropped
// four clusters asking for more (c-K88, d-K70, d-K79, c-K96): judges found
// the ice and cream whites close in lightness, so the loaded-row bars, the
// crossfader ends and the tab underlines barely tell the decks apart, and
// some read deck B's cream as the Cue amber. The Look setting tries two
// steps: more contrast (a cooler blue-white and a warmer peach, still
// whites) or the hues (blue and orange). It overrides the deck tokens
// (--deck-a/-b and the waveform bands), so everything in a deck's colour
// follows, the waveforms included (Waveform.svelte re-reads them).
export default {
  id: 'against-deck-colours',
  n: 56,
  title: 'Stronger deck colours',
  group: 'Type and colour',
  against: '"Deck colours: a cool and a warm white, so the decks differ by temperature, not by hue." Ruled out: "saturated deck colours" and "Blue and orange."',
  notes: 'Overrides --deck-a/-b and the waveform band tokens: more contrast between the two whites, or blue and orange.',
  settings: {
    look: {
      type: 'choice',
      label: 'Look',
      default: 'contrast',
      options: [
        ['contrast', 'More contrast', 'A cooler, bluer white for the left deck and a warmer, peachier one for the right: still whites, but easier to tell apart at a glance.'],
        ['hue', 'Blue and orange', 'Saturated blue and orange, as in most DJ software: the decks can never be confused, but the doc calls this look legacy.'],
      ],
    },
  },
};

/** Show me: both decks loaded; flipping shows today's whites (before) and the stronger colours (after). */
export const show = {
  about: 'Against the design doc, which keeps the decks to a cool and a warm white. Judges found the two too alike (some read the cream as the Cue amber) and asked for stronger colours. Turn this on to judge two steps: more contrast between the whites, or blue and orange.',
  before: 'The decks are ice white and cream white, as the design doc intends: calm, but close in lightness, so the lane bars, tab underlines and library markers are hard to tell apart quickly.',
  after: 'The two decks are more clearly different in colour across the waveforms, tabs, play buttons and markers. The cost: louder colour, which the doc avoided on purpose.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
  },
  target: (app) => [app.$("[data-region='deck0']"), app.$("[data-region='deck1']")],
  badge: (app) => app.$("[data-region='deck0'] .overview")?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const o = app.$("[data-region='deck0'] .overview")?.getBoundingClientRect();
    if (!o) return;
    const before = ctx.phase === 'before';
    d.text(o.left, o.bottom + 16, before ? 'the doc: two whites' : 'against the doc: stronger colours', { tone: before ? undefined : 'ok' });
  },
};
