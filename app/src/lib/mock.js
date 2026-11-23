// A simulated engine for running the UI in a plain browser. It mirrors the
// real engine's behaviour closely enough for design work: positions advance,
// cue works CDJ-style, hot cues, loops and beat jumps behave like the
// engine's, meters move, and tracks have believable waveforms.

import { playingKey, shiftTo } from './key.js';

const BINS_PER_SEC = 172.27;

const ARTISTS = ['Nova Reyes', 'Kite Theory', 'Mara Lune', 'Deepfield', 'Oskar Velt', 'Juno Hale', 'Sable & Ash', 'Low Orbit'];
const TITLES = [
  'Afterglow', 'Night Shift', 'Paper Planes', 'Lucid', 'Concrete Garden', 'Slow Burn', 'Signal Fire', 'Halcyon',
  'Glass Rooms', 'Undertow', 'Satellite Heart', 'Warehouse 9', 'Late Bloom', 'Vapour Trails', 'Tidal', 'Neon Psalm',
  'Second Wind', 'Monochrome', 'Fever Dream', 'Static Bloom', 'Low Tide', 'Overpass', 'Kinetic', 'Shoreline',
];
const FOLDERS = ['House', 'Techno', 'Disco Edits', 'Warmup'];

/** Deterministic pseudo-random numbers so mock tracks look the same each run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Builds a dance-music-shaped waveform: intro, first groove, build,
 * drop, breakdown, build, second drop, outro. A kick on every beat in the
 * grooves, off-beat hats, a snare on 2 and 4, and pads that follow the bars.
 * Sections land on 8-bar boundaries, as phrases do.
 */
function fakeWaveform(seed, duration, bpm) {
  const r = rng(seed);
  const n = Math.floor(duration * BINS_PER_SEC);
  const out = new Uint8Array(n * 4);
  const beat = 60 / bpm;
  const phrase = beat * 32;
  const at = (f) => Math.round((duration * f) / phrase) * phrase;
  const S = (from, to, o) => ({ from, to, energy: 1, kick: true, bass: true, hats: true, pad: 0.5, air: 0.3, ...o });
  const j = () => (r() - 0.5) * 0.06;
  const sections = [
    S(0, at(0.07 + j()), { energy: 0.55, bass: false, pad: 0.2, hats: false }),
    S(at(0.07), at(0.16 + j()), { energy: 0.8, pad: 0.35 }),
    S(at(0.16), at(0.22), { energy: 0.9, ramp: true, kick: false, bass: false, pad: 0.9, air: 0.8 }),
    S(at(0.22), at(0.44 + j()), { energy: 1, pad: 0.6, air: 0.5 }),
    S(at(0.44), at(0.53), { energy: 0.6, kick: false, bass: false, hats: false, pad: 1, air: 0.4 }),
    S(at(0.53), at(0.6), { energy: 0.95, ramp: true, kick: false, pad: 0.8, air: 0.9 }),
    S(at(0.6), at(0.88 + j()), { energy: 1, pad: 0.7, air: 0.6 }),
    S(at(0.88), Infinity, { energy: 0.6, pad: 0.15, hats: false, bass: false }),
  ];
  // A slow random walk for the pads, and a level per bar for the chords.
  let walk = 0.5;
  const chord = [];
  for (let b = 0; b < duration / (beat * 4) + 2; b++) chord.push(0.55 + r() * 0.45);
  const q = (x) => Math.round(Math.sqrt(Math.max(0, Math.min(1, x))) * 255);
  for (let i = 0; i < n; i++) {
    const t = i / BINS_PER_SEC;
    const sec = sections.find((s) => t >= s.from && t < s.to) ?? sections[sections.length - 1];
    const p = Math.min(1, (t - sec.from) / Math.max(1, Math.min(sec.to, duration) - sec.from));
    const energy = sec.ramp ? sec.energy * (0.35 + 0.65 * p * p) : sec.energy;
    const bt = t / beat;
    const inBeat = bt - Math.floor(bt);
    const kick = sec.kick ? Math.exp(-inBeat * 9) : 0;
    const bass = sec.bass ? 0.35 + 0.25 * Math.sin(inBeat * Math.PI) : 0;
    const hat = sec.hats ? Math.exp(-((bt + 0.5) % 1) * 22) * 0.9 + Math.exp(-((bt * 4) % 1) * 30) * 0.25 : 0.05;
    walk = Math.min(1, Math.max(0.2, walk + (r() - 0.5) * 0.06));
    const pad = sec.pad * chord[Math.floor(bt / 4) % chord.length] * (0.75 + 0.25 * walk);
    const snare = sec.kick && Math.floor(bt) % 2 === 1 ? Math.exp(-inBeat * 12) * 0.6 : 0;
    const low = Math.min(1, (kick * 0.95 + bass * 0.5) * energy + r() * 0.03);
    const mid = Math.min(1, (pad * 0.7 + snare * 0.5) * energy + r() * 0.05);
    const high = Math.min(1, (hat * 0.6 + sec.air * 0.25 + snare * 0.3) * energy * (0.8 + r() * 0.4));
    out.set([q(Math.max(low, mid, high)), q(low), q(mid), q(high)], i * 4);
  }
  return out;
}

