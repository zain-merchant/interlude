// The website's hero: the real Interlude UI, running on the simulated engine
// the app uses for browser previews, played by a Stageshow script.
//
// Nothing here is a picture of the app. The app is mounted as it is in
// `npm run dev`; a transparent Stageshow stage sits over it and draws only
// the cursor. The script moves that cursor onto the app's own controls and
// presses them, so every number, waveform and meter on screen is the app
// reacting. (The app lives outside the stage on purpose: the stage resets
// the styles of buttons, inputs and lists inside it, for the kit's parts.)
//
// The story is one transition in a set that never ends: sync the waiting
// deck, start it, crossfade over, stop the old deck, load the next record
// into it. The decks then trade places, so each loop picks up where the last
// one finished and nothing rewinds.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mount } from 'svelte';
import { Stage } from './stageshow/stage';
import { Controller } from './Controller.jsx';
import App from '../src/App.svelte';
import { engine, control } from '$lib/engine.svelte.js';
import { showTip, hideTip, tipText } from '$lib/tooltip.svelte.js';
import { hideToast } from '$lib/undo.svelte.js';
import { backend } from '$lib/backend.js';
import '../src/app.css';
import './hero.css';
import './controller.css';

const W = 1440;
// The app is 1440 × 900, and so is the whole picture: in the controller
// version the controller comes up over the app's foot.
const APP_H = 900;
const H = 900;

// The set: Afterglow opens it; then each loop puts on the next of these,
// round and round. All sit well inside the library's first screen (never
// the last row, which the list's edge cuts), and all a few BPM under the
// 129 the set runs at (123, 126, 125), so Sync has a clear job: the tempo
// jumps, the pitch fader moves, the beats snap into line.
const OPENER = 'Afterglow';
// From the top of the list, so the controller never covers the row it picks.
const SET = ['Night Shift', 'Paper Planes', 'Lucid'];

const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until `fn` returns something truthy, checking each frame. */
async function until(fn, ms = 8000) {
  const end = performance.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (performance.now() > end) throw new Error('hero: timed out waiting for the app');
    await sleep(30);
  }
}

/**
 * A point inside an element, in stage pixels. The stage is drawn at 1:1
 * over the app (this page is always 1440 × 900; the website scales the
 * whole frame), so page coordinates are stage coordinates. Aim off the
 * label, so the hand never covers the words it presses.
 */
function spot(el, fx = 0.78, fy = 0.66) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}

const deckEl = (d) => $(`[data-region="deck${d}"]`);
const crossfader = () => $('[role="slider"][aria-label="Crossfader"]');

/** A library row by its title. */
function rowByTitle(title) {
  for (const n of document.querySelectorAll('[data-region="tracks"] *')) {
    if (n.childElementCount === 0 && n.textContent.trim() === title) {
      return n.closest('[role="row"], [role="option"], li, tr, .row') ?? n.parentElement;
    }
  }
  return null;
}

/** Loads a track the way a person does: select its row, double-click it. */
function doubleClick(row) {
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
  // A click focuses the list for the keyboard; a mouse user never sees that ring.
  document.activeElement?.blur?.();
}

/**
 * Moves to a control and presses it: the hover lands as the hand arrives,
 * the press shows with the click, and the app acts as the button comes up.
 */
async function press(a, el, act = () => el.click(), opts, at = spot(el)) {
  await a.move(at);
  el.setAttribute('data-demo-hover', '');
  el.setAttribute('data-demo-pressed', '');
  await a.click(undefined, opts);
  el.removeAttribute('data-demo-pressed');
  act();
  setTimeout(() => el.removeAttribute('data-demo-hover'), 380);
}

let nextInSet = 1;
let markReady;
const ready = new Promise((r) => (markReady = r));

/** Gets the app to the opening picture: A playing a few bars in, B cued. */
async function setUp() {
  // Stems need their separation model; the simulated engine 'downloads' it in a few seconds.
  backend.downloadStemsModel?.();
  await until(() => rowByTitle(OPENER) && rowByTitle(SET[0]));
  doubleClick(rowByTitle(OPENER));
  await until(() => engine.decks[0].loaded);
  await control({ type: 'seek', deck: 0, seconds: 52.4 });
  await control({ type: 'play', deck: 0 });
  await until(() => engine.decks[0].playing);
  doubleClick(rowByTitle(SET[0]));
  await until(() => engine.decks[1].loaded);
  await control({ type: 'setCrossfader', value: -1 });
  hideToast();
  // The library analyzes in the background; let it finish so its header is calm.
  await until(() => !/analyzing/i.test(document.body.textContent), 10000).catch(() => {});
  // The app restores its saved mixer as it starts, so set the crossfader
  // last: all the way over to deck A, the deck that's playing.
  await control({ type: 'setCrossfader', value: -1 });
  await until(() => (engine.mixer?.crossfader ?? -1) <= -0.99, 2000).catch(() => {});
  // Let the waveforms, meters and BPM readouts settle before anyone sees them.
  await sleep(500);
}

