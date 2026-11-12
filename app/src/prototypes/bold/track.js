// Prototype data: two made-up tracks with a believable structure (intro,
// build, drop, breakdown, drop, outro), a kick on every beat in the drops,
// off-beat hats and a slow-moving mid. Analysed into low/mid/high bands at
// 100 bins per second, like the real analyser. Nothing here touches audio.

export const BINS_PER_SEC = 100;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeTrack({ seed, bpm, length, sections }) {
  const r = rng(seed);
  const n = Math.round(length * BINS_PER_SEC);
  const low = new Float32Array(n), mid = new Float32Array(n), high = new Float32Array(n);
  const beat = 60 / bpm;
  // A smooth random walk for the mid layer (pads, vocals, chords).
  let walk = 0.5;
  const chord = [];
  for (let b = 0; b < length / (beat * 4) + 2; b++) chord.push(0.55 + r() * 0.45);
  for (let i = 0; i < n; i++) {
    const t = i / BINS_PER_SEC;
    const sec = sections.find((s) => t >= s.from && t < s.to) ?? sections[sections.length - 1];
    const p = (t - sec.from) / (sec.to - sec.from);
    const energy = sec.ramp ? sec.energy * (0.35 + 0.65 * p * p) : sec.energy;
    const bt = t / beat;
    const inBeat = bt - Math.floor(bt);
    const kick = sec.kick ? Math.exp(-inBeat * 9) : 0;
    const bass = sec.bass ? 0.35 + 0.25 * Math.sin((bt % 1) * Math.PI) : 0;
    const off = ((bt + 0.5) % 1);
    const hat = sec.hats ? Math.exp(-off * 22) * 0.9 + Math.exp(-((bt * 4) % 1) * 30) * 0.25 : 0.05;
    walk += (r() - 0.5) * 0.06;
    walk = Math.min(1, Math.max(0.2, walk));
    const bar = Math.floor(bt / 4);
    const pad = sec.pad * chord[bar % chord.length] * (0.75 + 0.25 * walk);
    const snare = sec.kick && Math.floor(bt) % 2 === 1 ? Math.exp(-inBeat * 12) * 0.6 : 0;
    low[i] = Math.min(1, (kick * 0.95 + bass * 0.5) * energy + r() * 0.03);
    mid[i] = Math.min(1, (pad * 0.7 + snare * 0.5) * energy + r() * 0.05);
    high[i] = Math.min(1, (hat * 0.6 + sec.air * 0.25 + snare * 0.3) * energy * (0.8 + r() * 0.4));
  }
  return { low, mid, high, n, beat, length };
}

const S = (from, to, o) => ({ from, to, energy: 1, kick: true, bass: true, hats: true, pad: 0.5, air: 0.3, ...o });

export const decks = [
  {
    title: 'Afterglow', artist: 'Deepfield', bpm: 129, key: 'Bm', camelot: '10A', color: 'a',
    data: makeTrack({
      seed: 7, bpm: 129, length: 479,
      sections: [
        S(0, 30, { energy: 0.55, bass: false, pad: 0.2, hats: false }),
        S(30, 75, { energy: 0.8, pad: 0.35 }),
        S(75, 105, { energy: 0.9, ramp: true, kick: false, bass: false, pad: 0.9, air: 0.8 }),
        S(105, 210, { energy: 1, pad: 0.6, air: 0.5 }),
        S(210, 255, { energy: 0.6, kick: false, bass: false, hats: false, pad: 1, air: 0.4 }),
        S(255, 285, { energy: 0.95, ramp: true, kick: false, pad: 0.8, air: 0.9 }),
        S(285, 420, { energy: 1, pad: 0.7, air: 0.6 }),
        S(420, 479, { energy: 0.6, pad: 0.15, hats: false, bass: false }),
      ],
    }),
  },
  {
    title: 'Glass Rooms', artist: 'Kite Theory', bpm: 128, key: 'B♭m', camelot: '3A', color: 'b',
    data: makeTrack({
      seed: 21, bpm: 128, length: 302,
      sections: [
        S(0, 22, { energy: 0.6, pad: 0.1, bass: false }),
        S(22, 70, { energy: 0.85, pad: 0.4, air: 0.2 }),
        S(70, 98, { energy: 0.5, kick: false, bass: false, hats: false, pad: 1, air: 0.6 }),
        S(98, 120, { energy: 0.9, ramp: true, kick: false, bass: false, pad: 0.7, air: 1 }),
        S(120, 230, { energy: 1, pad: 0.55, air: 0.45 }),
        S(230, 302, { energy: 0.7, pad: 0.2, hats: true, bass: false }),
      ],
    }),
  },
];

/** Peak of each band between two times, for a pixel column. */
export function sample(d, t0, t1) {
  let i0 = Math.max(0, Math.floor(t0 * BINS_PER_SEC));
  let i1 = Math.min(d.n, Math.max(i0 + 1, Math.ceil(t1 * BINS_PER_SEC)));
  if (i0 >= d.n || i1 <= 0) return null;
  let l = 0, m = 0, h = 0;
  for (let i = i0; i < i1; i++) {
    if (d.low[i] > l) l = d.low[i];
    if (d.mid[i] > m) m = d.mid[i];
    if (d.high[i] > h) h = d.high[i];
  }
  return [l, m, h];
}

// One shared clock so every view scrolls together. Starts mid-track so the
// waveforms show played and unplayed parts.
export const clock = { t: [101.2, 121.8], playing: [true, true], last: 0 };
let running = false;
const listeners = new Set();
export function onTick(fn) {
  listeners.add(fn);
  if (!running) {
    running = true;
    const step = (now) => {
      const dt = clock.last ? Math.min(0.05, (now - clock.last) / 1000) : 0;
      clock.last = now;
      for (let k = 0; k < 2; k++) if (clock.playing[k]) clock.t[k] = (clock.t[k] + dt) % decks[k].data.length;
      for (const f of listeners) f(now);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return () => listeners.delete(fn);
}

export const fmt = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

export const library = [
  ['Afterglow', 'Deepfield', 129, 'Bm', '7:59', 'House'],
  ['Night Shift', 'Mara Lune', 118, 'C', '5:50', 'Techno'],
  ['Paper Planes', 'Nova Reyes', 118, 'C', '6:43', 'Disco Edits'],
  ['Lucid', 'Sable & Ash', 118, 'C', '7:37', 'Warmup'],
  ['Concrete Garden', 'Mara Lune', 119, 'C♯m', '5:21', 'House'],
  ['Slow Burn', 'Nova Reyes', 123, 'Fm', '5:25', 'Techno'],
  ['Signal Fire', 'Low Orbit', 125, 'Gm', '6:39', 'Disco Edits'],
  ['Halcyon', 'Juno Hale', 126, 'G♯m', '7:51', 'Warmup'],
  ['Glass Rooms', 'Kite Theory', 128, 'B♭m', '5:02', 'House'],
  ['Undertow', 'Low Orbit', 127, 'A', '5:55', 'Techno'],
  ['Satellite Heart', 'Nova Reyes', 120, 'Dm', '6:01', 'Disco Edits'],
  ['Warehouse 9', 'Kite Theory', 120, 'Dm', '6:36', 'Warmup'],
];
