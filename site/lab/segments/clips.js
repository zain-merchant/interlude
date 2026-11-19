// The hero as recorded clips (app/demo/segments), played in the page itself:
// no frame, no messages, and no work on most frames.
//
// Each step of the script (sync, stems, play, ...) was recorded in both
// hands, lined up so a step lasts as long in either and ends on the same
// app. So the hands run in step on one timeline, and at any step's end the
// other hand's next clip follows without a seam.
//
// Layers, bottom to top:
//   the app       a clip of the app, flat (in the controller hand the page
//                 tips it back with hero.css's own transform, so a switch
//                 moves it at once). In the mouse hand the arrow is in the
//                 clip; its twin, the same clip without it, is crossed to
//                 the moment the hand is switched, so the arrow goes at once.
//   the desk      a clip of the controller (and the controller hand's
//                 fingertip), seen through its outline, so it can come and
//                 go at once whatever is playing.
//   the links     the controller's lines to the app, drawn from the clip's
//                 timeline, only while there are any.
//
// The page is told the music's level from the clip's timeline a dozen times
// a second (onLevels), with every level since the last time, for the glow
// and the record.
//
// Nothing runs on every frame: a timer looks after the levels and keeps the
// controller's clip in step; frame callbacks run only for the last frames
// of a clip (the next one starts a frame before it ends and shows once its
// first frame is up) and while a link is drawn.
//
//   const clips = await mountClips(host, { base, hand, order, codec,
//     onReady, onLevels });
//   clips.setHand('controller'); clips.setPaused(true); clips.setVars({...});
//   clips.prepare(true)   the hand is about to switch (pointer on the
//                         toggle): the twin starts, in step, under the clip.
const TICK = 1000 / 12;

/** The base styles, scoped to the player's root. */
const BASE_CSS = `
.hero-clips { position: relative; width: 1440px; height: 920px; overflow: hidden; --tilt: -3deg; --anchor: 50% 0%; }
.hero-clips .app-host { height: 900px; }
.hero-clips video { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
.hero-clips video.front { z-index: 1; }
.hero-clips video.going { z-index: 2; opacity: 0; transition: opacity 180ms cubic-bezier(0.4, 0, 1, 1); }
/* The controller, in its box, through its outline at rest. It comes and
   goes as controller.css has it: from a little above, out of a blur, a beat
   behind the screen (--hw-delay); this is that move flattened. */
.hero-clips .desk {
  position: absolute; pointer-events: none; z-index: 2;
  mask: var(--ctl-mask) 0 0 / 100% 100% no-repeat luminance;
  opacity: 0; transform: translateY(calc(var(--hw-from, -40px) * 0.4)) scale(0.985); filter: blur(var(--hw-blur, 10px));
  transition: transform var(--smooth-ms) var(--smooth), opacity 240ms cubic-bezier(0.4, 0, 1, 1), filter 240ms cubic-bezier(0.4, 0, 1, 1);
}
.hero-clips[data-hand="controller"] .desk {
  opacity: 1; transform: none; filter: none;
  transition: transform var(--smooth-ms) var(--smooth) var(--hw-delay, 110ms), opacity 280ms cubic-bezier(0.2, 0, 0, 1) var(--hw-delay, 110ms), filter 340ms cubic-bezier(0.2, 0, 0, 1) var(--hw-delay, 110ms);
}
.hero-clips svg.links path { transition: none !important; }
`;

