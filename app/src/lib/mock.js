// A simulated engine for running the UI in a plain browser. It mirrors the
// real engine's behaviour closely enough for design work: positions advance,
// cue works CDJ-style, meters move, and tracks have believable waveforms.

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
    loaded: false, playing: false, position: 0, duration: 0, cue: 0, rate: 1, bend: 0, bpm: 0, firstBeat: 0,
    generation: 0, previewing: false, waveform: null, fader: 1, peak: 0,
  }));
  let folders = FOLDERS.map((f) => `/Music/${f}`);
  let xf = 0;
  let last = performance.now();
  // Simulated audio device, so the disconnect banner can be tried in a
  // browser: run __mockAudio.lose() and __mockAudio.restore() in the console.
  /** @type {any} */
  let audio = { state: 'connected', device: 'Browser preview', sampleRate: 48000 };
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
      if (!d.playing) continue;
      d.position += dt * (d.rate + d.bend);
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
      case 'play': if (d.loaded) { d.playing = true; d.previewing = false; } break;
      case 'pause': d.playing = false; d.previewing = false; break;
      case 'togglePlay':
        if (d.playing && !d.previewing) d.playing = false;
        else if (d.loaded) { d.playing = true; d.previewing = false; }
        break;
      case 'cuePress':
        if (!d.loaded) break;
        if (d.playing && !d.previewing) { d.position = d.cue; d.playing = false; break; }
        if (Math.abs(d.position - d.cue) > 0.001) d.cue = d.position;
        d.playing = true; d.previewing = true;
        break;
      case 'cueRelease':
        if (d.previewing) { d.previewing = false; d.playing = false; d.position = d.cue; }
        break;
      case 'seek': d.position = Math.max(0, Math.min(d.duration, cmd.seconds)); break;
      case 'setCue': if (d.loaded) d.cue = Math.max(0, Math.min(d.duration, cmd.seconds)); break;
      case 'eject':
        Object.assign(d, { loaded: false, playing: false, previewing: false, position: 0, cue: 0, duration: 0, bpm: 0, waveform: null });
        d.generation++;
        break;
      case 'setRate': d.rate = cmd.rate; break;
      case 'setBend': d.bend = cmd.bend; break;
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
          cue: d.cue, rate: d.rate, speed: d.rate + d.bend, bpm: d.bpm, generation: d.generation, peak: 0,
        })),
        deckPeaks,
        masterPeak: [Math.min(1, m), Math.min(1, m * 0.97)],
        audio,
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
        loaded: true, playing: false, position: 0, cue: 0, duration, bpm, firstBeat: 0,
        waveform: fakeWaveform(seed, duration, bpm), generation: d.generation + 1,
      });
      return {
        title: t.title, path, duration, sampleRate: 44100,
        binsPerSec: BINS_PER_SEC, binCount: d.waveform.length / 4,
        beatgrid: { bpm, firstBeat: 0 },
      };
    },
    waveform: async (deck) => decks[deck].waveform,
    libraryFolders: async () => [...folders],
    addFolder: async (path) => {
      if (path && !folders.includes(path)) folders.push(path);
      return [...folders];
    },
    useDefaultOutput: async () => {
      if (audio.state === 'lost') audio = { state: 'connected', device: audio.fallback, sampleRate: 48000 };
    },
    removeFolder: async (path) => {
      folders = folders.filter((f) => f !== path);
      return [...folders];
    },
    libraryTracks: async (folder) =>
      tracks.filter((t) => (folder ? [folder] : folders).some((f) => t.path.startsWith(f + '/'))),
    pickFolder: async () => null,
  };
}