/** A fader runs in a slot: the hand follows it in a straight line, not an arc. */
const straight = (t, from, to) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });

/** Moves the crossfader by hand, the readout following, as a real drag shows it. */
async function crossfade(a, to) {
  const fader = crossfader();
  const cap = $('.cap', fader);
  const track = fader.getBoundingClientRect();
  const y = track.top + track.height / 2;
  await a.move(spot(cap, 0.5, 0.5));
  await a.drag({ x: track.left + ((to + 1) / 2) * track.width, y }, (at) => {
    const v = Math.max(-1, Math.min(1, ((at.x - track.left) / track.width) * 2 - 1));
    control({ type: 'setCrossfader', value: v });
    showTip(fader, tipText('Crossfader', `${Math.round(((v + 1) / 2) * 100)}%`));
  }, { duration: 2400, cursor: 'preserve', path: straight });
  control({ type: 'setCrossfader', value: to });
  setTimeout(() => hideTip(fader), 500);
}

// Two ways to play the same set: with the mouse on screen, or from a DJ
// controller rising over the foot of the app. The website switches between
// them with a message; the script picks the hands at each beat, so a switch
// takes effect mid-set without anything resetting.
let arrived = false;
// Every link on screen, so a switch of hands can clear them all.
const links = new Set();
let mode = new URLSearchParams(location.search).get('mode') === 'controller' ? 'controller' : 'mouse';
const modeListeners = new Set();
function setMode(next) {
  if (next !== 'mouse' && next !== 'controller') return;
  if (next !== mode) links.forEach((end) => end());
  if (next !== mode) arrived = next === 'controller';
  mode = next;
  modeListeners.forEach((fn) => fn(mode));
}
window.addEventListener('message', (e) => {
  if (e.data?.interlude === 'mode') setMode(e.data.mode);
});

/**
 * Presses a key on the controller: a fingertip's shadow lands on it, the
 * key goes down its travel, and the app answers as it comes back up.
 */
/**
 * Presses a key on the controller: the fingertip lands, the key goes down
 * its travel, the link to the app shows, and the app answers.
 */
async function hwPress(a, target, act, label, appEl) {
  const el = document.querySelector(`[data-target="${target}"]`);
  const done = link(el, appEl, label);
  await a.wait(LEAD);
  el?.setAttribute('data-hw-pressed', '');
  await a.click(target);
  el?.removeAttribute('data-hw-pressed');
  // The change travels the line; the app answers as the pulse lands.
  done.pulse();
  await a.wait(TRAVEL);
  act();
  await a.wait(500);
  done();
}

/** Runs `fn` when a pulse sent now would land in the app. */
const onLanding = (fn) => setTimeout(fn, TRAVEL);

/*
 * How the controller and the app are tied together on screen, picked by
 * the site's Try panel (being tried; one will stay). The gestures (the
 * tempo fader ridden, the crossfader swept, knobs turned) are the same in
 * every one.
 *   line    a soft ring round the control on the hardware and the one in the
 *           app, a fine line between them, and a dot of light travelling
 *           along it, hardware to app, as each change goes through
 *   label   a small label appears at the hardware and glides to the app
 *   rings   just the two rings, together
 */
let inputStyle = new URLSearchParams(location.search).get('input') ?? 'line';
function setInput(style) {
  inputStyle = style;
  document.getElementById('hero').dataset.input = style;
}
window.addEventListener('message', (e) => {
  if (e.data?.interlude === 'input') setInput(e.data.style);
});
queueMicrotask(() => setInput(inputStyle));

// How long a pulse takes to travel the line, and for the line to draw in.
const TRAVEL = 560;
const LINK_IN = 380;
// The pulse sets off while the line is still drawing, a little past halfway.
const LEAD = 200;
const heroBox = () => document.getElementById('hero').getBoundingClientRect();
const NS = 'http://www.w3.org/2000/svg';
function layer() {
  let svg = document.querySelector('svg.links');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'links');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    document.getElementById('hero').append(svg);
  }
  return svg;
}
/** An element's own corner radii as drawn on screen (x and y apart, since
 * the controller is tilted and a round knob shows as an ellipse). */
