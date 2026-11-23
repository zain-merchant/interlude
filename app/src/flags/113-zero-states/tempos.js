// What an empty filter's picture shows: where this list's tracks are, and
// where the filter is. Pure, one pass over the tracks and a few more steps
// per track, so it's cheap on a huge library.
import { camelot } from '../../lib/key.js';
import { FIT_TEMPO, keysFit, tempoFits } from '../../lib/libraryfilter.js';

const STEPS = [1, 2, 5, 10, 20, 50];
const CAP = 1000; // tempos over this are counted as off the scale

/** The n-th key of the Filter's wheel: 1A to 12A, then 1B to 12B. */
export const WHEEL = [...'AB'].flatMap((l) => Array.from({ length: 12 }, (_, i) => `${i + 1}${l}`));

/** The key at a place on it. @param {number} i */
export const keyAt = (i) => ({ tonic: ((i % 12) * 7 + (i < 12 ? 8 : 11)) % 12, minor: i < 12 });

/** Where a Fits match can be: at half, normal and double time. @param {number} bpm */
export const fitWindows = (bpm) => [1, 0.5, 2].map((m) => [(bpm * (1 - FIT_TEMPO)) / m, (bpm * (1 + FIT_TEMPO)) / m]);

/** Reading a track against the two halves of a filter, as passes() does. */
const inRange = (bpm, f) => (f.bpmMin == null || bpm >= f.bpmMin) && (f.bpmMax == null || bpm <= f.bpmMax);

/**
 * @param {any[]} tracks the list, without the filter
 * @param {{ bpmMin: number | null, bpmMax: number | null, keys: string[] }} f
 * @param {{ bpm: number, key: any } | null} fit the deck on air, with Fits on
 * @param {string | null} skip the track on air, which Fits leaves out
 * @returns {any}
 */
