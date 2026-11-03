// Live engine state for the UI. One animation-frame loop polls the engine
// and drives every waveform, so all visuals move in lockstep.

import { backend } from './backend.js';

const emptyDeck = () => ({
  loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, speed: 1, bpm: 0, key: null, keylock: false, generation: 0, peak: 0,
  hotCues: Array(8).fill(null), loopIn: null, loopOut: null, looping: false, loopBeats: 4,
});

export const engine = $state({
  decks: [emptyDeck(), emptyDeck()],
  /** Meter levels with peak-hold decay, 0..1. */
  deckLevels: [0, 0],
  masterLevels: [0, 0],
  /** Crossfader, cue mix and master gain as the engine has them (null on engines that don't report them). */
  mixer: null,
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

let polling = false;
let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!polling) {
    polling = true;
    backend
      .state()
      .then((s) => {
        for (let i = 0; i < 2; i++) engine.decks[i] = s.decks[i];
        engine.mixer = s.mixer ?? null;
        engine.recording = s.recording ?? null;
        engine.audio = s.audio ?? null;
        for (let i = 0; i < 2; i++) engine.deckLevels[i] = Math.max(s.deckPeaks[i], engine.deckLevels[i] * 0.86);
        for (let i = 0; i < 2; i++) engine.masterLevels[i] = Math.max(s.masterPeak[i], engine.masterLevels[i] * 0.86);
      })
      .catch(() => {})
      .finally(() => (polling = false));
  }

  for (let i = 0; i < 2; i++) {
    const d = engine.decks[i];
    const s = scrubs[i];
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
  requestAnimationFrame(frame);
}

export function startEngineLoop() {
  requestAnimationFrame(frame);
}

/** Loads a library track into a deck. */
export async function loadTrack(deck, item) {
  const info = await backend.loadTrack(deck, item.path);
  const bins = await backend.waveform(deck);
  tracks[deck] = { ...info, title: item.title || info.title, artist: item.artist ?? '', bins };
  displayPos[deck] = 0;
}

/** Empties a deck. */
export async function ejectTrack(deck) {
  await backend.control({ type: 'eject', deck });
  tracks[deck] = null;
  displayPos[deck] = 0;
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

export const control = (cmd) => backend.control(cmd).catch((e) => console.error(e));

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
