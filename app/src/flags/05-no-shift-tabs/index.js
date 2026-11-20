// #5: a deck's mode tab moved its label when its dot came on.
//
// When a loop, an effect or a muted stem is on, its tab (Loop, FX, Stems)
// shows a small dot after the label. The dot added 10px to the centred
// label, so the word slid 5px left as the loop started and back when it
// ended. The dot now hangs after the word without taking any room.
export default {
  id: 'no-shift-tabs',
  n: 5,
  title: 'Deck tabs keep still when their dot lights',
  group: 'Stability',
  notes: 'Loop / FX / Stems labels no longer slide 5px when a loop, effect or muted stem turns their dot on.',
};

/** The box of `word`'s own letters inside el (no spaces, no dot). */
function wordRect(el, word) {
  if (!el) return null;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode;
    const i = n.textContent.indexOf(word);
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + word.length);
    return r.getBoundingClientRect();
  }
  return null;
}

/** Show me: starts a loop on deck A, which lights the Loop tab's dot; flipping shows the word sliding (before) and holding (after). */
export const show = {
  about: 'When a loop or effect was running, its tab\'s little dot pushed the word "Loop" or "FX" sideways. Now the word stays put.',
  before: 'Start a loop: a dot lights up after "Loop" and drags the word to the left, and back again when the loop ends.',
  after: 'The dot hangs just after the word without pushing it, so the tab label never moves.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    const loopTab = () => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop'));
    if (loopTab().querySelector('i')) await app.key('KeyR', { target: document.body });
    await app.wait(150);
    ctx.tab = loopTab;
    ctx.word = () => wordRect(loopTab(), 'Loop');
    // Where the word sits with no loop, flag on and off.
    const was = app.isOn('no-shift-tabs');
    const at = (on) => (app.setFlag('no-shift-tabs', on), DOMRect.fromRect(ctx.word()));
    ctx.rest = { on: at(true), off: at(false) };
    app.setFlag('no-shift-tabs', was);
    await app.key('KeyR', { target: document.body });
    await app.until(() => loopTab().querySelector('i'), 1500, 'the loop dot');
  },
  async replay(app) {
    await app.key('KeyR', { target: document.body });
    await app.wait(500);
    await app.key('KeyR', { target: document.body });
  },
  target: (app) => app.$$("[data-region='deck0'] .modes button").find((b) => b.textContent.trim().startsWith('Loop')),
  badge: (app, ctx) => ctx.tab?.()?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const rest = ctx.phase === 'before' ? ctx.rest.off : ctx.rest.on;
    const word = ctx.word();
    const tab = ctx.tab()?.getBoundingClientRect();
    d.moved(rest, word, { what: '"Loop"', side: 'below', still: '"Loop" stays put' });
    // The tab four times bigger, with where the word should be dashed in it.
    if (tab && rest) {
      const z = 4;
      const src = { x: tab.x + tab.width / 2 - 45, y: tab.y + tab.height / 2 - 14 };
      const l = d.loupe('tab', src, { zoom: z, size: { w: 360, h: 112 }, near: new DOMRect(src.x, src.y, 90, 28), caption: 'Loop tab, 4×' });
      const a = l.map(rest.x, rest.y);
      d.clip(l.rect, () => d.box(new DOMRect(a.x, a.y, rest.width * z, rest.height * z), { c: d.C.ghost, dash: '6 4', w: 1.5 }));
    }
  },
};