function radiiOf(el, r) {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const sx = r.width / (el.offsetWidth || r.width || 1);
  const sy = r.height / (el.offsetHeight || r.height || 1);
  let rx, ry;
  if (v.endsWith('%')) {
    rx = r.width * (parseFloat(v) / 100);
    ry = r.height * (parseFloat(v) / 100);
  } else {
    const px = parseFloat(v) || 0;
    rx = px * sx;
    ry = px * sy;
  }
  return [Math.min(rx, r.width / 2), Math.min(ry, r.height / 2)];
}
const PAD = 5;
/** The box a mark goes round: a library title is a wide column, so its mark
 * hugs just the words. */
function rectOf(el) {
  if (el.matches('.t') && el.firstChild) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width) return r;
  }
  return el.getBoundingClientRect();
}
/** Where a straight line from inside `r` towards (ux, uy) leaves it, `pad` out. */
function exitDistance(r, ux, uy, pad) {
  const tx = Math.abs(ux) > 1e-6 ? (r.width / 2 + pad) / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? (r.height / 2 + pad) / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

/**
 * Ties a control on the hardware to the one it drives in the app: a mark
 * round each, shaped to its own corners, a gently curved line between them
 * in Interlude's blue, and one dot of light that travels it as the change
 * goes through. While it's up it follows both ends, so it moves when a
 * fader or knob moves. Returns a function that ends it; .pulse() sends the
 * dot.
 */
function link(hw, appEl, label) {
  // The app's end is looked up afresh each frame, so a re-rendered row or a
  // moved selection never leaves the mark on a stale node.
  const target = () => (typeof appEl === 'function' ? appEl() : appEl);
  const end = () => {};
  end.pulse = () => {};
  if (!hw || !target()) return end;
  const svg = layer();
  const mk = (tag, cls) => {
    const n = document.createElementNS(NS, tag);
    n.setAttribute('class', cls);
    svg.append(n);
    return n;
  };
  const marks = inputStyle !== 'label' ? [mk('rect', 'link-ring'), mk('rect', 'link-ring')] : [];
  const path = inputStyle === 'line' ? mk('path', 'link-line') : null;
  let tag = null;
  if (inputStyle === 'label' && label) {
    tag = document.createElement('div');
    tag.className = 'link-label';
    tag.textContent = label;
    document.getElementById('hero').append(tag);
  }
  let geom = null;
  // The way it was first drawn: out of the hardware straight up (or down),
  // into the app from below (or above), one soft S between. It starts and
  // ends on the marks' own edges, so it meets them with no gap.
  const curve = (t) => {
    const { p0, c0, c1, p1 } = geom;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
    };
  };
  let spark = null;
  const sizes = [];
  let anchor = null;
  const place = () => {
    const h = heroBox();
    const app = target();
    const ra = hw.getBoundingClientRect();
    const rb = app?.isConnected ? rectOf(app) : null;
    if (!rb || !rb.width || !rb.height) {
      svg.style.visibility = 'hidden';
      return;
    }
    svg.style.visibility = '';
    // Each mark's size is taken once, when it appears (or when the app's end
    // becomes a different element); after that it only follows the
    // control's centre. So a key going down doesn't make its ring shrink or
    // pulse, while a fader cap's ring travels with the cap.
    const box = (r, el, slot) => {
      const py = PAD * (r.height / (el.offsetHeight || r.height));
      if (!sizes[slot] || sizes[slot].el !== el) {
        const [rx, ry] = radiiOf(el, r);
        sizes[slot] = { el, w: r.width, h: r.height, py, rx, ry };
      }
      const z = sizes[slot];
      // A key going down shrinks a few percent: ignored. A real change of
      // size (a new title) is eased into, never jumped to.
      const dw = r.width / z.w - 1;
      const dh = r.height / z.h - 1;
      if (Math.abs(dw) > 0.1 || Math.abs(dh) > 0.1) {
        z.w += (r.width - z.w) * 0.18;
        z.h += (r.height - z.h) * 0.18;
      }
      // It stays put unless the control really travels (a fader cap, a
      // crossfader): a key's few pixels of travel don't move its mark.
      const x = r.left - h.left + r.width / 2;
      const y = r.top - h.top + r.height / 2;
      if (!z.home) z.home = { x, y };
      if (!z.moving && Math.hypot(x - z.home.x, y - z.home.y) > 4) z.moving = true;
      const cx = z.moving ? x : z.home.x;
      const cy = z.moving ? y : z.home.y;
      return { ...z, cx, cy, top: cy - z.h / 2 - z.py, bottom: cy + z.h / 2 + z.py };
    };
    const A = box(ra, hw, 0);
    const B = box(rb, app, 1);
    [[marks[0], A], [marks[1], B]].forEach(([m, z]) => {
      if (!m) return;
      m.setAttribute('x', String(z.cx - z.w / 2 - PAD));
      m.setAttribute('y', String(z.top));
      m.setAttribute('width', String(z.w + PAD * 2));
      m.setAttribute('height', String(z.h + z.py * 2));
      m.setAttribute('rx', String(z.rx + PAD));
      m.setAttribute('ry', String(z.ry + z.py));
    });
    const up = B.cy < A.cy;
    const p0 = { x: A.cx, y: up ? A.top : A.bottom };
    const p1 = { x: B.cx, y: up ? B.bottom : B.top };
    const lift = Math.max(40, Math.abs(p0.y - p1.y) * 0.5) * (up ? -1 : 1);
    // The bends are set where the line was first drawn and follow the ends
    // only part of the way: when the ends move the line flexes, rather than
    // the whole thing sliding along as one.
    if (!anchor) anchor = { p0: { ...p0 }, p1: { ...p1 }, lift };
    const FOLLOW = 0.35;
    const c0 = { x: anchor.p0.x + (p0.x - anchor.p0.x) * FOLLOW, y: anchor.p0.y + anchor.lift + (p0.y - anchor.p0.y) * FOLLOW };
    const c1 = { x: anchor.p1.x + (p1.x - anchor.p1.x) * FOLLOW, y: anchor.p1.y - anchor.lift + (p1.y - anchor.p1.y) * FOLLOW };
    geom = { p0, p1, c0, c1 };
    const d = `M${p0.x} ${p0.y} C ${geom.c0.x} ${geom.c0.y}, ${geom.c1.x} ${geom.c1.y}, ${p1.x} ${p1.y}`;
    path?.setAttribute('d', d);
    spark?.setAttribute('d', d);
  };
  place();
  if (path) {
    const total = path.getTotalLength();
    path.style.strokeDasharray = `${total} ${total}`;
    path.animate([{ strokeDashoffset: total }, { strokeDashoffset: 0 }], { duration: LINK_IN, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' })
      .finished.then(() => (path.style.strokeDasharray = 'none'));
  }
  if (tag) {
    tag.animate(Array.from({ length: 13 }, (_, i) => {
      const p = curve(i / 12);
      return { transform: `translate(${p.x}px, ${p.y - 28}px) translate(-50%, -50%)` };
    }), { duration: TRAVEL + 300, delay: LEAD, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'both' });
    tag.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'both' });
  }
  requestAnimationFrame(() => [...marks, path].forEach((p) => p?.classList.add('on')));
  // Follow both ends while the link is up.
  let alive = true;
  const follow = () => {
    if (!alive) return;
    place();
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  // The pulse: a short brighter stretch of the line itself, running along
  // it once, hardware to app, and fading as it arrives.
  let sent = false;
  const pulse = () => {
    if (!path || sent) return;
    sent = true;
    spark = mk('path', 'link-spark');
    place();
    const SEG = 64;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / TRAVEL);
      const e = -(Math.cos(Math.PI * t) - 1) / 2;
      const total = spark.getTotalLength();
      spark.style.strokeDasharray = `${SEG} ${total + SEG}`;
      spark.style.strokeDashoffset = String(SEG - e * (total + SEG));
      spark.style.opacity = String(t < 0.8 ? 1 : (1 - t) / 0.2);
      if (t < 1) requestAnimationFrame(step);
      else {
        spark.remove();
        spark = null;
      }
    };
    requestAnimationFrame(step);
  };
  let ended = false;
  const done = () => {
    if (ended) return;
    ended = true;
    links.delete(done);
    alive = false;
    spark?.remove();
    spark = null;
    for (const p of [...marks, path]) p?.classList.remove('on');
    if (tag) tag.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => tag.remove());
    setTimeout(() => [...marks, path].forEach((p) => p?.remove()), 420);
  };
  done.pulse = pulse;
  links.add(done);
  return done;
}

