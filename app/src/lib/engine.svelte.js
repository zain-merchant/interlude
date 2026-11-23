// Live engine state for the UI. One animation-frame loop polls the engine
// and drives every waveform, so all visuals move in lockstep.

import { backend } from './backend.js';
import { autoGain } from './autogain.svelte.js';

const emptyDeck = () => ({
  loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, speed: 1, bpm: 0, key: null, keylock: false, synced: false, keyShift: 0, generation: 0, peak: 0,
  hotCues: Array(8).fill(null), loopIn: null, loopOut: null, looping: false, loopBeats: 4, stems: 0b1111,
  slip: false, slipPosition: null,
});

export const engine = $state({
  decks: [emptyDeck(), emptyDeck()],
  /** Meter levels with peak-hold decay, 0..1. */
  deckLevels: [0, 0],
  masterLevels: [0, 0],
  /** How far the master limiter is turning the mix down, in dB, held briefly so it can be seen. */
  limiting: 0,
  /** Crossfader, cue mix and master gain as the engine has them (null on engines that don't report them). */
  mixer: null,
  /** The sampler's level and slots, as the engine reports them (null on engines without one). */
  sampler: null,
  /**
   * Each deck's stems: { state, ready, error }, where state is off,
   * needsModel, starting, splitting, ready or failed and ready is the share
   * of the track split so far. Null on engines without stems.
   */
  stems: null,
  /** The set recording, as the engine reports it (null on engines that can't record). */
  recording: null,
  /**
   * The audio output: { state: 'connected', device, sampleRate },
   * { state: 'lost', device, fallback } while waiting for a device that went
   * away, or { state: 'none' } when running silently. Null until known.
   */
  audio: null,
});

/** Loaded track info and waveform bytes per deck. */
export const tracks = $state([null, null]);

/**
 * Smoothed play positions for drawing. The engine reports position once
 * per audio block (~10 ms), which looks jittery at 120 Hz, so we run our
 * own clock and gently steer it towards the engine's.
 */
export const displayPos = [0, 0];

/**
 * The slip play head, smoothed the same way (null while slip isn't
 * holding). It keeps time at the deck's rate whatever the deck is doing.
 */
export const displaySlip = [null, null];

/**
 * Decks being scrubbed by hand. While the pointer is down the drawn
 * position follows the pointer, not the engine; after release it waits
 * for the engine to catch up so a stale poll can't snap it back.
 */
const scrubs = [null, null];

const frameListeners = new Set();

/** Calls `fn(now)` every animation frame. Returns an unsubscribe function. */
export function onFrame(fn) {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}

/**
 * Copies `src` into the reactive `target` field by field, writing only what
 * changed. Replacing a whole deck object every frame would wake every piece
 * of UI that reads any of its fields; this wakes only the ones whose value
 * moved (mostly the play position). Returns the value to store when `target`
 * can't be patched in place (a different shape, or not an object).
 */
function patch(target, src) {
  if (target === null || src === null || typeof target !== 'object' || typeof src !== 'object' || Array.isArray(target) !== Array.isArray(src)) {
    return src;
  }
  if (Array.isArray(src) && target.length !== src.length) return src;
  for (const k in src) {
    const v = src[k];
    const old = target[k];
    // Object.is rather than ===: these compare reactive proxies with plain
    // values, which Svelte warns about for ===.
    if (Object.is(old, v)) continue;
    const next = patch(old, v);
    if (!Object.is(next, old)) {
      target[k] = next;
      changed = true;
    }
  }
  if (!Array.isArray(src)) {
    for (const k in target) {
      if (!(k in src)) {
        delete target[k];
        changed = true;
      }
    }
  }
  return target;
}

/** Sets `obj[key]` to `value`, patching in place where it can. */
function update(obj, key, value) {
  const old = obj[key];
  if (Object.is(old, value)) return;
  const next = patch(old, value);
  if (!Object.is(next, old)) {
    obj[key] = next;
    changed = true;
  }
}

/** Set by `patch` and `update` when they write anything. */
let changed = false;

/**
 * While nothing plays, nothing is being dragged and nothing has changed
 * for IDLE_AFTER polls, the frame loop stops and the engine is polled on a
 * timer every IDLE_POLL_MS instead. A running animation-frame loop keeps
 * the browser rendering every frame even when nothing on screen moves,
 * which on macOS costs about a third of a core across the app, WebKit and
 * GPU processes. Any change (a controller fader, a key press), anything
 * playing, or any input goes straight back to the frame loop.
 */