const HOT_CUES = 8;
const freshLoops = () => ({
  hotCues: Array(HOT_CUES).fill(null), previewHot: null, previewReturn: 0,
  loopIn: null, loopOut: null, looping: false, loopBeats: 4,
  slipAt: null, slipHot: null,
});
const beatLen = (d) => 60 / d.bpm;
const clampBeats = (b) => Math.max(1 / 32, Math.min(64, b));

export function createMockBackend() {
  const tracks = [];
  for (let i = 0; i < 48; i++) {
    const r = rng(hash(`track-${i}`));
    const folder = FOLDERS[i % FOLDERS.length];
    const artist = ARTISTS[Math.floor(r() * ARTISTS.length)];
    const title = TITLES[i % TITLES.length] + (i >= TITLES.length ? ' (Extended Mix)' : '');
    tracks.push({
      path: `/Music/${folder}/${artist} - ${title}.mp3`, title, artist, album: '', genre: folder, folder,
      format: i % 5 ? 'MP3' : 'FLAC', missing: i === 47, analysis: null,
    });
  }
  const importListeners = new Set();
  // Playlists and History, in memory for the preview.
  let playlistIds = 2;
  let playlists = [
    { id: 1, name: 'Friday warmup', paths: tracks.slice(0, 6).map((t) => t.path) },
    { id: 2, name: 'Peak time', paths: tracks.slice(10, 14).map((t) => t.path) },
  ];
  const DAY = 24 * 3600 * 1000;
  const sessions = [
    { start: Date.now() - 2 * DAY, paths: tracks.slice(20, 27).map((t) => t.path) },
    { start: Date.now() - 9 * DAY, paths: tracks.slice(30, 35).map((t) => t.path) },
  ];
  const byPaths = (paths) => paths.map((p) => tracks.find((t) => t.path === p)).filter(Boolean).map((t) => ({ ...t }));
  // Saved cue points by path, like the real library: kept when a track
  // leaves a deck and put back when it's loaded again.
  const savedCues = new Map();
  const keepCues = (d) => {
    if (d.loaded && d.path) {
      savedCues.set(d.path, { cue: d.cue, hotCues: [...d.hotCues], loopIn: d.loopIn, loopOut: d.loopOut });
    }
  };
  // What "analysis" finds for a track: the same numbers loading it gives.
  const summary = (path) => {
    const seed = hash(path);
    return { duration: 300 + Math.floor(rng(seed)() * 180), bpm: 118 + (seed % 12), key: { tonic: seed % 12, minor: seed % 3 !== 0 }, failed: false };
  };
  // Background analysis: one track every 60 ms, reported to listeners.
  const analysisListeners = new Set();
  let analysisQueue = [];
  setInterval(() => {
    const t = analysisQueue.shift();
    if (!t || t.analysis) return;
    t.analysis = summary(t.path);
    for (const fn of analysisListeners) fn({ path: t.path, ...t.analysis });
  }, 60);
  let quantize = true;
  let hotCuePlays = true;
  let cueMix = 0.5;
  let masterDb = 0;
  /** Seconds to the nearest beat, when quantizing. */
  const snap = (d, t) => (quantize && d.bpm ? d.firstBeat + Math.round((t - d.firstBeat) / beatLen(d)) * beatLen(d) : t);
  /** A jump target moved to the play head's place in the beat, when quantizing. */
  const inPhase = (d, to) => {
    if (!quantize || !d.bpm) return to;
    const diff = (d.position - to) / beatLen(d);
    return to + (diff - Math.round(diff)) * beatLen(d);
  };

  const decks = [0, 1].map(() => ({
    loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, bend: 0, bpm: 0, key: null, keylock: false, synced: false, syncRatio: 1, keyShift: 0, firstBeat: 0,
    slip: false,
    generation: 0, previewing: false, scratching: false, waveform: null, fader: 1, peak: 0, path: null, ...freshLoops(),
    filter: 0, fx: { kind: 'echo', on: false, level: 0.5, beats: 1 }, stems: 0b1111, splitFrom: 0, usedAt: null, prepared: 0, preparing: null,
  }));
  // Stems: a pretend model download, and splitting that takes 20 s a track.
  /** @type {{ mode: import('./stemsmodel.js').StemsMode, cacheGb: number, cacheBytes: number }} */
  const stemsCfg = { mode: 'ask', cacheGb: 5, cacheBytes: 1.2e9 };
  // How long a press takes to be heard with nothing prepared: the model
  // loads, then the region at the play head is split.
  const LOAD_MS = 2000;
  const REGION_MS = 2000;
  const MODEL_BYTES = 165_612_636;
  const MODEL_SECS = 15;
  // ?stems=ready starts with the model there; offline drops the connection
  // at 40% until it's tried again; failed fails there; cancelled starts as
  // if an earlier session had cancelled it there; slow takes ten minutes.
  const query = new URLSearchParams(globalThis.location?.search);
  let modelCase = query.get('stems') ?? '';
  // ?mode=fast, efficient or off starts with that chosen; as a first use otherwise.
  stemsCfg.mode = /** @type {any} */ (query.get('mode') ?? stemsCfg.mode);
  /** @type {import('./stemsmodel.js').StemsModel & { at?: number }} */
  let stemsModel = { state: 'missing', done: 0, total: MODEL_BYTES, secondsLeft: null, error: null, mode: stemsCfg.mode };
  if (modelCase === 'ready') stemsModel = { ...stemsModel, state: 'ready', done: MODEL_BYTES, at: 0 };
  if (modelCase === 'cancelled') stemsModel.done = MODEL_BYTES * 0.4;
  let modelAsked = modelCase !== 'cancelled';
  // ?measured=1 has figures from this computer.
  const measured = query.get('measured')
    ? { heard: 4.1, memory: 2.4 }
    : { heard: null, memory: null };
  const modelListeners = new Set();
  const setModel = (change) => {
    stemsModel = { ...stemsModel, secondsLeft: null, error: null, mode: stemsCfg.mode, ...change };
    for (const fn of modelListeners) fn(stemsModel);
    return stemsModel;
  };
  let modelTimer;
  const startModel = () => {
    if (stemsModel.state === 'downloading' || stemsModel.state === 'ready') return stemsModel;
    if (stemsModel.state !== 'missing') modelCase = ''; // trying again works
    clearInterval(modelTimer);
    const rate = MODEL_BYTES / (modelCase === 'slow' ? 600 : MODEL_SECS);
    modelTimer = setInterval(() => {
      const done = Math.min(MODEL_BYTES, stemsModel.done + rate / 4);
      if (modelCase === 'offline' && done > MODEL_BYTES * 0.4) return void (clearInterval(modelTimer), setModel({ state: 'waiting' }));
      if (modelCase === 'failed' && done > MODEL_BYTES * 0.4) {
        clearInterval(modelTimer);
        return void setModel({ state: 'failed', error: "There isn't enough space on the disk. Free up 300 MB." });
      }
      if (done < MODEL_BYTES) return void setModel({ done, secondsLeft: Math.ceil((MODEL_BYTES - done) / rate) });
      clearInterval(modelTimer);
      setModel({ state: 'ready', done, at: performance.now() });
    }, 250);
    return setModel({ state: 'downloading' });
  };
  const stopModel = (done = stemsModel.done) => {
    clearInterval(modelTimer);
    modelAsked = false;
    return setModel({ state: 'missing', done });
  };
  function useStems(d) {
    if (d.usedAt != null || !d.loaded) return;
    d.usedAt = performance.now();
    d.prepared = d.preparing == null ? 0 : d.usedAt - d.preparing;
  }
  const deckStems = (d) => {
    const is = (state, ready = 0, here = false) => ({ state, ready, here, error: null });
    if (!d.loaded || stemsCfg.mode === 'off') return is('off');
    if (stemsModel.state !== 'ready') return is('needsModel');
    if (stemsCfg.mode === 'ask') return is('ask');
    const now = performance.now();
    if (stemsCfg.mode === 'efficient' && d.usedAt == null) return is('onUse');
    // Preparing counts towards the wait for as long as it went on.
    const from = Math.max(stemsModel.at, d.usedAt == null ? d.splitFrom : d.usedAt - d.prepared);
    if (now - from < LOAD_MS) return is('starting');
    const ready = Math.min(1, (now - from - LOAD_MS) / 20000);
    return is(ready >= 1 ? 'ready' : 'splitting', ready, now - from >= LOAD_MS + REGION_MS);
  };
  /** @type {{ active: boolean, started: number, seconds: number, path: string | null }} */
  const rec = { active: false, started: 0, seconds: 0, path: null };
  // Sampler slots: a length, and when the slot was last pressed.
  const samples = Array.from({ length: 8 }, () => ({ duration: 0, started: null }));
  let samplerLevel = 0.8;
  const sampleState = (s) => {
    const t = s.started == null ? 0 : (performance.now() - s.started) / 1000;
    const playing = s.started != null && t < s.duration;
    return { loaded: s.duration > 0, playing, progress: playing ? t / s.duration : 0, duration: s.duration };
  };
  // ?library=empty starts with no music, as on a first launch.
  let folders = query.get('library') === 'empty' ? [] : FOLDERS.map((f) => `/Music/${f}`);
  let xf = 0;
  let last = performance.now();
  // Simulated audio device, so the disconnect banner can be tried in a
  // browser: run __mockAudio.lose() and __mockAudio.restore() in the console.
  /** @type {any} */
  let audio = { state: 'connected', device: 'Browser preview', sampleRate: 48000 };
  /** @type {string | null} */
  /** @type {Record<string, any[]>} */
  const learned = {};
  let learnAt = 0;
  let learnNext = 0;
  let outputChoice = null;
  globalThis.__mockAudio = {
    lose: () => (audio = { state: 'lost', device: 'DDJ-FLX4', fallback: 'MacBook Pro Speakers' }),
    restore: () => (audio = { state: 'connected', device: 'DDJ-FLX4', sampleRate: 48000 }),
  };

  function tick() {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    // A lost device holds every deck where it is, like the real engine.
    if (audio.state === 'lost') return;
    for (const d of decks) {
      if (d.slipAt != null) d.slipAt = Math.min(d.duration, d.slipAt + dt * (d.rate + d.bend));
      if (!d.playing || d.scratching) continue;
      const before = d.position;
      d.position += dt * (d.rate + d.bend);
      if (d.looping && before < d.loopOut && d.position >= d.loopOut) d.position -= d.loopOut - d.loopIn;
      if (d.position >= d.duration) {
        d.position = d.duration;
        d.playing = false;
      }
    }
  }

  function levelAt(d) {
    if (!d.playing || !d.waveform) return 0;
    const i = Math.floor(d.position * BINS_PER_SEC) * 4;
    return ((d.waveform[i] ?? 0) / 255) ** 2;
  }

  // Slip, as the engine does it: whatever interrupts a playing deck starts
  // a shadow play head, and the end of the last interruption goes back to it.
  const DELIBERATE = new Set(['load', 'eject', 'cuePress', 'seek', 'restoreCue']);
  const slipHeld = (d) => d.scratching || d.looping || d.slipHot != null || !d.playing;
  const control = async (cmd) => {
    tick();
    const d = decks[cmd.deck];
    const before = d && { at: d.position, live: d.playing && !d.previewing && !DELIBERATE.has(cmd.type) };
    if (d && ['cuePress', 'seek'].includes(cmd.type)) d.slipAt = null;
    await apply(cmd, d);
    if (!d?.slip || !d.loaded) return;
    if (d.slipAt == null && slipHeld(d) && before.live) d.slipAt = before.at;
    else if (d.slipAt != null && !slipHeld(d)) Object.assign(d, { position: d.slipAt, slipAt: null, playing: true });
  };
  const apply = async (cmd, d) => {
    switch (cmd.type) {
      case 'play': if (d.loaded) { d.playing = true; d.previewing = false; d.previewHot = null; } break;
      case 'pause': d.playing = false; d.previewing = false; d.previewHot = null; break;
      case 'togglePlay':
        if (d.playing && !d.previewing) d.playing = false;
        else if (d.loaded) { d.playing = true; d.previewing = false; d.previewHot = null; }
        break;
      case 'cuePress':
        if (!d.loaded || d.previewHot != null) break;
        if (d.playing && !d.previewing) { d.position = d.cue; d.playing = false; break; }
        if (Math.abs(d.position - d.cue) > 0.001) d.position = d.cue = snap(d, d.position);
        d.playing = true; d.previewing = true;
        break;
      case 'cueRelease':
        if (d.previewing && d.previewHot == null) { d.previewing = false; d.playing = false; d.position = d.cue; }
        break;
      // No audio here: a scratch holds the deck and moves it with the hand.
      case 'scratchStart': d.scratching = true; break;
      case 'scratchTo': if (d.scratching) d.position = Math.max(0, Math.min(d.duration, cmd.seconds)); break;
      case 'scratchEnd': d.scratching = false; break;
      case 'seek':
        d.position = Math.max(0, Math.min(d.duration, cmd.seconds));
        if (d.looping && (d.position < d.loopIn || d.position >= d.loopOut)) d.looping = false;
        break;
      case 'hotCuePress': {
        if (!d.loaded) break;
        let at = d.hotCues[cmd.index];
        if (at == null) { d.hotCues[cmd.index] = snap(d, d.position); break; }
        if (d.playing && !d.previewing) {
          at = inPhase(d, at);
          if (d.slip) d.slipHot = cmd.index;
        } else d.slipAt = null;
        if (d.looping && (at < d.loopIn || at >= d.loopOut)) d.looping = false;
        d.position = at;
        if (d.playing && !d.previewing) break;
        if (hotCuePlays) Object.assign(d, { playing: true, previewing: false, previewHot: null });
        else Object.assign(d, { playing: true, previewing: true, previewHot: cmd.index, previewReturn: at });
        break;
      }
      case 'hotCueRelease':
        if (d.slipHot === cmd.index) d.slipHot = null;
        if (d.previewing && d.previewHot === cmd.index) Object.assign(d, { playing: false, previewing: false, previewHot: null, position: d.previewReturn });
        break;
      case 'hotCueClear': d.hotCues[cmd.index] = null; break;
      case 'loopToggle': {
        if (d.looping) { d.looping = false; break; }
        if (!d.loaded || !d.bpm) break;
        const unit = Math.min(1, d.loopBeats);
        const beat = (d.position - d.firstBeat) / beatLen(d);
        d.loopIn = quantize ? Math.max(0, d.firstBeat + Math.round(beat / unit) * unit * beatLen(d)) : d.position;
        d.loopOut = d.loopIn + d.loopBeats * beatLen(d);
        d.looping = true;
        break;
      }
      case 'loopScale': {
        const beats = clampBeats(d.loopBeats * cmd.factor);
        if (d.looping) {
          const len = (d.loopOut - d.loopIn) * cmd.factor;
          if (len < beatLen(d) / 32 - 1e-9 || d.loopIn + len > d.duration) break;
          d.loopOut = d.loopIn + len;
          if (d.position >= d.loopOut) d.position = d.loopIn + ((d.position - d.loopIn) % len);
        }
        d.loopBeats = beats;
        break;
      }
      case 'reloopExit':
        if (d.looping) d.looping = false;
        else if (d.loopIn != null && d.loopOut != null) { d.looping = true; d.position = Math.max(d.loopIn, d.playing ? inPhase(d, d.loopIn) : d.loopIn); }
        break;
      case 'beatJump': {
        if (!d.loaded || !d.bpm) break;
        let delta = cmd.beats * beatLen(d);
        if (d.looping) {
          delta = Math.max(-d.loopIn, Math.min(d.duration - d.loopOut, delta));
          d.loopIn += delta;
          d.loopOut += delta;
        }
        d.position = Math.max(0, Math.min(d.duration, d.position + delta));
        break;
      }
      case 'setCue': if (d.loaded) d.cue = Math.max(0, Math.min(d.duration, cmd.seconds)); break;
      case 'eject':
        keepCues(d);
        Object.assign(d, { loaded: false, playing: false, previewing: false, scratching: false, synced: false, position: 0, cue: 0, duration: 0, bpm: 0, key: null, waveform: null, stems: 0b1111, ...freshLoops() });
        d.generation++;
        break;
      case 'setRate': {
        // A sync pair shares one tempo while both play, as the engine does.
        d.rate = cmd.rate;
        const o = decks[1 - cmd.deck];
        const live = (x) => x.playing && !x.previewing;
        if (!d.bpm || !o.bpm) break;
        if (o.synced && live(d)) o.rate = (d.bpm * d.rate * o.syncRatio) / o.bpm;
        else if (d.synced && live(d) && live(o)) o.rate = (d.bpm * d.rate) / d.syncRatio / o.bpm;
        break;
      }
      case 'setBend': d.bend = cmd.bend; break;
      case 'setKeylock': d.keylock = cmd.on; break;
      case 'setKeyShift': d.keyShift = Math.max(-12, Math.min(12, Math.round(cmd.semitones))); break;
      case 'keySync': {
        const o = decks[1 - cmd.deck];
        if (!d.key || !o.key) break;
        const mine = playingKey(d.key, d.rate, d.keylock);
        const theirs = playingKey(o.key, o.rate, o.keylock, o.keyShift);
        d.keyShift = shiftTo(mine, theirs);
        break;
      }
      case 'setStems':
        d.stems = cmd.mask & 0b1111;
        if (d.stems !== 0b1111) useStems(d);
        break;
      case 'setSlip': Object.assign(d, { slip: cmd.on }, cmd.on ? {} : { slipAt: null, slipHot: null }); break;
      case 'setFader': d.fader = cmd.value; break;
      case 'sync': {
        const o = decks[1 - cmd.deck];
        if (d.synced || !d.bpm || !o.bpm) { d.synced = false; break; }
        const target = o.bpm * o.rate;
        const options = [target, target * 2, target / 2].map((x) => x / d.bpm);
        d.rate = options.reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a));
        const beat = (x) => ((x.position - x.firstBeat) * x.bpm) / 60;
        let delta = (beat(o) % 1) - (beat(d) % 1);
        delta -= Math.round(delta);
        d.position += (delta * 60) / d.bpm;
        d.syncRatio = [1, 2, 0.5].reduce((a, b) => (Math.abs((d.bpm * d.rate) / target - b) < Math.abs((d.bpm * d.rate) / target - a) ? b : a));
        o.syncRatio = 1 / d.syncRatio;
        d.synced = true;
        break;
      }
      case 'setCrossfader': xf = cmd.value; break;
      case 'setCueMix': cueMix = cmd.value; break;
      case 'setMasterGain': masterDb = cmd.db; break;
      case 'setQuantize': quantize = cmd.on; break;
      case 'setHotCuePlays': hotCuePlays = cmd.on; break;
      case 'setAutoSync': break;
      case 'setFilter': d.filter = cmd.value; break;
      case 'setFxKind': d.fx.kind = cmd.kind; break;
      case 'setFxOn': d.fx.on = cmd.on; break;
      case 'setFxLevel': d.fx.level = cmd.value; break;
      case 'setFxBeats': d.fx.beats = cmd.beats; break;
      case 'samplePlay': if (samples[cmd.slot].duration) samples[cmd.slot].started = performance.now(); break;
      case 'sampleStop': samples[cmd.slot].started = null; break;
      case 'clearSample': samples[cmd.slot] = { duration: 0, started: null }; break;
      case 'setSamplerLevel': samplerLevel = cmd.value; break;
      default: break;
    }
  };

  return {
    control,
    state: async () => {
      tick();
      const deckPeaks = decks.map(levelAt);
      const t = ((xf + 1) / 2) * (Math.PI / 2);
      const m = deckPeaks[0] * decks[0].fader ** 2 * Math.cos(t) + deckPeaks[1] * decks[1].fader ** 2 * Math.sin(t);
      return {
        decks: decks.map((d) => ({
          loaded: d.loaded, playing: d.playing, position: d.position, duration: d.duration,
          cue: d.cue, rate: d.rate, speed: d.rate + d.bend, bpm: d.bpm, key: d.key, keylock: d.keylock, synced: d.synced, keyShift: d.keyShift, generation: d.generation, peak: 0,
          slip: d.slip, slipPosition: d.slipAt,
          hotCues: [...d.hotCues], loopIn: d.loopIn, loopOut: d.loopOut, looping: d.looping, loopBeats: d.loopBeats,
          filter: d.filter, fx: { ...d.fx }, stems: d.stems,
        })),
        stems: decks.map(deckStems),
        deckPeaks,
        mixer: { crossfader: xf, cueMix, masterDb, quantize },
        sampler: { level: samplerLevel, slots: samples.map(sampleState) },
        masterPeak: [Math.min(0.966, m), Math.min(0.966, m * 0.97)],
        limiting: m > 0.966 ? 20 * Math.log10(m / 0.966) : 0,
        audio,
        recording: {
          active: rec.active, path: rec.path, droppedSeconds: 0, error: null,
          seconds: rec.active ? (performance.now() - rec.started) / 1000 : rec.seconds,
        },
      };
    },
    startRecording: async () => {
      if (rec.active) throw new Error('already recording');
      Object.assign(rec, { active: true, started: performance.now(), path: '~/Music/Interlude recordings/Set (preview).wav' });
      return rec.path;
    },
    stopRecording: async () => {
      if (!rec.active) throw new Error('not recording');
      rec.seconds = (performance.now() - rec.started) / 1000;
      rec.active = false;
      return { active: false, seconds: rec.seconds, path: rec.path, droppedSeconds: 0, error: null };
    },
    outputName: async () => 'Browser preview · simulated audio',
    defaultSamples: async () =>
      ['Air horn', 'Siren', 'Kick', 'Clap', 'Snare', 'Rewind', 'Riser', 'Laser'].map((title) => ({ path: `/samples/${title}.wav`, title })),
    pickSample: async () => '/Users/you/Samples/Vocal chop.wav',
    loadSample: async (slot, path) => {
      const duration = 0.6 + (hash(path) % 40) / 10;
      samples[slot] = { duration, started: null };
      return duration;
    },
    preloadTrack: async () => {},
    loadTrack: async (deck, path) => {
      const t = tracks.find((x) => x.path === path) ?? { title: path, path };
      if ('analysis' in t && !t.analysis) {
        t.analysis = summary(path);
        for (const fn of analysisListeners) fn({ path, ...t.analysis });
      }
      const seed = hash(path);
      const r = rng(seed);
      const duration = 300 + Math.floor(r() * 180);
      const bpm = 118 + (seed % 12);
      const d = decks[deck];
      keepCues(d);
      const saved = savedCues.get(path);
      Object.assign(d, {
        loaded: true, playing: false, synced: false, position: saved?.cue ?? 0, cue: 0, duration, bpm, firstBeat: 0, key: { tonic: seed % 12, minor: seed % 3 !== 0 },
        waveform: fakeWaveform(seed, duration, bpm), generation: d.generation + 1, ...freshLoops(), path,
        stems: 0b1111, splitFrom: performance.now(), usedAt: null, prepared: 0, preparing: null, keyShift: 0,
      }, saved ? { ...saved, hotCues: [...saved.hotCues] } : {});
      return {
        title: t.title, path, duration, sampleRate: 44100,
        binsPerSec: BINS_PER_SEC, binCount: d.waveform.length / 4,
        beatgrid: { bpm, firstBeat: 0 },
      };
    },
    setBeatgrid: async (deck, grid) => {
      const d = decks[deck];
      if (!d.loaded) throw new Error('deck is empty');
      const g = grid ?? { bpm: 118 + (hash(d.path) % 12), firstBeat: 0 };
      Object.assign(d, { bpm: g.bpm, firstBeat: g.firstBeat });
      return { beatgrid: g, gridLocked: !!grid };
    },
    waveform: async (deck) => decks[deck].waveform,
    // Muted stems take their share out of the bands they live in.
    stemsWaveform: async (deck, mask) => {
      const w = decks[deck].waveform;
      const on = (i) => (mask >> i) & 1;
      const low = 0.1 + 0.55 * on(2) + 0.35 * on(3);
      const mid = 0.1 + 0.45 * on(0) + 0.45 * on(1);
      const high = 0.1 + 0.3 * on(0) + 0.2 * on(1) + 0.4 * on(3);
      const out = new Uint8Array(w.length);
      for (let i = 0; i < w.length; i += 4) {
        out[i + 1] = w[i + 1] * Math.min(1, low);
        out[i + 2] = w[i + 2] * Math.min(1, mid);
        out[i + 3] = w[i + 3] * Math.min(1, high);
        out[i] = Math.max(out[i + 1], out[i + 2], out[i + 3]);
      }
      return out;
    },
    stemsInfo: async () => ({ ...stemsCfg, modelBytes: 510_700_000, measured, model: stemsModel }),
    setStems: async (change) => {
      for (const k of ['mode', 'cacheGb']) if (change[k] != null) stemsCfg[k] = change[k];
      if (change.mode === 'off' && stemsModel.state !== 'ready') {
        const asked = modelAsked;
        stopModel();
        modelAsked = asked;
      } else if (change.mode && modelAsked) startModel();
      for (const d of decks) d.splitFrom = performance.now();
      setModel({ error: stemsModel.error });
      return { ...stemsCfg, modelBytes: 510_700_000, measured, model: stemsModel };
    },
    prepareStems: async (deck, on) => {
      const d = decks[deck];
      if (on) d.preparing ??= performance.now();
      else d.preparing = null;
    },
    useStems: async (deck) => useStems(decks[deck]),
    clearStemsCache: async () => {
      stemsCfg.cacheBytes = 0;
      return { ...stemsCfg, modelBytes: 510_700_000, measured, model: stemsModel };
    },
    stemsModel: async () => stemsModel,
    onStemsModel: async (fn) => {
      modelListeners.add(fn);
      return () => modelListeners.delete(fn);
    },
    stemsSetupDone: async () => (stemsCfg.mode !== 'off' && modelAsked && stemsModel.state === 'missing' ? startModel() : stemsModel),
    downloadStemsModel: async () => {
      modelAsked = true;
      return startModel();
    },
    cancelStemsModel: async () => (stemsModel.state === 'ready' ? stemsModel : stopModel()),
    removeStemsModel: async () => stopModel(0),
    libraryFolders: async () => [...folders],
    addFolder: async (path) => {
      if (path && !folders.includes(path)) folders.push(path);
      return [...folders];
    },
    useDefaultOutput: async () => {
      if (audio.state === 'lost') audio = { state: 'connected', device: audio.fallback, sampleRate: 48000 };
    },
    audioOutputs: async () => ({ devices: ['DDJ-FLX4', 'MacBook Pro Speakers'], choice: outputChoice }),
    controllers: async () => ({
      connected: [{ port: 'DDJ-FLX4', mapping: 'Pioneer DDJ-FLX4', learned: false },
        ...(learned['Mock Pad MIDI 1']?.length ? [{ port: 'Mock Pad MIDI 1', mapping: 'Mock Pad MIDI 1', learned: true }] : [])],
      ports: ['DDJ-FLX4', 'Mock Pad MIDI 1'],
      learned: Object.keys(learned).filter((p) => learned[p].length),
    }),
    // A pretend control is "moved" a moment after learning starts.
    midiLearnStart: async () => {
      learnAt = Date.now() + 700;
      learnNext = (learnNext + 1) % 128;
    },
    midiLearnPoll: async () => {
      if (!learnAt || Date.now() < learnAt) return null;
      learnAt = 0;
      const button = learnNext % 2 === 0;
      return /** @type {[string, import('./backend.js').Binding]} */ (['Mock Pad MIDI 1', {
        group: '', key: '', kind: button ? 'button' : 'knob', status: button ? 0x90 : 0xb0, number: learnNext,
        description: `${button ? 'note' : 'CC'} 0x${learnNext.toString(16).padStart(2, '0').toUpperCase()}, channel 1`,
      }]);
    },
    midiLearnStop: async () => {
      learnAt = 0;
    },
    learnedMapping: async (port) => (learned[port] ?? []).map((b) => ({ ...b })),
    saveLearnedMapping: async (port, bindings) => {
      learned[port] = bindings.map((b) => ({ ...b }));
      return `~/Library/Application Support/Interlude/controllers/${port} (learned).midi.xml`;
    },
    controllerModels: async () => ['Hercules DJControl Inpulse 200', 'Hercules DJControl MIX', 'Numark Mixtrack Platinum FX', 'Pioneer DDJ-200', 'Pioneer DDJ-400', 'Pioneer DDJ-FLX4'],
    controllersPause: async () => {},
    appVersion: async () => '0.1.2',
    openUrl: async (url) => {
      window.open(url, '_blank', 'noopener');
    },
    setAudioOutput: async (device) => {
      outputChoice = device;
      audio = { state: 'connected', device: device ?? 'DDJ-FLX4', sampleRate: 48000 };
      return audio.device;
    },
    removeFolder: async (path) => {
      folders = folders.filter((f) => f !== path);
      return [...folders];
    },
    libraryTracks: async (folder) => {
      const list = tracks.filter((t) => (folder ? [folder] : folders).some((f) => t.path.startsWith(f + '/')));
      analysisQueue = list.filter((t) => !t.analysis);
      return list.map((t) => ({ ...t }));
    },
    onLibraryAnalysis: async (fn) => {
      analysisListeners.add(fn);
      return () => analysisListeners.delete(fn);
    },
    playlists: async () => playlists.map((p) => ({ id: p.id, name: p.name, count: p.paths.length })),
    createPlaylist: async (name, paths = []) => {
      const id = ++playlistIds;
      playlists.push({ id, name, paths: [...new Set(paths)] });
      return id;
    },
    renamePlaylist: async (id, name) => {
      const p = playlists.find((x) => x.id === id);
      if (p) p.name = name;
    },
    deletePlaylist: async (id) => {
      playlists = playlists.filter((x) => x.id !== id);
    },
    playlistTracks: async (id) => byPaths(playlists.find((x) => x.id === id)?.paths ?? []),
    addToPlaylist: async (id, paths) => {
      const p = playlists.find((x) => x.id === id);
      if (p) p.paths = [...new Set([...p.paths, ...paths])];
    },
    setPlaylistTracks: async (id, paths) => {
      const p = playlists.find((x) => x.id === id);
      if (p) p.paths = [...new Set(paths)];
    },
    historySessions: async () => sessions.map((x) => ({ start: x.start, count: x.paths.length })),
    sessionTracks: async (start) => byPaths(sessions.find((x) => x.start === start)?.paths ?? []),
    onLibraryPlayed: async () => () => {},
    onDeckBeatgrid: async () => () => {},
    importSources: async () => [
      { source: { kind: /** @type {'rekordbox'} */ ('rekordbox'), path: '~/Documents/rekordbox.xml' }, modified: Date.now() - 3 * 3600e3 },
      { source: { kind: /** @type {'serato'} */ ('serato'), path: '/Users/you/Music/_Serato_' }, modified: Date.now() - 26 * 3600e3 },
    ],
    importPreview: async (source) => {
      await new Promise((r) => setTimeout(r, 600));
      if (source.kind === 'serato') return {
        tracks: 1288, missing: 4, withCues: 1102, hotCues: 6120, loops: 140, grids: 1250,
        playlists: [{ name: 'Warm up', count: 64 }, { name: 'Gigs › Saturday', count: 31 }, { name: 'Edits', count: 22 }],
        folders: ['/Users/you/Music/Serato'],
      };
      return {
        tracks: 2431, missing: 12, withCues: 1890, hotCues: 9204, loops: 311, grids: 2398,
        playlists: [{ name: 'Friday', count: 42 }, { name: 'Gigs › Club', count: 88 }],
        folders: ['/Users/you/Music/DJ', '/Volumes/USB/Tracks'],
      };
    },
    importRun: async (source, options) => {
      const total = 2465;
      for (let done = 0; done < total; done += 150) {
        for (const fn of importListeners) fn({ done, total });
        await new Promise((r) => setTimeout(r, 60));
      }
      for (const fn of importListeners) fn({ done: total, total });
      if (options.playlists && !playlists.some((p) => p.name === 'Friday')) playlists.push({ id: ++playlistIds, name: 'Friday', paths: tracks.slice(3, 9).map((t) => t.path) });
      return { tracks: 2431, cues: options.cues ? 1874 : 0, grids: options.grids ? 2390 : 0, playlists: options.playlists ? 2 : 0, kept: 16 };
    },
    onImportProgress: async (fn) => {
      importListeners.add(fn);
      return () => importListeners.delete(fn);
    },
    pickRekordboxXml: async () => '~/Desktop/rekordbox.xml',
    pickSeratoFolder: async () => '/Volumes/USB/_Serato_',
    pickFolder: async () => null,
  };
}
