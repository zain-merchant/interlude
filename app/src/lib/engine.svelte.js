// Live engine state for the UI. One animation-frame loop polls the engine
// and drives every waveform, so all visuals move in lockstep.

import { backend } from './backend.js';

const emptyDeck = () => ({
  loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, speed: 1, bpm: 0, generation: 0, peak: 0,
});

export const engine = $state({
  decks: [emptyDeck(), emptyDeck()],
  /** Meter levels with peak-hold decay, 0..1. */
  deckLevels: [0, 0],
  masterLevels: [0, 0],
  outputName: '',
});

/** Loaded track info and waveform bytes per deck. */
export const tracks = $state([null, null]);

/**
 * Smoothed play positions for drawing. The engine reports position once
 * per audio block (~10 ms), which looks jittery at 120 Hz, so we run our
 * own clock and gently steer it towards the engine's.
 */
export const displayPos = [0, 0];

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
        for (let i = 0; i < 2; i++) engine.deckLevels[i] = Math.max(s.deckPeaks[i], engine.deckLevels[i] * 0.86);
        for (let i = 0; i < 2; i++) engine.masterLevels[i] = Math.max(s.masterPeak[i], engine.masterLevels[i] * 0.86);
      })
      .catch(() => {})
      .finally(() => (polling = false));
  }

  for (let i = 0; i < 2; i++) {
    const d = engine.decks[i];
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
  backend.outputName().then((n) => (engine.outputName = n));
  requestAnimationFrame(frame);
}

/** Loads a library track into a deck. */
export async function loadTrack(deck, item) {
  const info = await backend.loadTrack(deck, item.path);
  const bins = await backend.waveform(deck);
  tracks[deck] = { ...info, title: item.title || info.title, artist: item.artist ?? '', bins };
  displayPos[deck] = 0;
}

export const control = (cmd) => backend.control(cmd).catch((e) => console.error(e));
