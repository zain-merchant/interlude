// Prototype: the hero played from recorded clips (app/demo/segments).
//
// Each step of the script (sync, stems, play, ...) was recorded in both
// hands as its own clips, lined up so a step lasts as long in either and
// ends on the same app. So the two hands run in step on one timeline, and
// at any step's end the other hand's next clip can follow without a seam.
//
// Layers, bottom to top:
//   the app       a clip of the app alone, flat; in the controller hand the
//                 page tips it back with CSS (hero.css's transform), so a
//                 switch moves it at once, whatever is playing;
//   the desk      a clip of the controller alone, seen through its outline;
//   the links     the controller's lines to the app, drawn from the clip's
//                 timeline;
//   the cursor    Stageshow's own cursor, moved from the clip's timeline,
//                 so it can fade on its own.
// And the music's level, from the timeline, is sent to the page each frame.
//
// A switch of hands starts the page's move at once (the screen eases, the
// controller comes or goes, the cursor fades); the clips swap to the other
// hand's at the end of the step, if that clip has loaded, or else at the
// end of the next. Two video elements per layer cross over: the next clip
// starts a frame before the last one ends and shows once its first frame
// is up.
//
// ?steps=sync,play,crossfade picks and orders the clips (default: all, as
// recorded); ?codec=av1|hevc|h264 forces a codec; ?mode=controller starts
// in the other hand.
const q = new URLSearchParams(location.search);
const hero = document.getElementById('hero');
const appEls = [...document.querySelectorAll('.app-host video')];
const ctlEls = [...document.querySelectorAll('.desk video')];
const desk = document.querySelector('.desk');
const svg = document.querySelector('svg.links');
const cursorLayer = document.querySelector('.cursor-layer');
const stage = cursorLayer.querySelector('.ss-stage');
const post = (m) => window.parent?.postMessage(m, '*');

const M = await fetch('clips/manifest.json').then((r) => r.json());
const style = document.createElement('style');
style.textContent = M.css;
document.head.append(style);
const box = M.controllerBox;
Object.assign(desk.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });
document.documentElement.style.setProperty('--ctl-mask', 'url(clips/controller-mask.png)');

const STEPS = M.steps.map((s, i) => ({ ...s, i }));
let order = (q.get('steps') ?? '').split(',').map((n) => STEPS.findIndex((s) => s.name === n || String(s.i) === n)).filter((i) => i >= 0);
if (!order.length) order = STEPS.map((s) => s.i);

/** The codec this browser decodes in hardware, best first. */
async function pickCodec() {
  const forced = q.get('codec');
  if (forced && M.codecs.includes(forced)) return forced;
  const info = (c) => navigator.mediaCapabilities?.decodingInfo({
    type: 'file', video: { contentType: `video/mp4; codecs="${c}"`, width: 1440 * M.scale, height: 900 * M.scale, bitrate: 800000, framerate: M.fps },
  }).catch(() => null);
  if (M.codecs.includes('av1') && (await info('av01.0.13M.08'))?.powerEfficient) return 'av1';
  if (M.codecs.includes('hevc') && (await info('hvc1.1.6.L153.B0'))?.powerEfficient) return 'hevc';
  return 'h264';
}
const codec = await pickCodec();
document.documentElement.dataset.codec = codec;

// Loading: one file at a time, in the order asked for; each is held as a
// blob, so a clip that's in can start at once.
const files = new Map();
const queue = [];
let loading = false;
function want(url, first = false) {
  let f = files.get(url);
  if (!f) {
    let done;
    f = { url, ready: false, value: null, promise: new Promise((r) => (done = r)), done };
    files.set(url, f);
    queue.push(f);
  } else if (!f.ready && first && queue.includes(f)) {
    queue.splice(queue.indexOf(f), 1);
    queue.unshift(f);
    return f;
  } else return f;
  if (first) {
    queue.splice(queue.indexOf(f), 1);
    queue.unshift(f);
  }
  pump();
  return f;
}
async function pump() {
  if (loading) return;
  const f = queue.shift();
  if (!f) return;
  loading = true;
  try {
    const r = await fetch(f.url);
    f.value = f.url.endsWith('.json') ? await r.json() : URL.createObjectURL(await r.blob());
    f.ready = true;
    f.done(f.value);
  } catch (e) {
    console.error('segments: could not load', f.url, e);
  }
  loading = false;
  pump();
}
const base = (mode, i) => `clips/${mode}-${i}-${STEPS[i].name}`;
const clip = (mode, i, first) => ({
  tl: want(`${base(mode, i)}.json`, first),
  app: want(`${base(mode, i)}.app.${codec}.mp4`, first),
});
const ctlClip = (mode, i, first) => want(`${base(mode, i)}.ctl.${codec}.mp4`, first);
const isReady = (mode, i) => files.get(`${base(mode, i)}.json`)?.ready && files.get(`${base(mode, i)}.app.${codec}.mp4`)?.ready;

