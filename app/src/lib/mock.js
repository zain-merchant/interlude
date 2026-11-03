// A simulated engine for running the UI in a plain browser. It mirrors the
// real engine's behaviour closely enough for design work: positions advance,
// cue works CDJ-style, hot cues, loops and beat jumps behave like the
// engine's, meters move, and tracks have believable waveforms.

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

/** Builds a dance-music-shaped waveform: intro, build, breakdown, drop, outro. */
function fakeWaveform(seed, duration, bpm) {
  const r = rng(seed);
  const n = Math.floor(duration * BINS_PER_SEC);
  const out = new Uint8Array(n * 4);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const breakdownAt = duration * (0.45 + r() * 0.1);
  const breakdownLen = bar * 16;
  for (let i = 0; i < n; i++) {
    const t = i / BINS_PER_SEC;
    const phase = (t % beat) / beat;
    const kick = Math.exp(-phase * 9);
    const intro = Math.min(1, t / (bar * 16));
    const outro = Math.min(1, (duration - t) / (bar * 16));
    const inBreak = t > breakdownAt && t < breakdownAt + breakdownLen;
    const energy = Math.min(intro, outro);
    const low = inBreak ? 0.05 : (0.35 + 0.6 * kick) * (0.4 + 0.6 * energy);
    const hat = Math.exp(-(((t + beat / 2) % beat) / beat) * 14);
    const mid = ((inBreak ? 0.5 : 0.22) + 0.08 * Math.sin(t * 0.7) + 0.06 * r()) ** 1.6;
    const high = ((inBreak ? 0.08 : 0.05 + 0.25 * hat) * (0.5 + 0.5 * energy) + 0.03 * r()) ** 1.5;
    const peak = Math.min(1, Math.max(low, mid, high) * 1.05);
    const q = (x) => Math.round(Math.sqrt(Math.max(0, Math.min(1, x))) * 255);
    out.set([q(peak), q(low), q(mid * (0.3 + 0.7 * energy)), q(high)], i * 4);
  }
  return out;
}

const HOT_CUES = 8;
const freshLoops = () => ({
  hotCues: Array(HOT_CUES).fill(null), previewHot: null, previewReturn: 0,
  loopIn: null, loopOut: null, looping: false, loopBeats: 4,
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
    tracks.push({ path: `/Music/${folder}/${artist} - ${title}.mp3`, title, artist, folder, format: i % 5 ? 'MP3' : 'FLAC' });
  }

  const decks = [0, 1].map(() => ({
    loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, bend: 0, bpm: 0, key: null, keylock: false, firstBeat: 0,
    generation: 0, previewing: false, scratching: false, waveform: null, fader: 1, peak: 0, ...freshLoops(),
  }));
  let xf = 0;
  let last = performance.now();

  function tick() {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    for (const d of decks) {
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

  const control = async (cmd) => {
    tick();
    const d = decks[cmd.deck];
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
        if (Math.abs(d.position - d.cue) > 0.001) d.cue = d.position;
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
        const at = d.hotCues[cmd.index];
        if (at == null) { d.hotCues[cmd.index] = d.position; break; }
        if (d.looping && (at < d.loopIn || at >= d.loopOut)) d.looping = false;
        d.position = at;
        if (!d.playing || d.previewing) Object.assign(d, { playing: true, previewing: true, previewHot: cmd.index, previewReturn: at });
        break;
      }
      case 'hotCueRelease':
        if (d.previewing && d.previewHot === cmd.index) Object.assign(d, { playing: false, previewing: false, previewHot: null, position: d.previewReturn });
        break;
      case 'hotCueClear': d.hotCues[cmd.index] = null; break;
      case 'loopToggle': {
        if (d.looping) { d.looping = false; break; }
        if (!d.loaded || !d.bpm) break;
        const unit = Math.min(1, d.loopBeats);
        const beat = (d.position - d.firstBeat) / beatLen(d);
        d.loopIn = Math.max(0, d.firstBeat + Math.round(beat / unit) * unit * beatLen(d));
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
        else if (d.loopIn != null && d.loopOut != null) { d.looping = true; d.position = d.loopIn; }
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
      case 'setRate': d.rate = cmd.rate; break;
      case 'setBend': d.bend = cmd.bend; break;
      case 'setKeylock': d.keylock = cmd.on; break;
      case 'setFader': d.fader = cmd.value; break;
      case 'sync': {
        const o = decks[1 - cmd.deck];
        if (!d.bpm || !o.bpm) break;
        const target = o.bpm * o.rate;
        const options = [target, target * 2, target / 2].map((x) => x / d.bpm);
        d.rate = options.reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a));
        const beat = (x) => ((x.position - x.firstBeat) * x.bpm) / 60;
        let delta = (beat(o) % 1) - (beat(d) % 1);
        delta -= Math.round(delta);
        d.position += (delta * 60) / d.bpm;
        break;
      }
      case 'setCrossfader': xf = cmd.value; break;
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
          cue: d.cue, rate: d.rate, speed: d.rate + d.bend, bpm: d.bpm, key: d.key, keylock: d.keylock, generation: d.generation, peak: 0,
          hotCues: [...d.hotCues], loopIn: d.loopIn, loopOut: d.loopOut, looping: d.looping, loopBeats: d.loopBeats,
        })),
        deckPeaks,
        masterPeak: [Math.min(1, m), Math.min(1, m * 0.97)],
      };
    },
    outputName: async () => 'Browser preview · simulated audio',
    loadTrack: async (deck, path) => {
      const t = tracks.find((x) => x.path === path) ?? { title: path, path };
      const seed = hash(path);
      const r = rng(seed);
      const duration = 300 + Math.floor(r() * 180);
      const bpm = 118 + (seed % 12);
      const d = decks[deck];
      Object.assign(d, {
        loaded: true, playing: false, position: 0, cue: 0, duration, bpm, firstBeat: 0, key: { tonic: seed % 12, minor: seed % 3 !== 0 },
        waveform: fakeWaveform(seed, duration, bpm), generation: d.generation + 1, ...freshLoops(),
      });
      return {
        title: t.title, path, duration, sampleRate: 44100,
        binsPerSec: BINS_PER_SEC, binCount: d.waveform.length / 4,
        beatgrid: { bpm, firstBeat: 0 },
      };
    },
    waveform: async (deck) => decks[deck].waveform,
    libraryFolders: async () => FOLDERS.map((f) => `/Music/${f}`),
    addFolder: async () => FOLDERS.map((f) => `/Music/${f}`),
    removeFolder: async () => FOLDERS.map((f) => `/Music/${f}`),
    libraryTracks: async (folder) => (folder ? tracks.filter((t) => t.path.startsWith(folder + '/')) : tracks),
    pickFolder: async () => null,
  };
}
