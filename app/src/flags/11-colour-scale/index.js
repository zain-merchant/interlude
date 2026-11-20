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
  title: 'Arrows and notes at the right brightness',
  group: 'Type and colour',
  notes: 'Analysis note off the disabled level; nudge arrows match the other arrow buttons; optionally deck tabs match the other navigation.',
  settings: {
    tabs: { type: 'choice', options: [['fg-3', 'Tabs as now', 'Inactive deck tabs stay at the quietest level, so the active tab stands out most.'], ['fg-2', 'Tabs like nav', 'Inactive deck tabs at the same level as the library sidebar and Settings pages: one rule for all navigation.']], default: 'fg-3', label: 'Inactive deck tabs' },
  },
};

/** Show me: deck A's pitch-nudge ‹ › and its beat-jump ‹ ›, side by side in two loupes, flipping; the library's analysis note too while it's there. */
export const show = {
  about: "The ‹ › under the pitch fader were dimmer than every other ‹ ›, so they looked switched off; the library's 'analyzing' note used the faint grey of disabled things. Now each uses the brightness of its kind.",
  before: 'The pitch nudge ‹ › are a step dimmer than the beat-jump ‹ › next to them, so they look disabled even though they work, and live notes like "analyzing, 12 to go" are hard to read.',
  after: "All the ‹ › arrow buttons share one brightness, so working buttons look working, and live information is as readable as the text beside it.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
  },
  target: (app) => [app.$("[data-region='deck0'] .pitch .nudge"), app.$("[data-region='deck0'] .transport .jumps")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const nudge = app.$("[data-region='deck0'] .pitch .nudge")?.getBoundingClientRect();
    const jumps = app.$("[data-region='deck0'] .transport .jumps")?.getBoundingClientRect();
    if (!nudge || !jumps) return;
    // The same size and zoom for both, side by side, so their brightness compares directly.
    const zoom = 5;
    const vw = 44;
    const vh = Math.max(nudge.height, 24) + 8;
    const size = { w: vw * zoom, h: vh * zoom };
    const y = 230;
    const a = d.loupe('nudge', { x: nudge.x + nudge.width / 2 - vw / 2, y: nudge.y + nudge.height / 2 - vh / 2 }, { zoom, size, at: { x: 640, y }, caption: '' });
    const b = d.loupe('jump', { x: jumps.x + 2, y: jumps.y + jumps.height / 2 - vh / 2 }, { zoom, size, at: { x: 640 + size.w + 16, y }, caption: '' });
    ctx.at = a.rect;
    d.text(a.rect.x, a.rect.bottom + 14, 'pitch nudge ‹ ›', { fixed: true });
    d.text(b.rect.x, b.rect.bottom + 14, 'beat jump ‹', { fixed: true });
    d.text(a.rect.x, a.rect.bottom + 40, before ? 'nudge is dimmer: it looks switched off' : 'the same brightness: both look ready to press', { tone: before ? 'bad' : 'ok', fixed: true });
    // The analysis note, while the library is still being analysed.
    const p = app.$('section.library .bar .count .pending');
    const pr = p?.getBoundingClientRect();
    if (pr) {
      const l = d.loupe('note', { x: pr.x - 6, y: pr.y - 4 }, { zoom: 3, size: { w: Math.round((pr.width + 12) * 3), h: Math.round((pr.height + 8) * 3) }, at: { x: pr.x, y: pr.bottom + 50 }, caption: '' });
      d.text(l.rect.x, l.rect.bottom + 14, before ? 'faint, like a disabled item' : 'as readable as the count beside it', { tone: before ? 'bad' : 'ok', fixed: true });
    }
  },
};
