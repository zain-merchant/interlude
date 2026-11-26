// The hero as recorded clips (app/demo/segments/record.mjs), played in the
// page itself: no frame, no messages, and no work on most frames.
//
// The demo's script was recorded step by step (sync, stems, play, ...) in
// both hands, lined up so a step lasts as long in either and ends on the same
// app, over the whole six-mix cycle, which comes round exactly: the clips
// loop without a seam, and at any step's end the other hand's next clip
// follows on the same app.
//
// Layers, bottom to top:
//   the app       a clip of the app, flat (in the controller hand the page
//                 tips it back with hero.css's own transform, so a switch
//                 moves it at once). In the mouse hand the arrow is in the
//                 clip; its twin, the same clip without it, is crossed to the
//                 moment the hand is switched, so the arrow goes at once, and
//                 the arrow's clip is crossed back to if the hand comes back.
//   the desk      a clip of the controller (and the controller hand's
//                 fingertip), seen through its outline, so it can come and go
//                 whatever is playing; it moves as controller.css moves the
//                 live one (measured by the recorder).
//   the links     the controller's lines to the app, drawn from the
//                 timeline, only while there are any.
//
// The page is told the music's level a dozen times a second (onLevels).
// Nothing runs on most frames: a timer looks after the levels and keeps the
// controller's clip in step; frame callbacks run only over a clip's last
// frames and while a link is drawn.
//
//   const clips = await mountClips(host, { base, hand, codec, paused,
//     onReady, onLevels, onPhase, onFail });
//   clips.setHand('controller'); clips.setPaused(true); clips.setVars({...});
//   clips.prepare(true)   the hand may be about to switch (pointer on the
//                         toggle): the twin starts, in step, under the clip.
// The newest manifest this player plays (its "schema"; none means 1). A set
// made for a newer player is refused, and the poster stays.
// app/scripts/hero-clips.mjs reads this to fetch only sets it plays.
export const CLIPS_SCHEMA = 1;
const TICK = 1000 / 12;

