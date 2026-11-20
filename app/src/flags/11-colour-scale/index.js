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

/** Show me: deck A's nudge arrows beside the other arrow buttons, each pair tagged with its text level. */
export const show = {
  note: "Deck A's nudge ‹ › now share the other arrows' text level (each pair is tagged); off, nudge is a step dimmer.",
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
  target: (app) => [app.$("[data-region='deck0'] .pitch .nudge"), app.$("[data-region='deck0'] .perf"), app.$("[data-region='deck0'] .transport .jumps")],
  aid(d, app, ctx) {
    const level = (el) => {
      const c = getComputedStyle(el).color;
      return ctx.levels.find(([, v]) => v === c)?.[0] ?? 'other';
    };
    const D = "[data-region='deck0']";
    const pairs = [
      [app.$$(`${D} .pitch .nudge button`), 'nudge'],
      [app.$$(`${D} .perf .tb.ar`), 'loop'],
      [app.$$(`${D} .transport .jumps button`), 'jump'],
    ];
    const ref = level(pairs[1][0][0] ?? document.body);
    for (const [els, name] of pairs) {
      if (!els.length) continue;
      const rs = els.map((e) => e.getBoundingClientRect());
      const l = level(els[0]);
      const x = (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2;
      d.text(x, Math.max(...rs.map((r) => r.bottom)) + 14, `${name}: ${l}`, { anchor: 'middle', tone: l === ref ? 'ok' : 'bad' });
    }
  },
};