const IDLE_POLL_MS = 50;
/** Unchanged polls in a row before going idle. */
const IDLE_AFTER = 30;
let quietPolls = 0;
/** Meter levels below this (-60 dBFS) show as empty, so settle them at 0. */
const SILENT = 1e-3;
const decay = (peak, level) => {
  const l = Math.max(peak, level * 0.86);
  return l < SILENT ? 0 : l;
};

let polling = false;
let lastFrame = performance.now();
/** True while the frame loop is stopped and the idle timer polls. */
let idle = false;
let idleTimer = null;

function poll() {
  if (polling) return;
  polling = true;
  backend
    .state()
    .then((s) => {
      changed = false;
      for (let i = 0; i < 2; i++) update(engine.decks, i, s.decks[i]);
      update(engine, 'mixer', s.mixer ?? null);
      update(engine, 'recording', s.recording ?? null);
      update(engine, 'sampler', s.sampler ?? null);
      update(engine, 'stems', s.stems ?? null);
      update(engine, 'audio', s.audio ?? null);
      for (let i = 0; i < 2; i++) update(engine.deckLevels, i, decay(s.deckPeaks[i], engine.deckLevels[i]));
      for (let i = 0; i < 2; i++) update(engine.masterLevels, i, decay(s.masterPeak[i], engine.masterLevels[i]));
      const lim = Math.max(s.limiting ?? 0, engine.limiting * 0.95);
      update(engine, 'limiting', lim < 0.1 ? 0 : lim);
      const playing = s.decks.some((d) => d.playing) || s.recording?.active || s.sampler?.slots.some((x) => x.playing);
      quietPolls = changed || playing ? 0 : quietPolls + 1;
      if (idle && quietPolls === 0) wake();
    })
    .catch(() => {})
    .finally(() => (polling = false));
}

function idleTick() {
  idleTimer = setTimeout(idleTick, IDLE_POLL_MS);
  poll();
}

/** Restarts the frame loop if it's idle, and keeps it running a while. */
export function wake() {
  quietPolls = 0;
  if (!idle) return;
  idle = false;
  clearTimeout(idleTimer);
  idleTimer = null;
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  poll();

  for (let i = 0; i < 2; i++) {
    const d = engine.decks[i];
    const s = scrubs[i];
    if (d.slipPosition == null || displaySlip[i] == null) displaySlip[i] = d.slipPosition ?? null;
    else {
      const ahead = displaySlip[i] + dt * d.rate;
      const err = d.slipPosition - ahead;
      displaySlip[i] = Math.abs(err) > 0.08 ? d.slipPosition : ahead + err * 0.15;
    }
    if (s) {
      if (s.dragging) continue;
      if (Math.abs(d.position - displayPos[i]) > 0.25 && now < s.until) {
        if (d.playing) displayPos[i] += dt * d.speed;
        continue;
      }
      scrubs[i] = null;
    }
    if (d.playing) {
      displayPos[i] += dt * d.speed;
      const err = d.position - displayPos[i];
      displayPos[i] = Math.abs(err) > 0.08 ? d.position : displayPos[i] + err * 0.15;
    } else {
      displayPos[i] = d.position;
    }
  }

  for (const fn of frameListeners) fn(now);

  const still = quietPolls >= IDLE_AFTER && !scrubs[0] && !scrubs[1] && !engine.decks.some((d) => d.playing);
  if (still) {
    idle = true;
    idleTimer = setTimeout(idleTick, IDLE_POLL_MS);
  } else {
    requestAnimationFrame(frame);
  }
}

export function startEngineLoop() {
  requestAnimationFrame(frame);
  // Beat This! refines a deck's grid in the background after it loads.
  backend.onDeckBeatgrid?.(({ deck, path, beatgrid }) => {
    const t = tracks[deck];
    if (t && t.path === path && !t.gridLocked) {
      tracks[deck] = { ...t, beatgrid };
      wake();
    }
  });
  // Input can change what's drawn (zoom, resize, settings) without
  // changing engine state, so any of it restarts the frame loop.
  for (const type of ['pointerdown', 'keydown', 'wheel', 'resize', 'focus']) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', wake);
}

// Fixing a beatgrid by hand. Beat 0 starts a bar, so it's kept within one
// bar of the start; each change is saved, locked against analysis, and
// can be undone.
const barLen = (bpm) => (4 * 60) / bpm;
const wrap = (t, len) => ((t % len) + len) % len;

/**
 * The grid after `op`: 'halve' or 'double' the tempo, put the 'downbeat'
 * at the play head, 'nudge' the grid by `value` seconds, or set the tempo
 * to `value` 'bpm' keeping the bar at the play head where it is.
 * @param {import('./backend.js').Beatgrid | null} g
 * @param {number} pos play head, in seconds
 */
