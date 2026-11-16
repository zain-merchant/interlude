// #11 (colours): text levels by role.
//
// Every text colour in the app is already one of the tokens (--fg, --fg-2,
// --fg-3, --fg-4, plus --cue, --kill, --go and --warn for meaning), so
// there's nothing to collapse. What drifted is which level a role gets:
// - The library's "analyzing, 12 to go" is live information but uses
//   --fg-4, the level kept for empty and disabled items, which fails
//   contrast. It goes to --fg-3, like the track count beside it.
// - The nudge ‹ › under the pitch fader are --fg-3 while every other ‹ ›
//   glyph button (beat jump, loop, FX beats) is --fg-2. They match now.
// - Optionally, the deck's inactive mode tabs (--fg-3) can match the other
//   inactive navigation, the library sidebar and Settings (--fg-2).
export default {
  id: 'colour-scale',
  n: 11,
  title: 'Text levels by role',
  group: 'Type and colour',
  notes: 'Analysis note off the disabled level; nudge arrows match the other arrow buttons; optionally deck tabs match the other navigation.',
  settings: {
    tabs: { type: 'choice', options: [['fg-3', 'Tabs as now'], ['fg-2', 'Tabs like nav']], default: 'fg-3', label: 'Inactive deck tabs' },
  },
};

/** Show me: labels the text of the controls this touches with the colour level each is drawn at. */
export const show = {
  note: "Text labelled with its colour level: compare deck A's nudge ‹ › with the loop and jump ‹ ›. Off, nudge is fg-3; on, fg-2 like the others.",
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Loop');
    // The tokens' computed colours, from a probe in the app's own scope.
    const probe = document.createElement('span');
    app.$('.app').append(probe);
    ctx.levels = ['fg', 'fg-2', 'fg-3', 'fg-4'].map((t) => {
      probe.style.color = `var(--${t})`;
      return [t, getComputedStyle(probe).color];
    });
    probe.remove();
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch .nudge"), app.$("[data-region='deck0'] .modes"), app.$('section.library .bar .count')],
  aid(d, app, ctx) {
    const level = (el) => {
      const c = getComputedStyle(el).color;
      return ctx.levels.find(([, v]) => v === c)?.[0] ?? c.replace(/\s/g, '');
    };
    const D = "[data-region='deck0']";
    const els = [
      ...app.$$(`${D} .pitch .nudge button`),
      ...app.$$(`${D} .perf .tb.ar`),
      ...app.$$(`${D} .transport .jumps button`),
      ...app.$$(`${D} .modes button`),
      app.$('section.library .bar .count'),
      app.$('section.library .bar .count .pending'),
    ].filter(Boolean);
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      d.text(r.x + r.width / 2, i % 2 ? r.bottom + 9 : r.y - 9, level(el), { anchor: 'middle' });
    });
    d.legend(['text levels', ...ctx.levels.map(([t, c]) => `${t.padEnd(5)} ${c}`)], { x: 16, y: 14 });
  },
};
