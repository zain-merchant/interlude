// #61 (mixer): the EQ kills look like buttons (M2, C14 option a).
//
// Clicking High, Mid or Low under a channel's EQ dial kills that band, but
// the label was a plain 11px caption, identical to "Trim" and "Filter", so
// nothing said you could click it; its tooltip then covered the knob. With
// the flag on the three kill labels rest as small outlined buttons (20px,
// 4px radius, a --line-2 ring, one width, 4px clear of the dial's ticks),
// a killed band fills with a red tint, and
// the tooltip opens under the label (Knob.svelte sets data-tip-below; it
// needs layout's one-line `place()` change in tooltip.svelte.js).
export default {
  id: 'eq-kill',
  n: 61,
  title: 'EQ kills look like buttons',
  group: 'Controls',
  notes: 'Knob.svelte: data-tip-below on the kill label while on. style.css: 20px outlined label button, 36px min width (High\'s own width), 4px clear of the ticks, red tint when killed; Trim/Filter captions drop to match. Mixer.svelte: dial size gives up 7.4px per dial on short mixers.',
};

/** Show me: channel A's Mid killed, a loupe on channel A's EQ column, flipping. */
export const show = {
  about: 'The High, Mid and Low words under the EQ dials are kill switches, but they looked exactly like the "Trim" and "Filter" captions. Now they look like small buttons, and a killed band lights red.',
  before: 'Channel A\'s Mid band is killed, but High, Mid and Low are plain captions like "Trim": nothing tells you they can be clicked, and the killed one is only a red word.',
  after: 'Each kill is a small outlined button, so you know you can press it, and the killed band is a red-tinted button that stands out mid-mix.',
  async setup(app, ctx) {
    const mid = app.$$('.mixer .ch')[0]?.querySelectorAll('.knob button.label')[1];
    if (mid && mid.getAttribute('aria-pressed') !== 'true') {
      await app.click(mid);
      ctx.killed = mid;
    }
    app.hideTips();
  },
  async cleanup(app, ctx) {
    if (ctx.killed?.getAttribute('aria-pressed') === 'true') await app.click(ctx.killed);
  },
  target: (app) => [...(app.$$('.mixer .ch')[0]?.querySelectorAll('.knob button.label') ?? [])],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const ch = app.$$('.mixer .ch')[0]?.getBoundingClientRect();
    if (!ch) return;
    const zoom = 3;
    const src = { x: ch.left - 8, y: ch.top + ch.height * 0.2 };
    const size = { w: (ch.width + 16) * zoom, h: ch.height * 0.62 * zoom };
    const l = d.loupe('eq', src, { zoom, size, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'High, Mid and Low are buttons; the killed Mid is lit red' : 'High, Mid and Low look like captions; only the word goes red', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
