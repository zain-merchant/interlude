// #57 (against the design doc; addendum part 4): Cue as strong as Play.
//
// The doc's depth order puts outlined controls (4) behind the one solid
// Play (5), so at rest Cue is a 1px amber edge at 55%, stronger only on
// hover or at the cue point. The panel dropped d-K73: Cue, the button you
// hit as often as Play, looks quieter than its own hover state. With this
// flag Cue rests with the full 1.5px amber ring (the Look setting can add a
// light amber fill). Disabled stays as it is. (Flag 09's tonal Cue, the
// build list's D18, goes the other way; this is for comparison.)
export default {
  id: 'against-cue-outline',
  n: 57,
  disabled: 'Against the doc\'s outlined Cue under one solid Play.',
  title: 'A stronger Cue at rest',
  group: 'Controls',
  against: '"Depth, from back to front: ... 4. Outlined controls (.ctl). 5. One solid primary control, Play."',
  notes: 'Cue rests with the full-strength 1.5px amber ring (or that plus a light amber fill), as strong as its hover state.',
  settings: {
    look: {
      type: 'choice',
      label: 'Look',
      default: 'ring',
      options: [
        ['ring', 'Full ring', 'Cue keeps its outline but at full amber all the time, as it is today only on hover.'],
        ['tint', 'Ring and fill', 'A light amber fill inside the ring, so Cue weighs nearly as much as Play.'],
      ],
    },
  },
};

/** Show me: deck A loaded and away from its cue point; flipping shows Cue's faint edge (before) and the strong ring (after), magnified. */
export const show = {
  about: 'Against the design doc\'s depth order, which keeps Cue an outline behind the solid Play. A judge found Cue at rest quieter than its own hover. Turn this on to judge a stronger Cue.',
  before: 'Cue rests as a thin, half-strength amber outline, as the design doc intends; it only lights up fully on hover.',
  after: 'Cue keeps its full amber ring all the time, so it carries the same weight beside Play. The cost: Play is no longer clearly the strongest control.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.seek(0, 0.2);
  },
  target: "[data-region='deck0'] .transport .cue",
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const c = app.$("[data-region='deck0'] .transport .cue")?.getBoundingClientRect();
    const p = app.playButton(0)?.getBoundingClientRect();
    if (!c || !p) return;
    const z = 2;
    const l = d.loupe('cue', { x: c.left - 8, y: c.top - 8 }, { zoom: z, size: { w: (p.right - c.left + 16) * z, h: (c.height + 16) * z }, near: c, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'the doc: Cue is a faint outline' : 'against the doc: a full ring', { tone: before ? undefined : 'ok', fixed: true });
  },
};