const mouse = {
  sync: (a, d) => press(a, $('.btn.sync', deckEl(d))),
  play: (a, d) => press(a, $('.btn.play', deckEl(d))),
  crossfade: (a, to) => crossfade(a, to),
  // A row is pressed in the space between the artist and the BPM, clear of its words.
  load: (a, d, row) => press(a, row, () => doubleClick(row), { double: true }, spot(row, 0.66, 0.55)),
};

const controller = {
  // Beatmatching by hand: ride the waiting deck's tempo fader until its
  // tempo meets the playing deck's, the app's tempo moving with it; then
  // Sync to lock the beats.
  async sync(a, d) {
    const cap = $(`[data-hw="pitch-${d}"]`);
    const slot = cap?.parentElement;
    const appFader = () => { const f = deckEl(d).querySelector('[role="slider"]'); return f?.querySelector('.cap') ?? f; };
    const other = engine.decks[1 - d];
    const rate0 = engine.decks[d].rate || 1;
    const target = (other.bpm * other.rate) / (engine.decks[d].bpm || other.bpm);
    if (!cap || !slot || !Number.isFinite(target)) return;
    cap.setAttribute('data-target', `c-pitch-${d}`);
    const s = slot.getBoundingClientRect();
    const h = heroBox();
    const from = a.center(`c-pitch-${d}`);
    const at = Math.max(-1, Math.min(1, (target - 1) / 0.08));
    const to = { x: from.x, y: s.top - h.top + s.height * (0.5 + at * 0.45) };
    await a.move(from);
    const tie = link(cap, appFader, 'Tempo');
    await a.wait(LEAD);
    let next = 0;
    await a.drag(to, (_p, _f, t) => {
      const rate = rate0 + (target - rate0) * t;
      onLanding(() => control({ type: 'setRate', deck: d, rate }));
      if (t >= next) { tie.pulse(); next = 2; }
    }, { duration: 1700, path: straight });
    await a.wait(TRAVEL);
    control({ type: 'setRate', deck: d, rate: target });
    await a.wait(400);
    tie();
    await a.wait(200);
    await hwPress(a, `c-sync-${d}`, () => $('.btn.sync', deckEl(d)).click(), 'Sync', () => $('.btn.sync', deckEl(d)));
  },
  play: (a, d) => hwPress(a, `c-play-${d}`, () => $('.btn.play', deckEl(d)).click(), engine.decks[d].playing ? 'Pause' : 'Play', () => $('.btn.play', deckEl(d))),
  async crossfade(a, to) {
    const capEl = $('[data-target="c-xf-cap"]');
    const r = a.rect('c-xf');
    const xf = engine.mixer?.crossfader ?? 0;
    const y = r.y + r.height / 2;
    await a.move({ x: r.x + ((xf + 1) / 2) * r.width, y });
    const tie = link(capEl, $('.cap', crossfader()), 'Crossfader');
    await a.wait(LEAD);
    let next = 0;
    await a.drag({ x: r.x + ((to + 1) / 2) * r.width, y }, (at, _f, t) => {
      const value = Math.max(-1, Math.min(1, ((at.x - r.x) / r.width) * 2 - 1));
      onLanding(() => control({ type: 'setCrossfader', value }));
      if (t >= next) { tie.pulse(); next = 2; }
    }, { duration: 2200, path: straight });
    await a.wait(TRAVEL);
    control({ type: 'setCrossfader', value: to });
    await a.wait(400);
    tie();
  },
  async load(a, d, row) {
    // Turn the browse knob through the list to the record, then push it to load.
    const knob = $('[data-target="c-browse"]');
    await a.move('c-browse');
    const tie = link(knob, () => row.querySelector('.t') ?? row, 'Browse');
    await a.wait(LEAD);
    tie.pulse();
    for (let i = 0; i < 3; i++) {
      knob.style.rotate = `${(parseFloat(knob.style.rotate) || 0) + 30}deg`;
      await a.wait(260);
    }
    await a.wait(TRAVEL - 260);
    row.scrollIntoView({ block: 'nearest' });
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await a.wait(450);
    tie();
    await hwPress(a, 'c-browse', () => doubleClick(row), 'Load', () => $('.title, [class*="title"]', deckEl(d)) ?? deckEl(d));
  },
};

