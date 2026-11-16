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
const SET = ['Slow Burn', 'Halcyon', 'Signal Fire'];

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
let mode = new URLSearchParams(location.search).get('mode') === 'controller' ? 'controller' : 'mouse';
const modeListeners = new Set();
function setMode(next) {
  if (next !== 'mouse' && next !== 'controller') return;
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
async function hwPress(a, target, act, label) {
  const el = document.querySelector(`[data-target="${target}"]`);
  el?.setAttribute('data-hw-pressed', '');
  feedback(el, label);
  await a.click(target);
  el?.removeAttribute('data-hw-pressed');
  act();
}

/*
 * How a press on the controller shows, picked by the site's widget (being
 * tried; one will stay):
 *   shadow  a fingertip's soft shadow on the key (the touch cursor)
 *   pad     a frosted pad of light pressing in, a finger without the finger
 *   halo    no finger: the key's light throws a ring across the faceplate
 *   cable   no finger: a pulse runs up the lead toward the computer
 *   label   no finger: a small caption at the press, what the key just sent
 */
let inputStyle = new URLSearchParams(location.search).get('input') ?? 'shadow';
function setInput(style) {
  inputStyle = style;
  document.getElementById('hero').dataset.input = style;
}
window.addEventListener('message', (e) => {
  if (e.data?.interlude === 'input') setInput(e.data.style);
});
queueMicrotask(() => setInput(inputStyle));

function spawn(cls, x, y, text) {
  const hero = document.getElementById('hero');
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (text) el.textContent = text;
  hero.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
function feedback(el, label) {
  if (!el) return;
  const h = document.getElementById('hero').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2 - h.left;
  const y = r.top + r.height / 2 - h.top;
  if (inputStyle === 'halo') spawn('fx-halo', x, y);
  if (inputStyle === 'label' && label) spawn('fx-label', x, r.top - h.top - 12, label);
  if (inputStyle === 'cable') {
    const cable = document.querySelector('.hw-cable');
    cable?.classList.remove('pulse');
    void cable?.offsetWidth;
    cable?.classList.add('pulse');
  }
}

const mouse = {
  sync: (a, d) => press(a, $('.btn.sync', deckEl(d))),
  play: (a, d) => press(a, $('.btn.play', deckEl(d))),
  crossfade: (a, to) => crossfade(a, to),
  // A row is pressed in the space between the artist and the BPM, clear of its words.
  load: (a, d, row) => press(a, row, () => doubleClick(row), { double: true }, spot(row, 0.66, 0.55)),
};

const controller = {
  sync: (a, d) => hwPress(a, `c-sync-${d}`, () => $('.btn.sync', deckEl(d)).click(), `Sync → Deck ${'AB'[d]}`),
  play: (a, d) => hwPress(a, `c-play-${d}`, () => $('.btn.play', deckEl(d)).click(), `${engine.decks[d].playing ? 'Pause' : 'Play'} → Deck ${'AB'[d]}`),
  async crossfade(a, to) {
    const r = a.rect('c-xf');
    const xf = engine.mixer?.crossfader ?? 0;
    const y = r.y + r.height / 2;
    await a.move({ x: r.x + ((xf + 1) / 2) * r.width, y });
    feedback($('[data-target="c-xf-cap"]'), `Crossfader → Deck ${to < 0 ? 'A' : 'B'}`);
    await a.drag({ x: r.x + ((to + 1) / 2) * r.width, y }, (at) => {
      control({ type: 'setCrossfader', value: Math.max(-1, Math.min(1, ((at.x - r.x) / r.width) * 2 - 1)) });
    }, { duration: 2200, path: straight });
    control({ type: 'setCrossfader', value: to });
  },
  async load(a, d, row) {
    // Turn the browse knob to the record, then press Load on the free deck.
    const knob = $('[data-target="c-browse"]');
    await hwPress(a, 'c-browse', () => {
      knob?.toggleAttribute('data-turned');
      row.scrollIntoView({ block: 'nearest' });
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    }, `Browse → ${row.textContent.trim().split(/\s{2,}|\n/)[0]}`);
    await a.wait(500);
    await hwPress(a, `c-load-${d}`, () => doubleClick(row), `Load → Deck ${'AB'[d]}`);
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
    feedback(hw, `Low EQ → kill, Deck ${'AB'[d]}`);
    let steps = 0;
    await a.drag({ x: from.x, y: from.y + 40 }, (at) => {
      const t = Math.min(1, (at.y - from.y) / 40);
      hw.style.rotate = `${-t * 150}deg`;
      while (steps < Math.floor(t * 12)) { key(app, 'ArrowDown'); steps++; }
    }, { duration: 1000, path: straight });
    key(app, 'Home');
  },
  async resetLow(a, d) {
    const hw = document.querySelector(`[data-hw="low-${d}"]`);
    if (!hw) return;
    hw.setAttribute('data-target', `c-low-${d}`);
    await a.move(`c-low-${d}`);
    const r = a.rect(`c-low-${d}`);
    const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 + 40 };
    feedback(hw, `Low EQ → reset, Deck ${'AB'[d]}`);
    await a.drag({ x: from.x, y: from.y - 40 }, (at) => {
      hw.style.rotate = `${-Math.max(0, Math.min(1, (at.y - (from.y - 40)) / 40)) * 150}deg`;
    }, { duration: 700, path: straight });
    hw.style.rotate = '';
    lowEq(d).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  },
  async loop(a, d, on) {
    const pad = document.querySelector(`[data-hw="pad-${d}-3"]`);
    if (!pad) return;
    await hwPress(a, `c-pad-${d}-3`, () => {
      const l = loopOf(d);
      if (l && (l.getAttribute('aria-pressed') === 'true') !== on) l.click();
      pad.toggleAttribute('data-lit', on);
    }, on ? `Loop 4 beats → Deck ${'AB'[d]}` : `Loop off → Deck ${'AB'[d]}`);
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
async function transition(a) {
  await ready;
  // A controller that has just risen into view settles before it's played.
  if (arrived || (mode === 'controller' && a.layout && !$('.hw[data-shown]'))) {
    arrived = false;
    await a.wait(1100);
  }
  const playing = [0, 1].filter((d) => engine.decks[d].playing);
  const xf = engine.mixer?.crossfader ?? 0;
  // The deck the crowd hears, and the other one.
  const from = playing.length === 2 ? (xf <= 0 ? 0 : 1) : playing[0] ?? 0;
  const to = 1 - from;
  const f = features();
  const stemsAndBass = round++ % 2 === 0;

  // An empty deck gets a record first.
  if (!engine.decks[to].loaded) {
    a.mark('load');
    const row = rowByTitle(SET[nextInSet++ % SET.length]);
    if (row) await hands().load(a, to, row);
    await a.wait(1600);
  }

  if (!engine.decks[to].playing) {
    // Sync the waiting deck to the one playing: the tempo jumps, the pitch
    // fader moves, the beats fall into line.
    a.mark('sync');
    await hands().sync(a, to);
    await a.wait(1300);

    // Mute its vocals so they don't clash while both play.
    if (stemsAndBass && f.muteVocals) {
      a.mark('stems');
      await f.muteVocals(a, to, true);
      await a.wait(700);
    }

    // Start it, on the beat.
    a.mark('play');
    await hands().play(a, to);
    await a.wait(1000);
  }

  if (stemsAndBass) {
    // Take the bass out of the old record, so the two basslines never fight.
    a.mark('eq');
    await f.killLow?.(a, from);
    await a.wait(500);
  } else if (f.loop) {
    // Hold the new record on a four-beat loop while it comes in.
    a.mark('loop');
    await f.loop(a, to, true);
    await a.wait(900);
  }

  // Bring it in.
  a.mark('crossfade');
  await hands().crossfade(a, to === 0 ? -1 : 1);
  await a.wait(500);

  if (stemsAndBass && f.muteVocals) {
    // And now its vocals.
    a.mark('stems');
    await f.muteVocals(a, to, false);
    await a.wait(700);
  } else if (!stemsAndBass) {
    // Let the loop go, and send the old record out on an echo.
    await f.loop?.(a, to, false);
    await a.wait(400);
    if (f.echo) {
      a.mark('fx');
      await f.echo(a, from, true);
      await a.wait(900);
    }
  }

  // Stop the record that went out.
  a.mark('stop');
  await hands().play(a, from);
  await a.wait(600);

  // Put its channel back as it was: EQ to the middle, echo off.
  if (stemsAndBass) await f.resetLow?.(a, from);
  else await f.echo?.(a, from, false);
  await a.wait(400);

  // And put the next one on.
  a.mark('load');
  const row = rowByTitle(SET[nextInSet++ % SET.length]);
  if (row) await hands().load(a, from, row);
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
