// Pausing the hero while nobody can see it. The page tells this frame when
// its screen leaves or comes back into view ({ interlude: 'pause', paused }).
// While paused, nothing here draws: every requestAnimationFrame callback
// (the app's waveforms and meters, the controller, the cursor, the level
// report, Stageshow's own clock) is held instead of run, and CSS animations
// stand still. On resume the held callbacks all run on the next frame, so
// every loop carries on from where it stopped.
//
// Imported first by hero.jsx, before anything else asks for a frame.
const raf = window.requestAnimationFrame.bind(window);
const caf = window.cancelAnimationFrame.bind(window);
let paused = false;
const held = new Map();
let next = 1e9; // ids of held callbacks, well clear of the browser's own

// And a frame rate cap while it plays ({ interlude: 'fps', fps }): at 30,
// every callback asked for waits for every other frame, so the app draws
// half as often. All of them run together on the frame they get, so
// everything stays in step.
let every = 1000 / 60;
// (Which frames: the first of each slot of `every` ms on the wall clock,
// not every other frame from whenever it began, so the website's record,
// capped the same way (site/hero-fx.js), draws on the very same frames
// and the frames between are left with nothing to do.)
let lastSlot = -1;
const waiting = new Map();
let pumping = false;
function pump(t) {
  const slot = Math.floor((performance.timeOrigin + t) / every);
  if (slot === lastSlot) {
    raf(pump);
    return;
  }
  lastSlot = slot;
  pumping = false;
  const run = [...waiting.values()];
  waiting.clear();
  run.forEach((cb) => cb(t));
}
window.requestAnimationFrame = (cb) => {
  if (paused) {
    held.set(++next, cb);
    return next;
  }
  if (every <= 1000 / 60 + 1) return raf(cb);
  waiting.set(++next, cb);
  if (!pumping) {
    pumping = true;
    raf(pump);
  }
  return next;
};
window.cancelAnimationFrame = (id) => {
  if (!held.delete(id) && !waiting.delete(id)) caf(id);
};

export const isPaused = () => paused;

// Every frame, cap or no cap (still held while paused): for what has to keep
// up with something the browser moves itself, like a line pinned to a
// control that's sliding on a CSS transition. At 30 it would trail behind.
export const everyFrame = (cb) => {
  if (paused) {
    held.set(++next, cb);
    return next;
  }
  return raf(cb);
};

function setPaused(p) {
  if (p === paused) return;
  paused = p;
  document.documentElement.toggleAttribute('data-paused', p);
  if (p) return;
  const run = [...held.values()];
  held.clear();
  raf((t) => run.forEach((cb) => cb(t)));
}

window.addEventListener('message', (e) => {
  if (e.data?.interlude === 'pause') setPaused(!!e.data.paused);
  if (e.data?.interlude === 'fps') every = 1000 / Math.max(10, Math.min(60, +e.data.fps || 60));
});