export function nextGrid(g, op, pos, value = 0) {
  switch (op) {
    case 'halve': return g && { bpm: g.bpm / 2, firstBeat: wrap(g.firstBeat, barLen(g.bpm / 2)) };
    case 'double': return g && { bpm: g.bpm * 2, firstBeat: wrap(g.firstBeat, barLen(g.bpm * 2)) };
    case 'downbeat': return g && { bpm: g.bpm, firstBeat: wrap(pos, barLen(g.bpm)) };
    case 'nudge': return g && { bpm: g.bpm, firstBeat: wrap(g.firstBeat + value, barLen(g.bpm)) };
    case 'bpm': {
      if (!(value >= 20 && value <= 400)) return null;
      const bar = g && barLen(g.bpm);
      const anchor = g ? g.firstBeat + Math.floor((pos - g.firstBeat) / bar) * bar : pos;
      return { bpm: value, firstBeat: wrap(anchor, barLen(value)) };
    }
  }
  return null;
}

/** Sets a deck's beatgrid (null: back to the detected one) and shows it. */
export async function setGrid(deck, grid) {
  const info = await backend.setBeatgrid(deck, grid);
  if (tracks[deck]) tracks[deck] = { ...tracks[deck], beatgrid: info.beatgrid, gridLocked: info.gridLocked };
  wake();
}

/** Loads a library track into a deck. */
export async function loadTrack(deck, item) {
  const info = await backend.loadTrack(deck, item.path, autoGain.on);
  const bins = await backend.waveform(deck);
  tracks[deck] = { ...info, title: item.title || info.title, artist: item.artist ?? '', bins };
  displayPos[deck] = 0;
  wake();
}

/** Empties a deck. */
export async function ejectTrack(deck) {
  await backend.control({ type: 'eject', deck });
  tracks[deck] = null;
  displayPos[deck] = 0;
  wake();
}

/** What a deck holds now, so it can be put back: the track, where it was and its cue point. */
export function deckSnapshot(deck) {
  const t = tracks[deck];
  if (!t) return null;
  const d = engine.decks[deck];
  return { item: { path: t.path, title: t.title, artist: t.artist }, position: d.position, cue: d.cue };
}

/** Puts a deck back the way `deckSnapshot` found it (null empties it). */
export async function restoreDeck(deck, snap) {
  if (!snap) return ejectTrack(deck);
  await loadTrack(deck, snap.item);
  await backend.control({ type: 'setCue', deck, seconds: snap.cue });
  await backend.control({ type: 'seek', deck, seconds: snap.position });
  displayPos[deck] = snap.position;
}

export const control = (cmd) => {
  // Show the result of a command at full rate.
  wake();
  return backend.control(cmd).catch((e) => console.error(e));
};

/**
 * Starts a hand scrub. With `scratch`, the deck plays what passes under the
 * hand, like a record: forwards, backwards, and silent when the hand is
 * still. A playing deck is held while scratching and spins back up on
 * release (the engine does this). Without it, the scrub seeks silently and
 * a playing deck pauses until the scrub ends, for jumping around the overview.
 */
export function scrubStart(deck, { scratch = false } = {}) {
  if (scratch) {
    scrubs[deck] = { dragging: true, scratch: true, resume: false, until: 0, last: null };
    control({ type: 'scratchStart', deck });
    return;
  }
  const resume = engine.decks[deck].playing || !!scrubs[deck]?.resume;
  if (engine.decks[deck].playing) control({ type: 'pause', deck });
  scrubs[deck] = { dragging: true, scratch: false, resume, until: 0 };
}

/**
 * Moves a scrubbing deck to `seconds`. `time` is the input event's
 * timestamp in ms, which lets the engine play the motion smoothly however
 * unevenly the messages reach it.
 */
export function scrubTo(deck, seconds, time = performance.now()) {
  const t = tracks[deck];
  const s = scrubs[deck];
  if (!t || !s?.dragging) return;
  seconds = Math.max(0, Math.min(t.duration, seconds));
  displayPos[deck] = seconds;
  if (s.scratch) {
    const sinceLast = s.last == null ? null : Math.max(0, (time - s.last) / 1000);
    s.last = time;
    control({ type: 'scratchTo', deck, seconds, sinceLast });
  } else {
    control({ type: 'seek', deck, seconds });
  }
}

export function scrubEnd(deck) {
  const s = scrubs[deck];
  if (!s?.dragging) return;
  s.dragging = false;
  s.until = performance.now() + 400;
  if (s.scratch) control({ type: 'scratchEnd', deck });
  else if (s.resume) control({ type: 'play', deck });
}