export function picture(tracks, f, fit = null, skip = null) {
  const ranged = f.bpmMin != null || f.bpmMax != null;
  const keyed = f.keys.length > 0;
  const n = tracks.length;
  const bpms = new Float64Array(n);
  // 1: in the filter's other half (its keys, or with Fits the whole filter). 2: fits.
  const tag = new Uint8Array(n);
  const keys = new Array(24).fill(0);
  const slot = Object.fromEntries(WHEEL.map((c, i) => [c, i]));
  const hist = new Uint32Array(CAP + 1);
  let have = 0;
  let noTempo = 0;
  let noKey = 0;
  const count = { both: 0, range: 0, keys: 0, filter: 0, fit: 0, above: Infinity, below: -Infinity };
  for (let i = 0; i < n; i++) {
    const t = tracks[i];
    if (skip && t.path === skip) continue;
    const bpm = t.analysis?.bpm;
    const k = t.analysis?.key;
    const code = k ? camelot(k) : null;
    if (code) keys[slot[code]]++;
    else noKey++;
    const kOk = !keyed || (code !== null && f.keys.includes(code));
    const has = bpm > 0;
    const rOk = !ranged || (has && inRange(bpm, f));
    if (rOk && ranged) count.range++;
    if (kOk && keyed) count.keys++;
    const fOk = rOk && kOk;
    if (fOk) count.filter++;
    const near = !!fit && has && tempoFits(bpm, fit.bpm);
    if (near && rOk) count.both++;
    const airOk = near && (!fit.key || (!!k && keysFit(k, fit.key)));
    if (airOk) count.fit++;
    if (!has) {
      noTempo++;
      continue;
    }
    if (f.bpmMin != null && bpm < f.bpmMin) count.below = Math.max(count.below, bpm);
    if (f.bpmMax != null && bpm > f.bpmMax) count.above = Math.min(count.above, bpm);
    bpms[have] = bpm;
    tag[have] = (fit ? (fOk ? 1 : 0) : keyed && kOk ? 1 : 0) | (airOk ? 2 : 0);
    have++;
    hist[Math.min(CAP, Math.floor(bpm))]++;
  }
  const base = { n, have, noTempo, noKey, count, ranged, keyed, fit: !!fit };
  if (!ranged && !fit) return { ...base, kind: 'keys', keys, chosen: WHEEL.map((c) => f.keys.includes(c)) };

  // The scale holds every tempo but the wild ones (three spreads outside the
  // middle half), and every end asked for.
  const at = (q) => {
    let left = q * have;
    for (let b = 0; b <= CAP; b++) if ((left -= hist[b]) <= 0) return b;
    return CAP;
  };
  let first = Infinity;
  let final = -Infinity;
  if (have) {
    const q1 = at(0.25);
    const q3 = at(0.75) + 1;
    const far = have < 8 ? Infinity : 3 * Math.max(q3 - q1, 6);
    for (let i = 0; i < have; i++) {
      const b = bpms[i];
      if (b > CAP || b < q1 - far || b > q3 + far) continue;
      if (b < first) first = b;
      if (b > final) final = b;
    }
  }
  // With Fits: no tempo does for both, or the tempos do and the keys don't.
  if (fit && !(ranged && !count.both)) {
    const mix = WHEEL.filter((_, i) => !fit.key || keysFit(keyAt(i), fit.key));
    const both = keyed ? mix.filter((c) => f.keys.includes(c)) : mix;
    return { ...base, kind: 'slots', keys: both.length ? both : WHEEL.filter((c) => f.keys.includes(c)) };
  }
  const windows = fit ? fitWindows(fit.bpm) : [];
  const want = [];
  if (first <= final) want.push(first, final);
  if (f.bpmMin != null) want.push(f.bpmMin);
  if (f.bpmMax != null) want.push(f.bpmMax);
  if (fit) want.push(...windows[0]);
  if (!want.length) want.push(90, 150);
  let lo = Math.min(...want.filter((b) => b <= CAP), CAP);
  let hi = Math.max(...want.map((b) => Math.min(b, CAP)));
  if (lo > hi) lo = hi;
  const pad = Math.max(4, (hi - lo) * 0.06);
  lo = Math.max(0, Math.floor((lo - pad) / 5) * 5);
  hi = Math.ceil((hi + pad) / 5) * 5;
  if (hi - lo < 30) hi = lo + 30;
  // A bar never crosses the filter's edge: it's cut there, so nothing looks in that's out.
  const step = STEPS.find((s) => (hi - lo) / s <= 44) ?? 50;
  const cuts = new Set();
  for (let b = Math.ceil(lo / step) * step; b <= hi; b += step) cuts.add(b);
  cuts.add(lo).add(hi);
  // A track exactly at the top is in, so that cut is just past it.
  const EPS = 1e-6;
  if (f.bpmMin != null && f.bpmMin > lo && f.bpmMin < hi) cuts.add(f.bpmMin);
  if (f.bpmMax != null && f.bpmMax > lo && f.bpmMax < hi) {
    cuts.delete(f.bpmMax);
    cuts.add(f.bpmMax + EPS);
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const bars = edges.slice(0, -1).map((x0, i) => ({ x0, x1: edges[i + 1], all: 0, a: 0, b: 0 }));
  let offLow = 0;
  let offHigh = 0;
  for (let i = 0; i < have; i++) {
    const b = bpms[i];
    if (b < lo) offLow++;
    else if (b > hi) offHigh++;
    else {
      let l = 0;
      let r = bars.length - 1;
      while (l < r) {
        const m = (l + r + 1) >> 1;
        if (edges[m] <= b) l = m;
        else r = m - 1;
      }
      bars[l].all++;
      if (tag[i] & 1) bars[l].a++;
      if (tag[i] & 2) bars[l].b++;
    }
  }
  const clip = ([a, b]) => [Math.max(lo, Math.min(hi, a)), Math.max(lo, Math.min(hi, b))];
  if (fit) {
    // The deck's nearest range to the filter's, and the filter's.
    const r = [f.bpmMin ?? 0, f.bpmMax ?? CAP];
    const near = windows.map((w) => ({ w, d: Math.max(0, r[0] - w[1], w[0] - r[1]) })).sort((x, y) => x.d - y.d)[0].w;
    const ends = [near[0], near[1], f.bpmMin ?? Math.min(near[0], f.bpmMax) - 20, Math.min(CAP, f.bpmMax ?? Math.max(near[1], f.bpmMin) + 20)];
    const a = Math.min(...ends);
    const z = Math.max(...ends);
    const m = Math.max(4, (z - a) * 0.08);
    return { ...base, kind: 'spans', lo: a - m, hi: z + m, windows: [near], range: [f.bpmMin ?? a - m, Math.min(CAP, f.bpmMax ?? z + m)] };
  }
  return {
    ...base,
    kind: 'tempo',
    lo,
    hi,
    step,
    bars,
    most: Math.max(1, ...bars.map((b) => b.all)),
    off: { low: offLow, high: offHigh },
    range: ranged ? clip([f.bpmMin ?? lo, f.bpmMax ?? hi]) : null,
    ends: { low: f.bpmMin != null && f.bpmMin >= lo && f.bpmMin <= hi ? f.bpmMin : null, high: f.bpmMax != null && f.bpmMax >= lo && f.bpmMax <= hi ? f.bpmMax : null },
    windows: windows.map(clip).filter(([a, b]) => b - a > 0.01),
  };
}

const num = (b) => `${Math.round(b * 10) / 10}`;
const many = (n) => n.toLocaleString();

/** The line under the heading: what the list does hold. @param {ReturnType<typeof picture>} p @param {{ bpmMin: number | null, bpmMax: number | null, keys: string[] }} f */
export function said(p, f) {
  const { count } = p;
  const keys = f.keys.length > 3 ? `those ${f.keys.length} keys` : f.keys.length > 1 ? `${f.keys.slice(0, -1).join(', ')} or ${f.keys.at(-1)}` : f.keys[0];
  if (p.kind === 'slots') return count.both ? `${many(count.both)} ${p.ranged ? 'at both tempos' : 'at its tempo'}, none in ${p.keys.length > 1 ? 'a key that does' : 'that key'}.` : `${many(count.filter)} in the filter, none that mix.`;
  if (p.kind === 'spans') return `${count.filter ? many(count.filter) : 'None'} in the filter, ${count.fit ? many(count.fit) : 'none'} that mix.`;
  if (p.ranged && !p.have) return p.n === 1 ? 'Its tempo isn’t known yet.' : 'No tempos are known yet.';
  if (p.ranged && p.keyed) return `${count.range ? `${many(count.range)} at that tempo` : 'None at that tempo'}, ${count.keys ? `${many(count.keys)} in ${keys}` : `none in ${keys}`}${count.range && count.keys ? ', none both' : ''}.`;
  if (p.keyed) return p.noKey === p.n ? 'No keys are known yet.' : '';
  const near = [];
  if (Number.isFinite(count.below)) near.push({ b: count.below, d: f.bpmMin - count.below });
  if (Number.isFinite(count.above)) near.push({ b: count.above, d: count.above - f.bpmMax });
  near.sort((x, y) => x.d - y.d);
  return near.length ? `The nearest is ${num(near[0].b)} BPM.` : '';
}

/** The heading. */
export function head(f) {
  const bpm = f.bpmMin != null && f.bpmMax != null ? (f.bpmMin === f.bpmMax ? `at ${f.bpmMin} BPM` : `between ${f.bpmMin} and ${f.bpmMax} BPM`) : f.bpmMin != null ? `at ${f.bpmMin} BPM or more` : f.bpmMax != null ? `at ${f.bpmMax} BPM or less` : '';
  const keys = f.keys.length > 3 ? `in those ${f.keys.length} keys` : f.keys.length ? `in ${f.keys.length > 1 ? `${f.keys.slice(0, -1).join(', ')} or ${f.keys.at(-1)}` : f.keys[0]}` : '';
  return ['No tracks', keys, bpm].filter(Boolean).join(' ');
}
