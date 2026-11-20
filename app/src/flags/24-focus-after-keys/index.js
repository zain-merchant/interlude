// #24 (C15; critique F1 and S2): focus rings only after you use the keys.
//
// Click a deck tab or a dial, press W to play, and a 2px ring appeared on
// the tab and stayed there. Browsers show the focus ring whenever any key
// is pressed while something has focus, so every shortcut lit whatever
// you'd last clicked; in Settings the page you'd opened kept a ring while
// you read another. Now the app tracks how you're moving around: Tab, the
// arrows, Home/End, Page Up/Down and F6 (which move focus) turn rings on;
// any click or tap turns them off again (App.svelte: html[data-input]).
// Shortcuts don't count. Text fields keep their ring when clicked, since
// it marks where typing goes.
//
// The ring stays the doc's grey (--fg-2), 2px with a 2px gap (the review
// dropped the full-white and on-the-edge variants); deck tabs take it
// inside, where the outside ring ran into the selected underline. The
// selected track row's ring (drawn by #14 on a child of the focused list)
// follows the same keys-only rule.
// The radii that make every ring round, and the crossfader, fader and knob
// rings, are #14's (states).
export default {
  id: 'focus-after-keys',
  n: 24,
  title: 'Focus rings only after you use the keys',
  group: 'Controls',
  notes:
    'Rings show only after Tab, arrows, Home/End, Page keys or F6, and go away on any click (App.svelte sets html[data-input="keys"]). Text fields keep their ring. The ring is the doc\'s grey; deck tabs ring inside.',
};

/** Show me: click deck A's Loop tab, then press the play key; the tab is focused but nothing was navigated by key. Flipping shows the ring stuck on it (before) and gone (after). */
export const show = {
  about: 'Click a tab or a dial and then press a shortcut like W, and a focus ring stuck to the thing you clicked. Now rings only show while you move around with Tab or the arrow keys, and a click puts them away.',
  before: "Click the Loop tab, then press a shortcut: a white ring appears round the tab and stays there, as if you'd selected it by keyboard. It's the loudest shape on the deck.",
  after: 'The same click and shortcut leave no ring. Press Tab or an arrow key and the ring comes back, so keyboard users still see where they are.',
  period: 1800,
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    ctx.tab = await app.tab(0, 'Loop');
    // A click (which clears keyboard mode), then what the browser makes of a
    // shortcut key pressed while the tab has focus: it counts as focus-visible.
    ctx.unforce = app.forceStates();
    ctx.tab.setAttribute('data-show-focus', '');
  },
  async each(app, ctx) {
    delete document.documentElement.dataset.input;
    ctx.tab.setAttribute('data-show-focus', '');
  },
  cleanup(app, ctx) {
    ctx.unforce?.();
    app.tab(0, 'Cues').catch(() => {});
  },
  target: (app, ctx) => [ctx.tab],
  aid(d, app, ctx) {
    const r = ctx.tab?.getBoundingClientRect();
    if (!r) return;
    const before = ctx.phase === 'before';
    const l = d.loupe('tab', { x: r.x - 12, y: r.y - 10 }, { zoom: 3, size: { w: (r.width + 24) * 3, h: (r.height + 20) * 3 }, near: r, caption: '' });
    d.text(l.at.x + l.rect.width / 2, l.at.y + l.rect.height + 14, before ? 'clicked, then a shortcut: the ring sticks' : 'clicked, then a shortcut: no ring', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
