// #63 (mixer): dials and faders answer the pointer (M3).
//
// Hovering a fader lightened its cap by a hair, hovering a dial changed
// nothing, and dragging looked the same as hovering. With the flag on
// (CSS only): a hovered dial lays 5% white (--hover) over its cap and lifts
// its idle ticks to --fg-3; a dial being turned also gets a thin --fg-3
// ring on the cap. A hovered fader cap gets the same 5% layer (its centre
// line is already full white, #f4f3ee, brighter than --fg, so it stays),
// and a dragged one adds the ring. 140ms ease.
export default {
  id: 'control-feedback',
  n: 63,
  title: 'Dials and faders light up under the pointer',
  group: 'Controls',
  notes: 'CSS only. Hover = inset 99px --hover layer (box-shadow, so it eases) + idle ticks --fg-3. Dial hover follows #62: on the cap without it, the whole ring with it. .dragging (Knob.svelte, Fader.svelte) adds an inset --fg-3 ring.',
};

/** Show me: channel A's High dial hovered and its Mid being turned, channel A's fader hovered and B's dragged; a loupe, flipping. */
export const show = {
  about: "Pointing at a dial changed nothing and pointing at a fader barely did, and grabbing one looked the same as pointing at it. Now a dial brightens when you point at it, and a dial or fader you're moving shows a thin ring.",
  before: "Channel A's High dial and fader are under the pointer, and its Mid dial and channel B's fader are being moved, but you can hardly tell any of them apart from the rest.",
  after: 'The dial and fader under the pointer brighten a step, and the ones being moved also carry a thin ring on their cap, so you can see what your hand is on.',
  setup(app, ctx) {
    ctx.undo = app.forceStates();
    const [a, b] = app.$$('.mixer .fwrap');
    const knobs = app.$$('.mixer .ch')[0]?.querySelectorAll('.knob') ?? [];
    knobs[1]?.querySelector('.wrap')?.setAttribute('data-show-hover', '');
    knobs[1]?.querySelector('.dial')?.setAttribute('data-show-hover', '');
    ctx.drag = [knobs[2]?.querySelector('.dial'), b?.querySelector('.fader')].filter(Boolean);
    for (const e of ctx.drag) e.classList.add('dragging');
    a?.querySelector('.fader')?.setAttribute('data-show-hover', '');
  },
  cleanup(app, ctx) {
    for (const e of ctx.drag ?? []) e.classList.remove('dragging');
    ctx.undo?.();
  },
  target: (app) => [app.$$('.mixer .ch')[0], app.$('.mixer .fwrap')],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const ch = app.$$('.mixer .ch')[0]?.getBoundingClientRect();
    const fb = app.$('.mixer .fwrap.mirror')?.getBoundingClientRect();
    if (!ch || !fb) return;
    const zoom = 2;
    const src = { x: ch.left - 6, y: ch.top - 4 };
    const size = { w: (fb.right + 6 - src.x) * zoom, h: Math.min(ch.height * 0.62, (innerHeight - 140) / zoom) * zoom };
    const l = d.loupe('fb', src, { zoom, size, near: app.$('.mixer').getBoundingClientRect(), caption: '' });
    ctx.at = l.rect;
    const after = ctx.phase === 'after';
    d.text(l.rect.x, l.rect.bottom + 16, after ? 'pointed at: brighter; being moved: a thin ring on the cap' : 'pointed at, moved or left alone: they all look the same', { tone: after ? 'ok' : 'bad', fixed: true });
  },
};