/** The recorded rules, written for the demo's #hero, scoped to `scope`. */
function scoped(css, scope) {
  return css.replace(/(^|\n)([^{}\n]+)\{/g, (m, nl, sel) => {
    const list = sel.split(',').map((s) => {
      s = s.trim();
      if (s.startsWith('#hero')) return scope + s.slice(5);
      if (s === ':root') return scope;
      return `${scope} ${s}`;
    });
    return `${nl}${list.join(', ')} {`;
  });
}

export async function mountClips(host, opts = {}) {
  const base = opts.base ?? 'clips/';
  const M = await fetch(`${base}manifest.json`).then((r) => r.json());
  const root = document.createElement('div');
  root.className = 'hero-clips';
  root.innerHTML = `<div class="app-host"><video muted playsinline></video><video muted playsinline></video><video muted playsinline></video></div>
    <div class="desk"><video muted playsinline></video><video muted playsinline></video></div>
    <svg class="links" width="1440" height="920"></svg>`;
  host.append(root);
  if (!document.getElementById('hero-clips-css')) {
    const style = document.createElement('style');
    style.id = 'hero-clips-css';
    style.textContent = BASE_CSS + scoped(M.css, '.hero-clips');
    document.head.append(style);
  }
  const appEls = [...root.querySelectorAll('.app-host video')];
  const ctlEls = [...root.querySelectorAll('.desk video')];
  const desk = root.querySelector('.desk');
  const svg = root.querySelector('svg.links');
  const box = M.controllerBox;
  Object.assign(desk.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });
  root.style.setProperty('--ctl-mask', `url(${new URL(`${base}controller-mask.png`, location.href)})`);
  for (const v of [...appEls, ...ctlEls]) Object.assign(v, { muted: true, playsInline: true, disablePictureInPicture: true });

  const STEPS = M.steps.map((s, i) => ({ ...s, i }));
  let order = (opts.order ?? []).map((n) => STEPS.findIndex((s) => s.name === n || String(s.i) === String(n))).filter((i) => i >= 0);
  if (!order.length) order = STEPS.map((s) => s.i);

  // The codec this browser decodes in hardware, best first.
  async function pickCodec() {
    if (opts.codec && M.codecs.includes(opts.codec)) return opts.codec;
    const info = (c) => navigator.mediaCapabilities?.decodingInfo({
      type: 'file', video: { contentType: `video/mp4; codecs="${c}"`, width: 1440 * M.scale, height: 900 * M.scale, bitrate: 800000, framerate: M.fps },
    }).catch(() => null);
    if (M.codecs.includes('av1') && (await info('av01.0.13M.08'))?.powerEfficient) return 'av1';
    if (M.codecs.includes('hevc') && (await info('hvc1.1.6.L153.B0'))?.powerEfficient) return 'hevc';
    return 'h264';
  }
  const codec = await pickCodec();
  // Where the screen shows the app at no more than about 1440 device pixels
  // across (a phone, a small window), the 1x set (manifest.small): a third to
  // a quarter of the bytes for the same picture there. On a slow or metered
  // connection, the twin comes at 1x too (it only shows for the rest of a
  // step, while the screen eases back).
  const net = navigator.connection;
  const slow = !!net && (net.saveData || /(^|-)(2g|3g)$/.test(net.effectiveType ?? ''));
  const small = !!M.small && host.getBoundingClientRect().width * devicePixelRatio <= 1600 ? M.small : '';
  root.dataset.codec = codec + small;

  // Loading: one file at a time, in the order asked for, each held as a
  // blob so a clip that's in can start at once.
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
    }
    if (!f.ready && first && queue.includes(f)) {
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
      console.error('clips: could not load', f.url, e);
    }
    loading = false;
    pump();
  }
  const name = (mode, i) => `${base}${mode}-${i}-${STEPS[i].name}`;
  const layer = (mode, which) => M.modes[mode]?.[which] ?? (which === 'play' ? 'app' : null);
  const appUrl = (mode, i, which = 'play') => `${name(mode, i)}.${layer(mode, which)}${which === 'twin' && slow && M.small ? M.small : small}.${codec}.mp4`;
  const clip = (mode, i, first) => ({ tl: want(`${name(mode, i)}.json`, first), app: want(appUrl(mode, i), first) });
  const ctlClip = (mode, i, first) => want(`${name(mode, i)}.ctl${small}.${codec}.mp4`, first);
  const twinClip = (i, first) => (layer('mouse', 'twin') ? want(appUrl('mouse', i, 'twin'), first) : null);
  const isReady = (mode, i) => files.get(`${name(mode, i)}.json`)?.ready && files.get(appUrl(mode, i))?.ready;

  let hand = opts.hand === 'controller' ? 'controller' : 'mouse';
  root.dataset.hand = hand;
  let paused = false;
  let pos = 0;
  let cur = null; // { mode, i, app, ctl, tl, started, twin }
  let prepared = false;
  let tick = 0;

  /** Puts a clip in an idle element of a pair and waits until it can play from `at`. */
  async function prime(els, src, label, at = 0) {
    const busy = new Set([cur?.app, cur?.ctl, cur?.twin].filter(Boolean));
    const el = els.find((e) => !e.classList.contains('front') && !busy.has(e)) ?? els.find((e) => !busy.has(e));
    if (el.dataset.src !== src) {
      el.dataset.src = src;
      el.dataset.clip = label;
      el.src = src;
    }
    el.classList.remove('going');
    if (Math.abs(el.currentTime - at) > 0.001) el.currentTime = at;
    if (el.readyState < 3 || el.seeking) await new Promise((r) => {
      const ok = () => (el.readyState >= 3 && !el.seeking ? r() : null);
      el.addEventListener('canplay', ok);
      el.addEventListener('seeked', ok);
      ok();
    });
    return el;
  }
  /** Shows `el` once it has a frame up, and puts the rest of its pair away. */
  function front(el, els, fade = false) {
    const show = () => {
      el.classList.add('front');
      for (const o of els) if (o !== el && o.classList.contains('front')) {
        if (fade) {
          o.classList.add('going');
          setTimeout(() => {
            o.classList.remove('front', 'going');
            if (o !== cur?.app && o !== cur?.ctl) o.pause();
          }, 200);
        } else {
          o.classList.remove('front');
          o.pause();
        }
      }
    };
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(show);
    else el.addEventListener('playing', show, { once: true });
  }
  const deskShown = () => hand === 'controller' || cur?.mode === 'controller';

  async function start(mode, i) {
    const c = clip(mode, i, true);
    const twinReady = !!layer('mouse', 'twin') && files.get(appUrl('mouse', i, 'twin'))?.ready;
    // A mouse clip while the controller is up (its own clip wasn't in time):
    // the one without the arrow.
    const bare = mode === 'mouse' && hand !== 'mouse' && twinReady;
    // Back to the mouse from the controller: the arrow fades in over its
    // clip, from the twin without it, rather than popping up.
    const fadeIn = mode === 'mouse' && hand === 'mouse' && cur?.mode === 'controller' && twinReady;
    const [tl, appSrc] = await Promise.all([c.tl.promise, bare ? twinClip(i).promise : c.app.promise]);
    const app = await prime(appEls, appSrc, `${mode}-${i}${bare ? '-twin' : ''}`);
    let under = null;
    if (fadeIn) {
      cur = { ...cur, twin: app };
      under = await prime(appEls, await twinClip(i).promise, `mouse-${i}-twin`);
    }
    let ctl = null;
    if (deskShown()) ctl = await prime(ctlEls, await ctlClip(mode, i, true).promise, `${mode}-${i}`);
    else for (const v of ctlEls) v.pause();
    const was = cur;
    cur = { mode, i, app, ctl, tl, last: -1, under };
    // (The last clip's twin, if one ran, isn't needed now.)
    if (was?.twin && was.twin !== app) was.twin.pause();
    if (!paused) begin();
  }
  /** Plays the clip that's in place. */
  function begin() {
    const { app, ctl, mode, under } = cur;
    cur.started = true;
    app.play().catch(() => {});
    ctl?.play().catch(() => {});
    if (under) {
      // The twin in front first, the clip with the arrow fading in over it.
      under.play().catch(() => {});
      front(under, appEls);
      app.style.opacity = '0';
      app.style.zIndex = '2';
      app.requestVideoFrameCallback?.(() => {
        app.style.transition = 'opacity 180ms cubic-bezier(0.2, 0, 0, 1)';
        app.style.opacity = '1';
        setTimeout(() => {
          app.style.transition = app.style.opacity = app.style.zIndex = '';
          front(app, appEls);
          cur.under = null;
        }, 220);
      });
    } else front(app, appEls);
    if (ctl) front(ctl, ctlEls);
    clearLinks();
    toEnd();
    // Still in the other hand (its clip wasn't in): the hand's next one, and
    // the twin for the step after, before anything else.
    if (mode !== hand) {
      const n = order[(pos + 1) % order.length];
      if (hand === 'controller') twinClip(n, true);
      if (hand === 'controller') ctlClip(hand, n, true);
      clip(hand, n, true);
    }
    ahead();
    if (prepared && mode === 'mouse' && hand === 'mouse') rollTwin();
  }

  /** Near the end of the clip, frame callbacks to start the next on time. */
  let endTimer = 0;
  function toEnd() {
    clearTimeout(endTimer);
    const at = cur;
    const n = at.tl.level.length;
    const left = ((n - 2) / M.fps - at.app.currentTime) * 1000 - 120;
    endTimer = setTimeout(() => {
      if (cur !== at || paused) return;
      const frame = (now, meta) => {
        if (cur !== at || paused) return;
        if (Math.round(meta.mediaTime * M.fps) >= n - 2) return advance(at);
        cur.app.requestVideoFrameCallback(frame);
      };
      cur.app.requestVideoFrameCallback(frame);
    }, Math.max(0, left));
  }
  function advance(at) {
    // (Once per clip, however many loops reached its end.)
    if (at.advanced) return;
    at.advanced = true;
    pos = (pos + 1) % order.length;
    const i = order[pos];
    // The other hand's clip if it's in; if not, this hand's, and try again next step.
    start(isReady(hand, i) ? hand : cur.mode, i);
  }

  /** Loads what the next step will want; and when idle, on a fast connection, the rest. */
  let idled = false;
  function ahead() {
    const next = order[(pos + 1) % order.length];
    clip(hand, next);
    if (deskShown()) ctlClip(hand, next);
    // On a slow connection, once this hand's clips are all in, the twin for
    // the step after this one, so a tap on the switch takes the arrow away
    // at once there too.
    if (slow && hand === 'mouse' && order.every((i) => isReady('mouse', i))) twinClip(next);
    // (And on a slow connection the next step's controller clip, small, so a
    // switch raises the controller with its picture at once.)
    if (slow) ctlClip(hand, next);
    if (idled) return;
    idled = true;
    const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 0));
    if (slow) {
      // On a slow or metered connection only this hand's controller clips
      // (small), so a switch raises the controller with its picture at once.
      setTimeout(() => idle(() => ctlClip(hand, order[pos])), 4000);
      return;
    }
    setTimeout(() => idle(() => {
      for (const i of order) ctlClip(hand, i);
      const other = hand === 'mouse' ? 'controller' : 'mouse';
      for (const i of order) {
        clip(other, i);
        ctlClip(other, i);
      }
    }), 4000);
  }

  // The twin: the mouse clip without its arrow, run in step under it while
  // a switch may come, and crossed to when it does.
  async function rollTwin(first = true) {
    const at = cur;
    if (!at || at.mode !== 'mouse' || at.twin || !twinClip(at.i)) return;
    const src = await twinClip(at.i, first).promise;
    if (cur !== at) return;
    const el = await prime(appEls, src, `mouse-${at.i}-twin`, at.app.currentTime + 0.1);
    if (cur !== at) return;
    at.twin = el;
    if (!paused) el.play().catch(() => {});
  }
  async function crossToTwin() {
    const at = cur;
    if (!at || at.mode !== 'mouse') return;
    if (!at.twin) await rollTwin(false);
    const el = at.twin;
    if (cur !== at || !el) return;
    if (Math.abs(el.currentTime - at.app.currentTime) > 0.05) el.currentTime = at.app.currentTime + 0.03;
    // The twin takes over the clip; the arrow's clip fades off the top.
    at.app = el;
    at.twin = null;
    front(el, appEls, true);
    toEnd();
  }

  // The links, drawn from the timeline, frame by frame only while there are any.
  const NS = 'http://www.w3.org/2000/svg';
  let paths = [];
  let linking = false;
  function clearLinks() {
    while (paths.length) paths.pop().remove();
  }
  function drawLinks(links) {
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
  function linkFrames() {
    if (linking) return;
    linking = true;
    const at = cur;
    const frame = (now, meta) => {
      if (cur !== at || paused || at.mode !== hand) {
        linking = false;
        if (at.mode !== hand) clearLinks();
        return;
      }
      const f = Math.round(meta.mediaTime * M.fps);
      const links = at.tl.links[f] || [];
      drawLinks(links);
      // Carry on while there are lines, or some soon.
      if (links.length || at.tl.links.slice(f + 1, f + 4).some(Boolean)) at.app.requestVideoFrameCallback(frame);
      else linking = false;
    };
    at.app.requestVideoFrameCallback(frame);
  }

  // A dozen times a second: the levels since the last time, the links
  // starting, the controller's clip kept in step with the app's.
  function every() {
    const at = cur;
    if (!at?.started || paused) return;
    const t = at.app.currentTime;
    const f = Math.min(at.tl.level.length - 1, Math.round(t * M.fps));
    const from = at.last < 0 || at.last > f ? f : at.last + 1;
    if (f >= from) opts.onLevels?.(at.tl.level.slice(from, f + 1));
    at.last = f;
    if (at.mode === hand && at.tl.links.slice(f, f + 4).some(Boolean)) linkFrames();
    const c = at.ctl;
    if (c && !c.seeking && Math.abs(c.currentTime - t) > 0.1) c.currentTime = t + 0.04;
  }

  function setHand(next) {
    if ((next !== 'mouse' && next !== 'controller') || next === hand) return;
    hand = next;
    root.dataset.hand = hand;
    clearLinks();
    // Switching away from the mouse: its arrow goes at once.
    if (hand === 'controller' && cur?.mode === 'mouse') {
      // What to load first, on a slow connection: this step's controller
      // clip (small; without it the controller would rise empty), then the
      // next step's in the controller hand (the swap waits for it), then the
      // twin that takes the arrow away. (Each asked for first jumps the queue,
      // so they're asked for in reverse.)
      const next = order[(pos + 1) % order.length];
      twinClip(cur.i, true);
      ctlClip('controller', next, true);
      clip('controller', next, true);
      ctlClip(cur.mode, cur.i, true);
      crossToTwin();
    }
    // Back to the mouse: the twin for the arrow to fade in over, next step.
    if (hand === 'mouse') twinClip(order[(pos + 1) % order.length], true);
    // A controller coming in shows this step's controller clip, in step.
    if (hand === 'controller' && cur && !cur.ctl) syncDesk();
    clip(hand, order[(pos + 1) % order.length]);
    if (hand === 'controller') ctlClip(hand, order[(pos + 1) % order.length]);
  }
  async function syncDesk() {
    const at = cur;
    const el = await prime(ctlEls, await ctlClip(at.mode, at.i, true).promise, `${at.mode}-${at.i}`, at.app.currentTime + 0.15);
    if (cur !== at) return;
    at.ctl = el;
    if (!paused) el.play().catch(() => {});
    front(el, ctlEls);
  }
  function prepare(on) {
    prepared = !!on;
    if (prepared && hand === 'mouse') {
      for (const i of order) twinClip(i);
      rollTwin();
    } else if (!prepared && cur?.twin) {
      cur.twin.pause();
      cur.twin = null;
    }
  }
  function setPaused(p) {
    p = !!p;
    if (p === paused) return;
    paused = p;
    root.toggleAttribute('data-paused', p);
    if (p) {
      for (const v of [...appEls, ...ctlEls]) v.pause();
      clearInterval(tick);
      return;
    }
    tick = setInterval(every, TICK);
    if (cur && !cur.started) begin();
    else if (cur) {
      for (const v of [cur.app, cur.ctl, cur.twin]) v?.play().catch(() => {});
      toEnd();
    }
  }
  function setVars(vars) {
    for (const [k, v] of Object.entries(vars || {})) root.style.setProperty(k, v);
  }

  if (opts.paused) setPaused(true);
  else tick = setInterval(every, TICK);
  await start(hand, order[0]);
  const first = cur.app;
  const ready = () => opts.onReady?.();
  if (first.requestVideoFrameCallback) first.requestVideoFrameCallback(ready);
  else ready();
  if (opts.log) {
    // For measuring: each presented frame of the app elements, with its clip.
    window.__frames = [];
    for (const el of appEls) {
      const log = (now, meta) => {
        window.__frames.push([Math.round(now * 10) / 10, appEls.indexOf(el), el.dataset.clip, Math.round(meta.mediaTime * 1000), meta.presentedFrames, el.classList.contains('going') ? 'going' : el.classList.contains('front') ? 'front' : 'back']);
        el.requestVideoFrameCallback(log);
      };
      el.requestVideoFrameCallback?.(log);
    }
  }
  return { root, setHand, setPaused, setVars, prepare, get codec() { return codec; }, get hand() { return hand; } };
}