let hand = q.get('mode') === 'controller' ? 'controller' : 'mouse';
hero.dataset.hand = hand;
let paused = false;
let pos = 0; // where in `order`
let cur = null; // { mode, i, app, ctl, tl }

/** Puts a clip in the idle element of a pair and waits until it can play from its start. */
async function prime(els, src, name) {
  const el = els.find((e) => !e.classList.contains('front'));
  if (el.dataset.src !== src) {
    el.dataset.src = src;
    el.dataset.clip = name;
    el.src = src;
  }
  el.currentTime = 0;
  if (el.readyState < 3) await new Promise((r) => el.addEventListener('canplay', r, { once: true }));
  return el;
}

/** Shows `el` once it has a frame up, and puts the other of its pair away. */
function front(el, els) {
  const show = () => {
    el.classList.add('front');
    for (const o of els) if (o !== el) {
      o.classList.remove('front');
      o.pause();
    }
  };
  if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(show);
  else el.addEventListener('playing', show, { once: true });
}

const deskShown = () => hand === 'controller' || cur?.mode === 'controller';

async function start(mode, i) {
  const c = clip(mode, i, true);
  const [tl, appSrc] = await Promise.all([c.tl.promise, c.app.promise]);
  const app = await prime(appEls, appSrc, base(mode, i));
  let ctl = null;
  if (deskShown()) ctl = await prime(ctlEls, await ctlClip(mode, i, true).promise, base(mode, i));
  else for (const v of ctlEls) v.pause();
  const was = cur;
  cur = { mode, i, app, ctl, tl, last: -1 };
  if (paused) return;
  app.play().catch(() => {});
  ctl?.play().catch(() => {});
  front(app, appEls);
  if (ctl) front(ctl, ctlEls);
  // The cursor comes back with a clip of the hand that's on.
  cursorLayer.classList.toggle('away', mode !== hand);
  if (was?.mode !== mode) setCursorStyle(mode);
  watch(app);
  // And the next clip in, while this one plays.
  ahead();
}

/**
 * Loads what the next step will want; and, a few seconds after the first
 * clip has started, when the browser is idle, the rest: this hand's
 * controller clips (small, for a switch mid-step), then the other hand's.
 */
let idled = false;
function ahead() {
  const next = order[(pos + 1) % order.length];
  clip(hand, next);
  if (deskShown()) ctlClip(hand, next);
  if (idled) return;
  idled = true;
  // On a slow or metered connection, nothing ahead of need: the other
  // hand's clips load when it's asked for (the swap waits for them).
  const net = navigator.connection;
  if (net && (net.saveData || /(^|-)(2g|3g)$/.test(net.effectiveType ?? ''))) return;
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 0));
  setTimeout(() => idle(() => {
    for (const i of order) ctlClip(hand, i);
    const other = hand === 'mouse' ? 'controller' : 'mouse';
    for (const i of order) {
      clip(other, i);
      ctlClip(other, i);
    }
  }), 4000);
}

/** Each frame of the playing clip: the cursor, the links, the level; and the next clip at the end. */
function watch(el) {
  const frame = (now, meta) => {
    if (cur?.app !== el) return;
    const tl = cur.tl;
    const n = tl.level.length;
    const f = Math.min(n - 1, Math.round(meta.mediaTime * M.fps));
    if (f !== cur.last) {
      cur.last = f;
      draw(tl, f);
    }
    // The controller's clip keeps to the app's (one started mid-step, for a
    // switch of hands, starts a little behind).
    const ctl = cur.ctl;
    if (ctl && !ctl.seeking && now - (cur.nudged ?? 0) > 500 && Math.abs(ctl.currentTime - meta.mediaTime) > 0.1) {
      cur.nudged = now;
      ctl.currentTime = meta.mediaTime + 0.04;
    }
    // A frame before the end, the next clip starts, so it's up as this one ends.
    if (f >= n - 2 && !cur.next) {
      cur.next = true;
      advance();
      return;
    }
    el.requestVideoFrameCallback(frame);
  };
  el.requestVideoFrameCallback(frame);
}

function advance() {
  pos = (pos + 1) % order.length;
  const i = order[pos];
  // The other hand's clip if it's in; if not, this hand's, and try again next step.
  const mode = isReady(hand, i) ? hand : cur.mode;
  start(mode, i);
}