/** The base styles, scoped to the player's root. */
const BASE_CSS = `
.hero-clips { position: relative; width: 1440px; height: 1020px; overflow: hidden; --tilt: 0deg; --anchor: 50% 0%; }
.hero-clips .app-host { height: 900px; }
.hero-clips video { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
.hero-clips video.front { z-index: 1; }
.hero-clips video.going { z-index: 2; opacity: 0; transition: opacity 180ms cubic-bezier(0.4, 0, 1, 1); }
.hero-clips video.coming { z-index: 3; animation: hero-clips-in var(--in, 180ms) cubic-bezier(0.2, 0, 0, 1) both; }
@keyframes hero-clips-in { from { opacity: 0; } to { opacity: 1; } }
/* The controller, in its box, through its outline at rest. It comes and
   goes as controller.css has the live one ("club"): from --hw-from above
   and a touch smaller (the recorder measured how that looks through the
   live one's perspective: --away-y per px, --away-s), out of a blur (the
   live desk is drawn at 0.52, and its blur with it), a beat behind the
   screen (--hw-delay). */
.hero-clips .desk {
  position: absolute; pointer-events: none; z-index: 2;
  -webkit-mask: var(--ctl-mask) 0 0 / 100% 100% no-repeat;
  mask: var(--ctl-mask) 0 0 / 100% 100% no-repeat alpha;
  /* (Lower than it was recorded, by --ctl-down: the video isn't shrunk.) */
  margin-top: var(--ctl-down, 70px);
  opacity: 0;
  transform: translate(calc(var(--hw-from, -40px) * var(--away-x, 0)), calc(var(--hw-from, -40px) * var(--away-y, 0.5))) scale(var(--away-s, 0.985));
  filter: blur(calc(var(--hw-blur, 10px) * 0.52));
  transition: transform var(--smooth-ms) var(--smooth), opacity var(--smooth-ms) var(--smooth), filter 240ms cubic-bezier(0.4, 0, 1, 1);
}
.hero-clips[data-hand="controller"] .desk {
  opacity: 1; transform: none; filter: none;
  transition: transform var(--smooth-ms) var(--smooth) var(--hw-delay, 110ms), opacity var(--smooth-ms) var(--smooth) var(--hw-delay, 110ms), filter 340ms cubic-bezier(0.2, 0, 0, 1) var(--hw-delay, 110ms);
}
/* A light across it as it comes in (glint(), below): the feature cards' own
   ("connected", and the folder's row), turned to run from top to bottom,
   inside the controller's outline as everything in here is. */
.hero-clips .desk .glint { position: absolute; inset: 0; z-index: 4; overflow: hidden; display: none; }
.hero-clips .desk .glint.go { display: block; animation: hero-clips-glint-end 1.7s step-end both; }
.hero-clips .desk .glint.go::before {
  /* (The cards' band leans a twentieth of its way across; so does this.) */
  content: ''; position: absolute; left: -2%; right: -2%; top: 0; height: 60%;
  background: linear-gradient(183deg, transparent 20%, rgb(255 255 255 / var(--arrive-ctl, 0.4)) 50%, transparent 80%);
  /* (The cards' curve, longer: it has several times as far to go.) */
  animation: hero-clips-glint calc(1.5 * var(--glide-ms, 977ms)) var(--glide, ease-out) 80ms both;
}
@keyframes hero-clips-glint { from { transform: translateY(-70%); } to { transform: translateY(150%); } }
@keyframes hero-clips-glint-end { to { visibility: hidden; } }
@media (prefers-reduced-motion: reduce) { .hero-clips .desk .glint { display: none !important; } }
/* The video keeps its size with the controller (recorded at 0.91). */
.hero-clips[data-hand="controller"] .app-host.app-host { transform: scale(var(--ctl-scale, 1)); }
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

/** A frame callback where there is one, else the next timeupdate (Firefox before 132). */
const onFrame = (el, fn) => {
  if (el.requestVideoFrameCallback) return el.requestVideoFrameCallback((now, meta) => fn(now, meta.mediaTime));
  const t = () => fn(performance.now(), el.currentTime);
  el.addEventListener('timeupdate', t, { once: true });
};

export async function mountClips(host, opts = {}) {
  const base = opts.base ?? 'hero/clips/';
  // (Asked again each time, it's small: it names the recording the clips are from.)
  const M = await fetch(`${base}manifest.json`, { cache: 'no-cache' }).then((r) => r.json());
  if ((M.schema ?? 1) > CLIPS_SCHEMA) throw new Error(`clips: set ${M.source} is schema ${M.schema}, this player plays ${CLIPS_SCHEMA}`);
  const root = document.createElement('div');
  root.className = 'hero-clips';
  root.innerHTML = `<div class="app-host"><video muted playsinline></video><video muted playsinline></video><video muted playsinline></video></div>
    <div class="desk"><video muted playsinline></video><video muted playsinline></video><i class="glint" aria-hidden="true"></i></div>
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
  const away = M.controllerAway;
  if (away) {
    // (Moved and scaled about the controller's own middle, as the live one.)
    desk.style.transformOrigin = `${away.rest[0] + away.rest[2] / 2 - box.x}px ${away.rest[1] - box.y}px`;
    root.style.setProperty('--away-x', String(away.dx));
    root.style.setProperty('--away-y', String(away.perPx));
    root.style.setProperty('--away-s', String(away.scale));
  }
  root.style.setProperty('--ctl-mask', `url(${new URL(`${base}controller-mask.png${M.source ? `?v=${M.source}` : ''}`, location.href)})`);
  // How much of its box the controller fills: its mask, read once.
  let outline = null;
  {
    const im = new Image();
    im.src = `${base}controller-mask.png${M.source ? `?v=${M.source}` : ''}`;
    im.decode().then(() => {
      const W = 180, H = Math.round((W * box.height) / box.width), c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0, W, H);
      const a = x.getImageData(0, 0, W, H).data;
      let l = W, t = H, rr = 0, b = 0;
      for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) if (a[(y * W + X) * 4 + 3] > 100) { l = Math.min(l, X); rr = Math.max(rr, X + 1); t = Math.min(t, y); b = Math.max(b, y + 1); }
      if (b > t) outline = [l / W, t / H, rr / W, b / H];
    }).catch(() => {});
  }
  for (const v of [...appEls, ...ctlEls]) Object.assign(v, { muted: true, playsInline: true, disablePictureInPicture: true, preload: 'auto' });

  const STEPS = M.steps.map((s, i) => ({ ...s, i }));
  const N = STEPS.length;

  // The size: the 1x set where the screen shows the app at no more than about
  // 1600 device pixels across (a phone, a small window): a third to a quarter
  // of the bytes for the same picture there.
  const small = !!M.small && host.getBoundingClientRect().width * devicePixelRatio <= 1600 ? M.small : '';
  // The codec this browser plays without spending power on it: AV1 only where
  // it's decoded in hardware, else HEVC where it is (Safari, Chrome on a Mac
  // or with a hardware decoder), else H.264 (everywhere).
  async function pickCodec() {
    if (opts.codec && M.codecs.includes(opts.codec)) return opts.codec;
    const k = small ? 1 : M.scale;
    const info = (c) => (navigator.mediaCapabilities?.decodingInfo
      ? navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: `video/mp4; codecs="${c}"`, width: 1440 * k, height: 900 * k, bitrate: 1500000, framerate: M.fps } }).catch(() => null)
      : Promise.resolve(null));
    const can = (c) => !!document.createElement('video').canPlayType(`video/mp4; codecs="${c}"`);
    if (M.codecs.includes('av1') && can('av01.0.08M.08') && (await info('av01.0.08M.08'))?.powerEfficient) return 'av1';
    if (M.codecs.includes('hevc') && can('hvc1.1.6.L153.B0')) {
      const i = await info('hvc1.1.6.L153.B0');
      if (!i || (i.supported && i.powerEfficient)) return 'hevc';
    }
    return 'h264';
  }
  // Nothing this browser can play (no H.264 at all): no clips loaded, the page keeps its picture.
  if (!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"')) {
    root.remove();
    throw new Error('clips: no H.264 here');
  }
  let codec = await pickCodec();
  root.dataset.codec = codec + small;

  // The connection. Where the browser says (navigator.connection), slow or
  // metered means nothing is loaded ahead of need; where it doesn't (Safari,
  // Firefox), the same until the first clip has come in fast enough to say
  // otherwise.
  const net = navigator.connection;
  let slow = net ? !!net.saveData || /(^|-)(2g|3g)$/.test(net.effectiveType ?? '') : true;
  let measured = !!net;

  // Loading: one file at a time, in the order asked for, each held as a blob
  // so a clip that's in can start at once.
  const files = new Map();
  const queue = [];
  let loading = false;
  function want(url, first = false) {
    let f = files.get(url);
    if (!f) {
      let done, no;
      f = { url, ready: false, value: null, promise: new Promise((r, n) => ((done = r), (no = n))), done, no };
      // (Nobody may be waiting for it when it fails.)
      f.promise.catch(() => {});
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
      const t0 = performance.now();
      let r;
      try {
        r = await fetch(f.url);
      } catch (e) {
        // A dropped connection isn't the codec's fault: tried again, twice.
        if ((f.tries = (f.tries ?? 0) + 1) <= 2) {
          loading = false;
          setTimeout(() => { queue.unshift(f); pump(); }, 1000 * f.tries);
          return;
        }
        throw e;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.blob();
      // (The first clip of some size says how fast the connection is, where
      // the browser doesn't: 4 Mbit/s or more counts as fast.)
      if (!measured && b.size > 100000) {
        measured = true;
        slow = (b.size * 8) / Math.max(1, performance.now() - t0) < 4000;
      }
      f.value = URL.createObjectURL(b);
      f.ready = true;
      f.done(f.value);
    } catch (e) {
      console.warn('clips: could not load', f.url, e);
      files.delete(f.url);
      failed(e, f.url);
      f.no(e);
    }
    loading = false;
    pump();
  }
  const tl = {};
  // (A hand's timeline: levels in thousandths; link lines by frame, their
  // classes and paths given once, in tables.)
  const timeline = (mode) => (tl[mode] ??= fetch(`${base}${mode}.json${v}`).then((r) => r.json()).then(({ classes, paths, steps }) => steps.map((s) => ({
    level: s.level.map((x) => x / 1000),
    links: Object.fromEntries(Object.entries(s.links).map(([f, ls]) => [f, ls.map(([c, p, op, da, dof, ends]) => [classes[c], paths[p], op, da, dof, ends])])),
  }))));
  // (Each recording's files asked for with its own mark, so one recorded
  // again under the same names is never mixed with a cached older one.)
  const v = M.source ? `?v=${M.source}` : '';
  const name = (mode, i) => `${base}${mode}-${i}`;
  const appUrl = (mode, i) => `${name(mode, i)}.app${small}.${codec}.mp4${v}`;
  const twinUrl = (i) => `${name('mouse', i)}.twin${M.small}.${codec}.mp4${v}`;
  const ctlUrl = (mode, i) => `${name(mode, i)}.ctl${small}.${codec}.mp4${v}`;
  const appClip = (mode, i, first) => want(appUrl(mode, i), first);
  const ctlClip = (mode, i, first) => want(ctlUrl(mode, i), first);
  const twinClip = (i, first) => want(twinUrl(i), first);
  const isReady = (url) => !!files.get(url)?.ready;
  // Clips more than a couple of steps away are let go (they come back from the
  // browser's cache next time round), so a phone never holds the whole loop.
  const stepOf = (url) => +(url.match(/-(\d+)\.(app|twin|ctl)/)?.[1] ?? -1);
  function evict() {
    const keep = new Set([cur?.app, cur?.ctl, cur?.twin, cur?.arrow, cur?.under, ...appEls, ...ctlEls].filter(Boolean).map((e) => e.dataset.src));
    for (const [u, f] of files) {
      const k = stepOf(u);
      if (!f.ready || k < 0 || keep.has(f.value)) continue;
      const d = (k - pos + N) % N;
      if (d <= 2 || d >= N - 1) continue;
      URL.revokeObjectURL(f.value);
      files.delete(u);
    }
  }

  let hand = opts.hand === 'mouse' ? 'mouse' : 'controller';
  root.dataset.hand = hand;
  let paused = false;
  let pos = 0;
  let cur = null; // { mode, i, app, ctl, tl, started, twin, arrow, last }
  let prepared = false;
  let pending = null;
  let tick = 0;
  let dead = false;

  // Something that can't play here: the next codec down once (H.264 plays
  // everywhere), else tell the page (it keeps its picture).
  function failed(e, url) {
    // (Only a failure in the codec playing now counts: one still on its way in
    // the codec just given up on is expected.)
    if (dead || (url && !url.includes(`.${codec}.`))) return;
    if (codec !== 'h264') {
      codec = 'h264';
      root.dataset.codec = codec + small;
      for (const [u, f] of files) if (!f.ready) { files.delete(u); f.no(e); } else if (/\.mp4/.test(u) && !u.includes('.h264.')) { URL.revokeObjectURL(f.value); files.delete(u); }
      queue.length = 0;
      // (A clip already playing that won't decode: again from where it was. One
      // that never came is asked for again by whoever was waiting for it.)
      if (cur && e instanceof MediaError) start(cur.mode, cur.i, true);
      return;
    }
    dead = true;
    opts.onFail?.(e);
  }
  for (const v of [...appEls, ...ctlEls]) v.addEventListener('error', () => v.dataset.src && failed(v.error, v.dataset.url));

  /** Puts a clip in an idle element of a pair and waits until it can play from `at`. */
  const trace = (...a) => opts.log && console.info('clips', performance.now().toFixed(0), ...a);
  // (Elements being got ready right now, by any caller: never handed out twice.)
  const claimed = new Set();
  // strict: leave the twin and the arrow's clip alone too (a boundary may
  // take them; a twin or a raised controller may not take anything in use).
  async function prime(els, src, label, at = 0, strict = true) {
    const busy = new Set([cur?.app, cur?.ctl, cur?.under, ...(strict ? [cur?.twin, cur?.arrow] : []), ...claimed].filter(Boolean));
    const el = els.find((e) => e.dataset.src === src && !busy.has(e)) ?? els.find((e) => !e.classList.contains('front') && !busy.has(e)) ?? els.find((e) => !busy.has(e));
    if (!el) return null;
    claimed.add(el);
    try {
      return await ready1(el, els, src, label, at);
    } finally {
      claimed.delete(el);
    }
  }
  async function ready1(el, els, src, label, at) {
    if (el.dataset.src !== src) {
      el.dataset.src = src;
      el.dataset.url = [...files.values()].find((f) => f.value === src)?.url ?? '';
      el.dataset.clip = label;
      el.src = src;
    } else if (!el.paused) el.pause();
    el.classList.remove('going', 'coming');
    trace('prime', label, 'into', els.indexOf(el), 'at', at, 'was', el.currentTime.toFixed(2), 'rs', el.readyState);
    if (Math.abs(el.currentTime - at) > 0.001) el.currentTime = at;
    if (el.readyState < 3 || el.seeking) {
      await new Promise((r) => {
        const ok = () => (el.readyState >= 3 && !el.seeking ? done() : null);
        // (Some browsers buffer nothing until asked to play: give up waiting
        // after a while and let play() do it.)
        const timer = setTimeout(() => done(), 1500);
        const done = () => { clearTimeout(timer); el.removeEventListener('canplay', ok); el.removeEventListener('seeked', ok); el.removeEventListener('loadeddata', ok); r(); };
        el.addEventListener('canplay', ok);
        el.addEventListener('seeked', ok);
        el.addEventListener('loadeddata', ok);
        ok();
      });
    }
    return el;
  }
  function play(el) {
    const p = el.play();
    p?.catch?.((e) => {
      // Autoplay refused (Low Power Mode, a browser setting): the page keeps
      // its picture; a tap or a click anywhere tries again.
      if (e?.name !== 'NotAllowedError' || blocked) return;
      blocked = true;
      opts.onBlocked?.();
      const retry = () => {
        blocked = false;
        for (const v of [cur?.app, cur?.ctl, cur?.twin]) if (v && !paused) v.play().catch(() => {});
      };
      for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, retry, { once: true, capture: true });
    });
  }
  let blocked = false;
  /** Shows `el` once it has a frame up, and puts the rest of its pair away. */
  function front(el, els, how = 'cut') {
    onFrame(el, () => {
      el.classList.add('front');
      if (how === 'in') {
        // Fades in over the rest, which stays as it is until then.
        el.classList.add('coming');
        setTimeout(() => {
          el.classList.remove('coming');
          for (const o of els) if (o !== el && o.classList.contains('front')) away1(o);
        }, 240);
        return;
      }
      for (const o of els) if (o !== el && o.classList.contains('front')) {
        if (how === 'out') {
          // The one in front fades off the top.
          o.classList.add('going');
          setTimeout(() => away1(o), 200);
        } else away1(o);
      }
    });
  }
  function away1(o) {
    o.classList.remove('front', 'going', 'coming');
    if (o !== cur?.app && o !== cur?.ctl && o !== cur?.twin && o !== cur?.arrow) o.pause();
  }
  const deskShown = () => hand === 'controller' || cur?.mode === 'controller';

  async function start(mode, i, reload = false, again = true) {
    try {
      await start1(mode, i, reload);
    } catch (e) {
      // A clip that couldn't be had: again in the codec it fell back to, once.
      if (!dead && again) return start(mode, i, true, false);
      console.warn('clips:', e);
    }
  }
  async function start1(mode, i, reload) {
    trace('start', mode, i, 'hand', hand);
    const steps = await timeline(mode);
    // A mouse clip while the controller is up (its own clip wasn't in time):
    // the one without the arrow.
    const bare = mode === 'mouse' && hand !== 'mouse' && isReady(twinUrl(i));
    const was = cur;
    const appF = (bare ? twinClip(i, true) : appClip(mode, i, true)).promise;
    const ctlP = deskShown() ? ctlClip(mode, i, true).promise.then((src) => prime(ctlEls, src, `${mode}-${i}`, 0, false)) : null;
    ctlP?.catch(() => {});
    const app = await prime(appEls, await appF, `${mode}-${i}${bare ? '-twin' : ''}`, 0, false);
    if (!app) throw new Error('clips: no element free');
    // Back to the mouse from the controller at this boundary: the arrow
    // fades in over the twin, rather than popping up.
    let under = null;
    if (!reload && mode === 'mouse' && hand === 'mouse' && was?.mode === 'controller' && isReady(twinUrl(i))) {
      cur = { ...was, twin: app };
      under = await prime(appEls, await twinClip(i).promise, `mouse-${i}-twin`, 0, false);
    }
    let ctl = null;
    if (ctlP) ctl = await ctlP;
    else for (const v of ctlEls) v.pause();
    // At a boundary where the hands' pictures differ (a tooltip one has and
    // the other hasn't), a hand swap blends rather than cuts.
    const blend = !reload && was && was.mode !== mode && STEPS[i].blend;
    cur = { mode, i, app, ctl, tl: steps[i], last: -1, under, blend };
    if (was?.twin && was.twin !== app) was.twin.pause();
    if (was?.arrow && was.arrow !== app) was.arrow.pause();
    if (!paused) begin();
  }
  /**
   * Puts the next step's clip (this hand's) in an idle element of its pair,
   * at its first frame, so the boundary needs nothing loaded. (Safari loads
   * nothing for a paused video until it's played once: played and paused.)
   */
  async function preload(els, f, label) {
    if (!f) return;
    const src = await f.promise.catch(() => null);
    if (!src) return;
    const busy = new Set([cur?.app, cur?.ctl, cur?.twin, cur?.arrow, cur?.under, ...claimed].filter(Boolean));
    const el = els.find((e) => !e.classList.contains('front') && !busy.has(e));
    if (!el || el.dataset.src === src) return;
    el.dataset.src = src;
    el.dataset.url = f.url;
    el.dataset.clip = label;
    el.src = src;
    el.currentTime = 0;
    trace('preload', label, 'into', els.indexOf(el));
    const ours = () => el === cur?.app || el === cur?.ctl || el === cur?.twin || el === cur?.arrow;
    setTimeout(() => {
      if (el.dataset.src !== src || ours() || el.readyState >= 2) return;
      el.play()?.then(() => { if (!ours()) { el.pause(); el.currentTime = 0; } }).catch(() => {});
    }, 300);
  }
  /** Plays the clip that's in place. */
  function begin() {
    const { app, ctl, mode, under, blend } = cur;
    cur.started = true;
    play(app);
    if (ctl) play(ctl);
    if (under) {
      // The twin in front first, the clip with the arrow fading in over it.
      play(under);
      front(under, appEls);
      onFrame(under, () => front(app, appEls, 'in'));
      setTimeout(() => { if (cur?.app === app) cur.under = null; }, 400);
    } else front(app, appEls, blend ? 'in' : 'cut');
    if (ctl) front(ctl, ctlEls);
    clearLinks();
    toEnd();
    // Still in the other hand (its clip wasn't in): the hand's next one first.
    if (mode !== hand) {
      const n = (pos + 1) % N;
      if (hand === 'controller') ctlClip(hand, n, true);
      appClip(hand, n, true);
    }
    ahead();
    if (prepared && mode === 'mouse' && hand === 'mouse') rollTwin();
    // The next step's clips, ready at their first frames, after a moment.
    const at = cur;
    setTimeout(() => {
      if (cur !== at || paused) return;
      const n = (pos + 1) % N;
      preload(appEls, appClip(hand, n), `${hand}-${n}`);
      if (hand === 'controller' || mode === 'controller') preload(ctlEls, ctlClip(hand, n), `${hand}-${n}`);
    }, 600);
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
      const frame = (now, t) => {
        if (cur !== at || paused) return;
        if (Math.round(t * M.fps) >= n - 2 || at.app.ended) return advance(at);
        onFrame(cur.app, frame);
      };
      onFrame(cur.app, frame);
    }, Math.max(0, left));
  }
  function advance(at) {
    // (Once per clip, however many ways reached its end.)
    if (at.advanced) return;
    at.advanced = true;
    pos = (pos + 1) % N;
    // A switch asked for at a boundary (the automatic one): here, if the other
    // hand's clips for this step are in, so nothing has to be crossed mid-step.
    if (pending && pending !== hand && isReady(appUrl(pending, pos)) && (pending !== 'controller' || isReady(ctlUrl(pending, pos)))) {
      const h = pending;
      pending = null;
      setHand(h, 'boundary');
      opts.onSwitch?.(h);
    }
    // The other hand's clip if it's in; if not, this hand's, and try again next step.
    const ready = isReady(appUrl(hand, pos)) && (hand !== 'controller' || isReady(ctlUrl(hand, pos)));
    start(ready ? hand : cur.mode, pos);
  }

  /** Loads what the next step will want; on a fast connection, a little more. */
  function ahead() {
    const next = (pos + 1) % N;
    appClip(hand, next);
    if (deskShown()) ctlClip(hand, next);
    timeline(hand === 'mouse' ? 'controller' : 'mouse');
    evict();
    if (slow) return;
    // Fast: the step after that too. (The other hand's only once someone
    // shows they may switch: prepare.)
    appClip(hand, (pos + 2) % N);
  }

  // The twin: the mouse clip without its arrow, run in step under it while
  // a switch may come, and crossed to when it does.
  function rollTwin(first = true) {
    const at = cur;
    if (!at || at.mode !== 'mouse' || at.twin) return Promise.resolve();
    // (Once per step, however many hovers, focuses and presses ask.)
    return (at.twinP ??= (async () => {
      const src = await twinClip(at.i, first).promise.catch(() => null);
      if (!src || cur !== at || at.twin) return;
      const el = await prime(appEls, src, `mouse-${at.i}-twin`, at.app.currentTime + 0.1);
      if (!el || cur !== at || at.twin) return;
      at.twin = el;
      if (!paused) play(el);
    })());
  }
  async function crossToTwin() {
    const at = cur;
    if (!at || at.mode !== 'mouse' || at.app.dataset.clip.endsWith('-twin')) return;
    if (!at.twin) await rollTwin(false);
    const el = at.twin;
    if (cur !== at || !el || hand === 'mouse') return;
    if (Math.abs(el.currentTime - at.app.currentTime) > 0.05) el.currentTime = at.app.currentTime + 0.03;
    // The twin takes over the clip; the arrow's clip fades off the top (and
    // is kept, in step, in case the hand comes straight back).
    at.arrow = at.app;
    at.app = el;
    at.twin = null;
    front(el, appEls, 'out');
    toEnd();
    // (The arrow's clip is kept for a quick way back, but not decoding.)
    setTimeout(() => { if (cur === at && hand !== 'mouse' && at.arrow) at.arrow.pause(); }, 1500);
  }
  // Back to the mouse within the step the arrow went in: its clip fades in
  // again over the twin, where the arrow is now.
  async function crossToArrow() {
    const at = cur;
    if (!at || at.mode !== 'mouse' || !at.app.dataset.clip.endsWith('-twin')) return;
    const src = await appClip('mouse', at.i, true).promise.catch(() => null);
    if (!src || cur !== at || hand !== 'mouse') return;
    const el = at.arrow && at.arrow.dataset.src === src ? at.arrow : await prime(appEls, src, `mouse-${at.i}`, at.app.currentTime + 0.1);
    if (!el || cur !== at || hand !== 'mouse') return;
    if (Math.abs(el.currentTime - at.app.currentTime) > 0.05) el.currentTime = at.app.currentTime + 0.03;
    if (!paused) play(el);
    at.twin = at.app;
    at.app = el;
    at.arrow = null;
    front(el, appEls, 'in');
    toEnd();
  }

  // The links, drawn from the timeline, frame by frame only while there are any.
  const NS = 'http://www.w3.org/2000/svg';
  let paths = [];
  let linking = false;
  function clearLinks() {
    while (paths.length) paths.pop().remove();
  }
  // hw: the frame's links as the controller's clip is showing them (its
  // ring's end), where that clip isn't quite in step with the app's.
  function drawLinks(links, hw = links) {
    while (paths.length > links.length) paths.pop().remove();
    const places = links.some((l) => l[5]) ? boxes() : null;
    links.forEach(([cls, d, op, da, dof, ends], k) => {
      let p = paths[k];
      if (!p) {
        p = paths[k] = document.createElementNS(NS, 'path');
        svg.append(p);
      }
      if (p.getAttribute('class') !== cls) p.setAttribute('class', cls);
      const [path, k2] = (ends && places && fromRings(d, hw[k]?.[5] ?? ends, ends, places)) || where(d);
      if (p.getAttribute('d') !== path) p.setAttribute('d', path);
      // (Dashes as long against the line as they were.)
      const dash = (v) => (k2 === 1 || !v ? v : String(v).replace(/-?[\d.]+/g, (x) => String(Math.round(x * k2 * 100) / 100)));
      const s = p.style, A = dash(da), O = dash(dof);
      if (s.opacity !== String(op)) s.opacity = op;
      if (s.strokeDasharray !== A) s.strokeDasharray = A;
      if (s.strokeDashoffset !== O) s.strokeDashoffset = O;
    });
  }
  // The lines were recorded with the video shrunk (0.91, tipped 3 degrees
  // about its top) and the controller higher: each end is put where its own
  // now is, the app's and the controller's, and the curve between them with
  // them. (M xc yc C xc ym, xa ym, xa ya: the controller's end, then the
  // app's, the bends half way.)
  const REC = { s: 0.91, cos: Math.cos(Math.PI / 60), sin: Math.sin(Math.PI / 60), d: 2400 };
  const moved = new Map();
  function where(d) {
    const key = `${d}|${ctl.scale}|${ctl.down}`;
    let m = moved.get(key);
    if (m) return m;
    const n = d.match(/-?[\d.]+/g)?.map(Number);
    if (n?.length !== 8) return [d, 1];
    const [xc, yc, , , , , xa, ya] = n;
    const ys = (ya * REC.d) / (REC.d * REC.cos - ya * REC.sin), p = REC.d / (REC.d + ys * REC.sin);
    const X = 720 + ((xa - 720) / p / REC.s) * ctl.scale, Y = (ys / REC.s) * ctl.scale, C = yc + ctl.down, M = (C + Y) / 2;
    const f = (v) => Math.round(v * 10) / 10;
    m = [`M${xc} ${f(C)} C ${xc} ${f(M)}, ${f(X)} ${f(M)}, ${f(X)} ${f(Y)}`, Math.abs(C - Y) / Math.max(1, Math.abs(yc - ya))];
    if (moved.size > 4000) moved.clear();
    moved.set(key, m);
    return m;
  }
  const ctl = { scale: 1, down: 70 };
  // Where the clips are now, in the player's own pixels: the controller's
  // box and the app's (its clip is the flat app, 1440 wide).
  function boxes() {
    const r = root.getBoundingClientRect();
    if (!r.width) return null;
    const k = r.width / root.offsetWidth;
    const of = (el) => { const b = el.getBoundingClientRect(); return { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k }; };
    const host = of(appEls[0].parentElement);
    return { desk: of(desk), app: host, appK: host.w / 1440 };
  }
  // The line from the controller's ring to the app's, as the clips show the
  // rings now: each end where the recorded line met its ring, and the bends
  // kept as they were against the ends (out of a ring sideways stays
  // sideways), their reach scaled with the run.
  function fromRings(d, hwEnds, appEnds, at) {
    const n = d.match(/-?[\d.]+/g)?.map(Number);
    if (n?.length !== 8) return null;
    // (A line leaves a ring from the middle of a side. The page that was
    // recorded draws it a frame behind a ring that moves, so its end comes
    // out a little inside: it's put back on the side.)
    const side = (x) => (Math.abs(x - 0.5) < 0.25 ? 0.5 : x < 0.5 ? 0 : 1);
    const [u0, v0, dx, dy, dw, dh] = hwEnds.map((x, i) => (i < 2 ? side(x) : x));
    const [u1, v1, ax, ay, aw, ah] = appEnds.slice(6).map((x, i) => (i < 2 ? side(x) : x));
    const sx = at.desk.w / box.width, sy = at.desk.h / box.height;
    const P0 = { x: at.desk.x + (dx + u0 * dw) * sx, y: at.desk.y + (dy + v0 * dh) * sy };
    const P1 = { x: at.app.x + (ax + u1 * aw) * at.appK, y: at.app.y + (ay + v1 * ah) * at.appK };
    const [x0, y0, c0x, c0y, c1x, c1y, x1, y1] = n;
    const k = Math.abs(y1 - y0) > 1 ? Math.max(0.3, Math.min(3, Math.abs(P1.y - P0.y) / Math.abs(y1 - y0))) : 1;
    const f = (v) => Math.round(v * 10) / 10;
    const C0 = { x: P0.x + (c0x - x0) * k, y: P0.y + (c0y - y0) * k }, C1 = { x: P1.x + (c1x - x1) * k, y: P1.y + (c1y - y1) * k };
    return [`M${f(P0.x)} ${f(P0.y)} C ${f(C0.x)} ${f(C0.y)}, ${f(C1.x)} ${f(C1.y)}, ${f(P1.x)} ${f(P1.y)}`, k];
  }
  const linksAt = (t, f) => t.links[f] || [];
  const anyLinks = (t, f, n) => { for (let k = f; k < f + n; k++) if (t.links[k]) return true; return false; };
  // Each clip's frame as it will be on screen at the next paint: from the
  // last frame it presented and when (frame callbacks), run on from there,
  // so a line is drawn on the same paint as the frame it belongs to, not a
  // frame after it. (Without frame callbacks: its time.)
  const shown = new WeakMap();
  function watchFrames(el, at) {
    if (!el?.requestVideoFrameCallback || shown.has(el)) return;
    const cb = (now, meta) => {
      shown.set(el, { media: meta.mediaTime, at: meta.expectedDisplayTime ?? now });
      if (linking && cur === at) el.requestVideoFrameCallback(cb);
      else shown.delete(el);
    };
    shown.set(el, null);
    el.requestVideoFrameCallback(cb);
  }
  let vsync = 1000 / 60;
  function frameAt(el, now) {
    const s = shown.get(el);
    if (!s) return Math.round(el.currentTime * M.fps);
    const ahead = Math.max(0, now + vsync - s.at) / 1000;
    return Math.round(s.media * M.fps) + (el.paused ? 0 : Math.floor(ahead * M.fps * el.playbackRate + 0.02));
  }
  function linkFrames() {
    if (linking) return;
    linking = true;
    const at = cur;
    watchFrames(at.app, at);
    if (at.ctl) watchFrames(at.ctl, at);
    let last = 0;
    const frame = (now) => {
      if (cur !== at || paused || at.mode !== hand) {
        linking = false;
        if (at.mode !== hand) clearLinks();
        return;
      }
      if (last) vsync = vsync * 0.9 + Math.min(50, now - last) * 0.1;
      last = now;
      const f = frameAt(at.app, now);
      const fc = at.ctl ? frameAt(at.ctl, now) : f;
      const ls = linksAt(at.tl, f);
      drawLinks(ls, fc === f ? ls : linksAt(at.tl, fc));
      // Carry on while there are lines, or some soon.
      if (anyLinks(at.tl, f, 4)) requestAnimationFrame(frame);
      else linking = false;
    };
    requestAnimationFrame(frame);
  }

  // A dozen times a second: the levels since the last time, the links
  // starting, the controller's clip kept in step with the app's.
  function every() {
    const at = cur;
    if (!at?.started || paused) return;
    // (A backstop: a clip that reached its end without its last frames being
    // seen, after a long task or a stall, or where frame callbacks are rare.)
    if (at.app.ended || (at.app.paused && at.app.currentTime >= at.app.duration - 0.05)) return advance(at);
    const t = at.app.currentTime;
    const f = Math.min(at.tl.level.length - 1, Math.round(t * M.fps));
    const from = at.last < 0 || at.last > f ? f : at.last + 1;
    if (f >= from) opts.onLevels?.(at.tl.level.slice(from, f + 1));
    at.last = f;
    if (at.mode === hand && anyLinks(at.tl, f, 4)) linkFrames();
    for (const c of [at.ctl, at.twin, at.arrow]) if (c && !c.seeking && !c.paused && Math.abs(c.currentTime - t) > 0.1) c.currentTime = t + 0.04;
    if (at.app !== phasedEl) phaseOf(at.app);
  }
  // Each frame that shows a new picture of the app, its time (onPhase), so
  // what else moves with it (the record behind it, the grain) can change on
  // the same frames, and the page is put together once for all of them.
  // (Every one: now and then the pictures move over by a frame of the
  // screen's to keep time. Only a callback in the frame its picture was
  // shown in, to be seen at the next, counts; now and then one comes a frame
  // late. In Safari, where a video is put on screen apart from the page,
  // every callback comes after, so none counts there.)
  let phasedEl = null;
  function phaseOf(el) {
    phasedEl = el;
    if (!opts.onPhase || !el.requestVideoFrameCallback) return;
    const cb = (now, meta) => {
      if (paused || phasedEl !== el || cur?.app !== el) { if (phasedEl === el) phasedEl = null; return; }
      if (meta.presentationTime - now > -4 && meta.expectedDisplayTime - now > 4) opts.onPhase(now);
      el.requestVideoFrameCallback(cb);
    };
    el.requestVideoFrameCallback(cb);
  }

  /** The hand; at: 'boundary' when it's switched as one step ends (nothing to cross mid-step). */
  function setHand(next, at) {
    // (A hand picked by hand cancels a switch waiting for a boundary.)
    if (at !== 'boundary') pending = null;
    if ((next !== 'mouse' && next !== 'controller') || next === hand) return;
    hand = next;
    root.dataset.hand = hand;
    clearLinks();
    const n = (pos + 1) % N;
    if (at === 'boundary') return;
    // The next step's clips in this hand, ready in idle elements.
    setTimeout(() => { if (hand === next && cur) { preload(appEls, appClip(hand, n, true), `${hand}-${n}`); if (hand === 'controller') preload(ctlEls, ctlClip(hand, n, true), `${hand}-${n}`); } }, 300);
    if (hand === 'controller' && cur?.mode === 'mouse') {
      // Away from the mouse: its arrow goes at once. What to load first on a
      // slow connection: this step's controller clip (without it the
      // controller would rise empty), then the next step's in the controller
      // hand (the swap waits for it), then the twin that takes the arrow away.
      // (Each asked for first jumps the queue, so they're asked in reverse.)
      twinClip(cur.i, true);
      ctlClip('controller', n, true);
      appClip('controller', n, true);
      ctlClip(cur.mode, cur.i, true);
      crossToTwin();
    }
    if (hand === 'mouse') {
      // Back to the mouse: the arrow back over the twin now, if this is still
      // the mouse's clip; else the twin for it to fade in over, next step.
      if (cur?.mode === 'mouse') crossToArrow();
      twinClip(n, true);
      appClip('mouse', n, true);
    }
    // A controller coming in shows this step's controller clip, in step.
    if (hand === 'controller' && cur && !cur.ctl) syncDesk();
    if (hand === 'controller') { ctlClip(hand, n); appClip(hand, n); }
    timeline(hand);
  }
  async function syncDesk() {
    const at = cur;
    if (at.deskP) return;
    at.deskP = true;
    const src = await ctlClip(at.mode, at.i, true).promise.catch(() => null);
    const el = src && cur === at && (await prime(ctlEls, src, `${at.mode}-${at.i}`, at.app.currentTime + 0.15));
    if (!el || cur !== at) return;
    at.ctl = el;
    if (!paused) play(el);
    front(el, ctlEls);
  }
  function prepare(on) {
    prepared = !!on;
    // (And what a switch needs: this step's controller clip, so a click
    // raises it with its picture, and the other hand's next step.)
    if (prepared && cur) {
      const o = hand === 'mouse' ? 'controller' : 'mouse';
      const n = (pos + 1) % N;
      if (hand === 'mouse') ctlClip(cur.mode, cur.i, true);
      appClip(o, n);
      if (o === 'controller') ctlClip(o, n);
    }
    if (prepared && hand === 'mouse') rollTwin();
    else if (!prepared && cur?.twin && hand === 'mouse') {
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
      clearTimeout(endTimer);
      return;
    }
    tick = setInterval(every, TICK);
    if (cur && !cur.started) begin();
    else if (cur) {
      for (const v of [cur.app, cur.ctl, cur.twin, cur.arrow]) if (v) play(v);
      toEnd();
    }
  }
  function setVars(vars) {
    for (const [k, v] of Object.entries(vars || {})) root.style.setProperty(k, v);
    if (vars?.['--ctl-scale'] !== undefined) ctl.scale = parseFloat(vars['--ctl-scale']) || 1;
    if (vars?.['--ctl-down'] !== undefined) ctl.down = parseFloat(vars['--ctl-down']) || 0;
  }

  if (opts.paused) paused = true;
  else tick = setInterval(every, TICK);
  root.toggleAttribute('data-paused', paused);
  await start(hand, 0);
  if (!cur) {
    clearInterval(tick);
    root.remove();
    throw new Error('clips: the first clip would not play');
  }
  const ready = () => opts.onReady?.();
  onFrame(cur.app, ready);
  if (opts.log) {
    // For testing: each presented frame of the app elements, with its clip.
    window.__frames = [];
    for (const el of appEls) {
      const log = (now, meta) => {
        window.__frames.push([Math.round(now * 10) / 10, appEls.indexOf(el), el.dataset.clip, Math.round(meta.mediaTime * 1000), meta.presentedFrames, el.className, getComputedStyle(el).opacity]);
        el.requestVideoFrameCallback(log);
      };
      el.requestVideoFrameCallback?.(log);
    }
  }
  return {
    root, setHand, setPaused, setVars, prepare,
    /** A light across the controller, once. */
    glint() { const g = desk.querySelector('.glint'); g.classList.remove('go'); void g.offsetWidth; g.classList.add('go'); },
    /** Where the controller's drawn outline is on screen once it has come in (its own entrance left out). */
    controllerBox() {
      const r = root.getBoundingClientRect();
      if (!r.width) return null;
      const k = r.width / root.offsetWidth, [x0, y0, x1, y1] = outline || [0, 0, 1, 1];
      const left = r.left + desk.offsetLeft * k, top = r.top + desk.offsetTop * k, w = desk.offsetWidth * k, h = desk.offsetHeight * k;
      return { left: left + w * x0, top: top + h * y0, right: left + w * x1, bottom: top + h * y1 };
    },
    get codec() { return codec; }, get hand() { return hand; }, get step() { return pos; }, get slow() { return slow; },
    /** Switches to `h` as a step ends, once its clips for that step are in (onSwitch tells the page). */
    switchAtBoundary(h) { pending = h; const n = (pos + 1) % N; appClip(h, n, true); if (h === 'controller') ctlClip(h, n, true); },
    /** Asks for what a switch to the other hand needs (this step's controller clip, the other hand's next). */
    want() { if (!cur) return; const o = hand === 'mouse' ? 'controller' : 'mouse'; const n = (pos + 1) % N; ctlClip(cur.mode, cur.i, true); appClip(o, n); if (o === 'controller') ctlClip(o, n); },
    /** Whether the other hand's clips for the next step are in (a switch would show at the next boundary). */
    get otherReady() { const o = hand === 'mouse' ? 'controller' : 'mouse'; const n = (pos + 1) % N; return isReady(appUrl(o, n)) && (o === 'mouse' || (isReady(ctlUrl(o, n)) && (!cur || isReady(ctlUrl(cur.mode, cur.i))))); },
  };
}