/**
 * Lets the cursor steer. An arrow pulled along by its tip turns so its body
 * trails behind it on the path: the tip leads toward where it's heading. The
 * turn is strongest when the hand moves across the arrow and nothing when it
 * moves along it (so there's no flip when it travels tail-first), grows with
 * speed, and a soft spring stands it back upright as it slows. Capped at 10
 * degrees: a pointer that steers, not a paper plane. Read from where
 * Stageshow has put the cursor each frame, so the script never has to
 * think about it.
 */
function useCursorSteer() {
  useEffect(() => {
    // The arrow's own axis, tail to tip, in its 22px box: notch (11.8, 11.8)
    // to tip (4, 3),
    // turned by the resting angle the stylesheet gives it.
    const BASE = (11 * Math.PI) / 180;
    const ax0 = { x: 4 - 11.8, y: 3 - 11.8 };
    const len = Math.hypot(ax0.x, ax0.y);
    const AX = {
      x: (ax0.x * Math.cos(BASE) - ax0.y * Math.sin(BASE)) / len,
      y: (ax0.x * Math.sin(BASE) + ax0.y * Math.cos(BASE)) / len,
    };
    const K = 110; // how firmly it stands back upright (1/s²)
    const C = 2 * 1.0 * Math.sqrt(K); // critically damped: it never wobbles
    const STEER = 0.05; // how hard the path turns it (rad/s² per px/s)
    const MAX = (10 * Math.PI) / 180;
    let raf;
    let prev = null;
    let p0 = null;
    const v = { x: 0, y: 0 };
    let angle = 0;
    let omega = 0;
    const frame = (now) => {
      const el = document.querySelector('.hero-stage .ss-cursor');
      if (el && prev !== null) {
        const dt = Math.min(0.05, (now - prev) / 1000) || 1 / 60;
        const m = new DOMMatrix(getComputedStyle(el).transform);
        if (p0) {
          // Velocity, smoothed over a couple of frames.
          v.x += ((m.m41 - p0.x) / dt - v.x) * 0.45;
          v.y += ((m.m42 - p0.y) / dt - v.y) * 0.45;
        }
        p0 = { x: m.m41, y: m.m42 };
        const speed = Math.hypot(v.x, v.y);
        // The arrow's axis as it's turned now, and how far across it the hand moves.
        const c = Math.cos(MAX * Math.tanh(angle / MAX));
        const sn = Math.sin(MAX * Math.tanh(angle / MAX));
        const ax = AX.x * c - AX.y * sn;
        const ay = AX.x * sn + AX.y * c;
        const across = speed > 1 ? (ax * v.y - ay * v.x) / speed : 0;
        omega += (STEER * speed * across - K * angle - C * omega) * dt;
        angle += omega * dt;
        // A soft ceiling: it eases into the limit rather than stopping dead at it.
        const shown = MAX * Math.tanh(angle / MAX);
        el.style.setProperty('--lean', `${((shown * 180) / Math.PI).toFixed(2)}deg`);
      }
      prev = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}

const hands = () => (mode === 'controller' ? controller : mouse);

// The deck's own controls, found the way a person would: by what they say.
const tabOf = (d, label) => [...deckEl(d).querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim().startsWith(label));
const stemOf = (d, i) => deckEl(d).querySelectorAll('.stems .stem')[i];
const loopOf = (d) => deckEl(d).querySelector('.perf button.big');
const fxOf = (d) => deckEl(d).querySelector('.fx .tog');
const lowEq = (d) => $(`[role="slider"][aria-label="Deck ${'AB'[d]} low EQ"]`);
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

/** Shows a deck's Loop, FX or Stems controls, if they aren't showing already. */
async function openTab(a, d, label) {
  const t = tabOf(d, label);
  if (!t || t.getAttribute('aria-selected') === 'true') return;
  await press(a, t, () => t.click(), undefined, spot(t, 0.74, 0.78));
  await a.wait(350);
}

/**
 * Turns an EQ knob all the way down by hand: the hand drags down, and the
 * knob steps with it (its own arrow-key steps, so it turns and shows its
 * readout exactly as it does for a person), landing on the kill.
 */
async function killKnob(a, knob, onTurn) {
  const r = knob.getBoundingClientRect();
  const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  await a.move(from);
  let steps = 0;
  await a.drag({ x: from.x, y: from.y + 60 }, (at) => {
    const want = Math.floor((at.y - from.y) / 5);
    while (steps < want) {
      key(knob, 'ArrowDown');
      steps++;
      onTurn?.(steps / 12);
    }
  }, { duration: 1100, path: straight, cursor: 'preserve' });
  key(knob, 'Home');
  onTurn?.(1);
}

const mouseFeatures = {
  async muteVocals(a, d, mute) {
    await openTab(a, d, 'Stems');
    const vocals = stemOf(d, 0);
    if (!vocals || (vocals.getAttribute('aria-pressed') === 'false') === mute) return;
    await press(a, vocals, () => vocals.click(), undefined, spot(vocals, 0.8, 0.7));
  },
  async killLow(a, d) {
    await killKnob(a, lowEq(d));
  },
  async resetLow(a, d) {
    const k = lowEq(d);
    await a.move(spot(k, 0.5, 0.5));
    await a.click(undefined, { double: true });
    k.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  },
  async loop(a, d, on) {
    await openTab(a, d, 'Loop');
    const l = loopOf(d);
    if (l && (l.getAttribute('aria-pressed') === 'true') !== on) await press(a, l, () => l.click(), undefined, spot(l, 0.82, 0.7));
  },
  async echo(a, d, on) {
    await openTab(a, d, 'FX');
    const f = fxOf(d);
    if (f && (f.getAttribute('aria-pressed') === 'true') !== on) await press(a, f, () => f.click(), undefined, spot(f, 0.8, 0.7));
  },
};

// On the controller, the low EQ is its knob and the loop is its fourth pad.
const controllerFeatures = {
  async killLow(a, d) {
    const hw = document.querySelector(`[data-hw="low-${d}"]`);
    if (!hw) return;
    hw.setAttribute('data-target', `c-low-${d}`);
    await a.move(`c-low-${d}`);
    const app = lowEq(d);
    const r = a.rect(`c-low-${d}`);
    const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const tie = link(hw, app, 'Low EQ');
    await a.wait(LEAD);
    let steps = 0;
    let next = 0;
    await a.drag({ x: from.x, y: from.y + 40 }, (at, _f, t) => {
      const k = Math.min(1, (at.y - from.y) / 40);
      hw.style.rotate = `${-k * 150}deg`;
      while (steps < Math.floor(k * 12)) { onLanding(() => key(app, 'ArrowDown')); steps++; }
      if (t >= next) { tie.pulse(); next = 2; }
    }, { duration: 1300, path: straight });
    await a.wait(TRAVEL);
    key(app, 'Home');
    await a.wait(400);
    tie();
    await a.wait(500);
    app.dispatchEvent(new FocusEvent('blur'));
  },
  async resetLow(a, d) {
    const hw = document.querySelector(`[data-hw="low-${d}"]`);
    if (!hw) return;
    hw.setAttribute('data-target', `c-low-${d}`);
    await a.move(`c-low-${d}`);
    const r = a.rect(`c-low-${d}`);
    const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 + 40 };
    const tie = link(hw, lowEq(d), 'Low EQ');
    await a.wait(LEAD);
    tie.pulse();
    await a.drag({ x: from.x, y: from.y - 40 }, (at) => {
      hw.style.rotate = `${-Math.max(0, Math.min(1, (at.y - (from.y - 40)) / 40)) * 150}deg`;
    }, { duration: 700, path: straight });
    hw.style.rotate = '';
    await a.wait(TRAVEL - 400);
    lowEq(d).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await a.wait(400);
    tie();
    await a.wait(500);
    lowEq(d).dispatchEvent(new FocusEvent('blur'));
  },

};

const features = () => (mode === 'controller' ? controllerFeatures : mouseFeatures);
let round = 0;

/**
 * One transition, from the playing deck to the waiting one. It reads where
 * the set is first, so it can pick up from any point: after a switch of
 * hands, or a pause while the page was out of view.
 *
 * Mixes take turns between two routines, so the loop shows more of the
 * app without any one mix getting long:
 *   stems and a bass swap: the new record comes in with its vocals muted,
 *     the old one's bass is cut as the crossfader moves, the vocals return;
 *   loop and echo out: the new record holds a four-beat loop while it's
 *     brought in, and the old one goes out on an echo.
 */
/**
 * A switch between mouse and controller can come mid-mix, so each step
 * picks its hands as it runs, and a controller that has just risen into
 * view settles before it's played.
 */
async function settle(a) {
  if (arrived || (mode === 'controller' && !$('.hw[data-shown]'))) {
    arrived = false;
    await a.wait(1100);
  }
}
async function act(a, set, name, ...args) {
  await settle(a);
  const fn = set()[name];
  if (fn) return fn(a, ...args);
  // The controller has no key for this one: if the mouse turned it on before
  // the switch, it's turned off here directly, so nothing is left on.
  const [d, on] = args;
  if (on !== false) return;
  const el = { muteVocals: () => stemOf(d, 0), loop: () => loopOf(d), echo: () => fxOf(d) }[name]?.();
  if (el?.getAttribute('aria-pressed') === (name === 'muteVocals' ? 'false' : 'true')) el.click();
}

async function transition(a) {
  await ready;
  // A controller that has just risen into view settles before it's played.
  await settle(a);
  const playing = [0, 1].filter((d) => engine.decks[d].playing);
  const xf = engine.mixer?.crossfader ?? 0;
  // The deck the crowd hears, and the other one.
  const from = playing.length === 2 ? (xf <= 0 ? 0 : 1) : playing[0] ?? 0;
  const to = 1 - from;
  const stemsAndBass = round++ % 2 === 0;

  // An empty deck gets a record first.
  if (!engine.decks[to].loaded) {
    a.mark('load');
    const row = rowByTitle(SET[nextInSet++ % SET.length]);
    if (row) await act(a, hands, 'load', to, row);
    await a.wait(1600);
  }

  if (!engine.decks[to].playing) {
    // Sync the waiting deck to the one playing: the tempo jumps, the pitch
    // fader moves, the beats fall into line.
    a.mark('sync');
    await act(a, hands, 'sync', to);
    await a.wait(1300);

    // Mute its vocals so they don't clash while both play.
    if (stemsAndBass && features().muteVocals) {
      a.mark('stems');
      await act(a, features, 'muteVocals', to, true);
      await a.wait(700);
    }

    // Start it, on the beat.
    a.mark('play');
    await act(a, hands, 'play', to);
    await a.wait(1000);
  }

  if (stemsAndBass) {
    // Take the bass out of the old record, so the two basslines never fight.
    a.mark('eq');
    await act(a, features, 'killLow', from);
    await a.wait(500);
  } else if (features().loop) {
    // Hold the new record on a four-beat loop while it comes in.
    a.mark('loop');
    await act(a, features, 'loop', to, true);
    await a.wait(900);
  }

  // Bring it in.
  a.mark('crossfade');
  await act(a, hands, 'crossfade', to === 0 ? -1 : 1);
  await a.wait(500);

  if (stemsAndBass && features().muteVocals) {
    // And now its vocals.
    a.mark('stems');
    await act(a, features, 'muteVocals', to, false);
    await a.wait(700);
  } else if (!stemsAndBass) {
    // Let the loop go, and send the old record out on an echo.
    await act(a, features, 'loop', to, false);
    await a.wait(400);
    if (features().echo) {
      a.mark('fx');
      await act(a, features, 'echo', from, true);
      await a.wait(900);
    }
  }

  // Stop the record that went out.
  a.mark('stop');
  await act(a, hands, 'play', from);
  await a.wait(600);

  // Put its channel back as it was: EQ to the middle, echo off.
  if (stemsAndBass) await act(a, features, 'resetLow', from);
  else await act(a, features, 'echo', from, false);
  await a.wait(400);

  // And put the next one on.
  a.mark('load');
  const row = rowByTitle(SET[nextInSet++ % SET.length]);
  if (row) await act(a, hands, 'load', from, row);
  await a.wait(2200);
}

function Hero() {
  const appRef = useRef(null);
  const [hand, setHand] = useState(mode);
  useCursorSteer();
  // The page lays itself out by the hands: the controller version eases the
  // screen back and brings the controller up over its foot.
  useEffect(() => {
    document.getElementById('hero').dataset.hand = hand;
  }, [hand]);
  useEffect(() => {
    modeListeners.add(setHand);
    mount(App, { target: appRef.current });
    setUp().then(() => {
      markReady();
      document.documentElement.dataset.ready = '';
      window.parent?.postMessage({ interlude: 'hero-ready' }, '*');
    });
    // Tell the page how loud the set is, so it can glow with the music.
    let raf;
    let last = 0;
    const level = (now) => {
      if (now - last > 33) {
        last = now;
        const l = Math.max(...(engine.masterLevels ?? [0]));
        window.parent?.postMessage({ interlude: 'level', level: Number.isFinite(l) ? l : 0 }, '*');
      }
      raf = requestAnimationFrame(level);
    };
    raf = requestAnimationFrame(level);
    return () => {
      modeListeners.delete(setHand);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div ref={appRef} className="app-host" style={{ height: APP_H }} />
      <div className="cursor-layer">
        <Stage
          width={W}
          height={H}
          className="hero-stage"
          theme="dark"
          play="loop"
          unframed
          cursor={hand === 'controller'
            ? { at: { x: 720, y: 1120 }, style: 'touch', idle: false }
            : { at: { x: 960, y: 551 }, style: 'arrow', idle: false }}
          script={transition}
        >
          {() => <Controller shown={hand === 'controller'} />}
        </Stage>
      </div>
    </>
  );
}

createRoot(document.getElementById('hero')).render(<Hero />);