// The cursor: Stageshow's own markup, as recorded, moved and marked from the timeline.
let cursor = null;
let cursorState = ['', '', ''];
function setCursorStyle(mode) {
  const html = M.modes[mode]?.cursor && Object.values(M.modes[mode].cursor)[0];
  stage.innerHTML = html ?? '';
  cursor = stage.firstElementChild;
  cursorState = ['', '', ''];
  // The arrow's resting turn (hero.css: 11deg plus the lean).
  arrow = cursor?.querySelector('.ss-cursor__arrow') ?? null;
  arrowRest = arrow ? parseFloat(getComputedStyle(arrow).rotate) || 0 : 0;
}
let arrow = null;
let arrowRest = 0;
const NS = 'http://www.w3.org/2000/svg';
let paths = [];
function draw(tl, f) {
  const lvl = tl.level[f];
  if (lvl != null) post({ interlude: 'level', level: lvl });
  const c = tl.cursor[f];
  if (cursor && c) {
    // Where it is, and the arrow's turn set on the arrow itself (not as
    // --lean on the cursor, which would restyle all of it); each only when
    // it changes. (Tried as compositor animations over the whole clip: they
    // kept the page making frames at the screen's rate, which cost more.)
    const [t, lean, attrs] = c;
    if (t !== cursorState[0]) cursor.style.transform = t;
    if (lean !== cursorState[1] && arrow) arrow.style.rotate = `${(arrowRest + (parseFloat(lean) || 0)).toFixed(2)}deg`;
    if (attrs !== cursorState[2]) {
      for (const a of [...cursor.attributes]) if (a.name.startsWith('data-')) cursor.removeAttribute(a.name);
      for (const kv of attrs.split(' ').filter(Boolean)) {
        const at = kv.indexOf('=');
        cursor.setAttribute(kv.slice(0, at), kv.slice(at + 1));
      }
    }
    cursorState = c;
  }
  // The links show only while their hand is on.
  const links = cur.mode === hand ? tl.links[f] || [] : [];
  while (paths.length > links.length) paths.pop().remove();
  links.forEach(([cls, d, op, da, dof], k) => {
    let p = paths[k];
    if (!p) {
      p = paths[k] = document.createElementNS(NS, 'path');
      svg.append(p);
    }
    if (p.getAttribute('class') !== cls) p.setAttribute('class', cls);
    if (p.getAttribute('d') !== d) p.setAttribute('d', d);
    const s = p.style;
    if (s.opacity !== String(op)) s.opacity = op;
    if (s.strokeDasharray !== da) s.strokeDasharray = da;
    if (s.strokeDashoffset !== dof) s.strokeDashoffset = dof;
  });
}

function setHand(next) {
  if (next !== 'mouse' && next !== 'controller' || next === hand) return;
  hand = next;
  hero.dataset.hand = hand;
  // The cursor goes at once; the links with it.
  cursorLayer.classList.add('away');
  while (paths.length) paths.pop().remove();
  // A controller coming in shows this step's controller clip, in step.
  if (hand === 'controller' && cur && !cur.ctl) syncDesk();
  // And the other hand's next clip first in line.
  clip(hand, order[(pos + 1) % order.length], true);
  if (hand === 'controller') ctlClip(hand, order[(pos + 1) % order.length], true);
}
async function syncDesk() {
  const at = cur;
  const el = await prime(ctlEls, await ctlClip(at.mode, at.i, true).promise, base(at.mode, at.i));
  if (cur !== at) return;
  el.currentTime = at.app.currentTime + 0.05;
  at.ctl = el;
  if (!paused) el.play().catch(() => {});
  front(el, ctlEls);
}

function setPaused(p) {
  if (p === paused) return;
  paused = p;
  document.documentElement.toggleAttribute('data-paused', p);
  for (const v of [...appEls, ...ctlEls]) if (v.classList.contains('front')) p ? v.pause() : v.play().catch(() => {});
  if (!p && cur && !cur.app.classList.contains('front')) start(cur.mode, cur.i);
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (m?.interlude === 'mode') setHand(m.mode);
  if (m?.interlude === 'pause') setPaused(!!m.paused);
  if (m?.interlude === 'css') for (const [k, v] of Object.entries(m.vars || {})) document.documentElement.style.setProperty(k, v);
  // ('fps', 'input' and 'controller' are for the live app: the clips are
  // recorded at 30 a second, with the line and the current controller.)
});

// Off we go: the first clip, then the page is told.
setCursorStyle(hand);
await start(hand, order[0]);
const first = cur.app;
const ready = () => {
  document.documentElement.dataset.ready = '';
  post({ interlude: 'hero-ready' });
};
if (first.requestVideoFrameCallback) first.requestVideoFrameCallback(ready);
else ready();
// For measuring (?log): each presented frame of either app element, with its clip.
window.__frames = [];
if (q.has('log')) for (const el of appEls) {
  const log = (now, meta) => {
    window.__frames.push([Math.round(now * 10) / 10, el === appEls[0] ? 0 : 1, el.dataset.clip?.slice(6), Math.round(meta.mediaTime * 1000), meta.presentedFrames]);
    if (window.__frames.length > 4000) window.__frames.splice(0, 1000);
    el.requestVideoFrameCallback(log);
  };
  el.requestVideoFrameCallback?.(log);
}
