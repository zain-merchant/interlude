//! Tempo analysis: BPM, a constant beatgrid, and where the bars start.
//!
//! 1. Measure the energy of three bands (kick, body, hats) ~86 times per
//!    second, and how much each rises: the onset envelope.
//! 2. Take the strongest periods of the envelope's autocorrelation as
//!    candidate tempos, folded into [80, 160) BPM.
//! 3. Refine each candidate to 0.01 BPM, and find its beat phase, by folding
//!    every onset in the track onto one beat period. The candidate whose
//!    onsets line up best wins, with a bonus when the music also repeats
//!    every bar and every two bars at that tempo. That bonus is what tells
//!    a beat from a dotted-quarter or triplet pulse, the usual 3:2 and 4:3
//!    errors. Over a whole track the fit is very precise, because a small
//!    tempo error adds up beat after beat.
//! 4. Pick the tempo octave the way DJs count: where the snare lands
//!    relative to the kick. A snare half a beat after the kick means the
//!    beat is twice as fast (drum & bass at 174, not 87); a snare two beats
//!    after it at 145+ means a half-time groove (hip-hop at 75, not 150).
//! 5. Find the first beat of the bar from where the arrangement changes:
//!    drums, bass and pads come and go at bar lines.
//!
//! Most electronic music sits on integer (or half-integer) tempos, so a
//! result within a hair of one snaps to it when the fit is as good.
//!
//! Tracks with tempo changes (live drums, edits) get the average tempo;
//! variable grids come later. `tools/beat-eval` measures all of this
//! against tracks with known beats.

use crate::dsp::Biquad;

/// Lowest BPM reported.
pub const MIN_BPM: f64 = 72.5;
/// Highest BPM reported (exclusive).
pub const MAX_BPM: f64 = 180.0;

/// Candidate tempos are folded into this octave before the octave is
/// chosen.
const BASE_MIN: f64 = 80.0;
const BASE_MAX: f64 = 160.0;

const HOP: usize = 512;
const PHASE_BINS: usize = 96;
/// Band weights in the onset envelope: kicks carry the pulse in most dance
/// music, so they count most.
const WEIGHTS: [f32; 3] = [1.0, 0.6, 0.5];

/// A constant-tempo beatgrid.
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct Beatgrid {
    pub bpm: f64,
    /// Time of beat 0, in seconds, which starts a bar. Within one bar
    /// (4 beats) of 0.
    pub first_beat: f64,
}

impl Beatgrid {
    pub fn beat_length(&self) -> f64 {
        60.0 / self.bpm
    }

    /// Fractional beat number at time `t` (seconds). Beat 0 is `first_beat`.
    pub fn beat_at(&self, t: f64) -> f64 {
        (t - self.first_beat) / self.beat_length()
    }

    pub fn time_of_beat(&self, beat: f64) -> f64 {
        self.first_beat + beat * self.beat_length()
    }
}

/// Analyzes interleaved stereo audio. Returns `None` for audio with no
/// clear pulse (silence, ambient pads, very short clips).
pub fn detect_beatgrid(stereo: &[f32], sample_rate: u32) -> Option<Beatgrid> {
    let mut b = BeatgridBuilder::new(sample_rate);
    b.push(stereo);
    b.finish()
}

/// Finds the beatgrid of audio fed in pieces of any size, so a track can
/// be analyzed while it is still being decoded. The result is the same as
/// [`detect_beatgrid`] on the whole track.
pub(crate) struct BeatgridBuilder {
    sample_rate: u32,
    low: [Biquad; 2],
    mid: [Biquad; 2],
    high: [Biquad; 2],
    /// Band energies of the hop being filled, and frames so far.
    e: [f32; 3],
    filled: usize,
    /// Log energy of each band, per hop.
    energy: Vec<[f32; 3]>,
}

impl BeatgridBuilder {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f64;
        Self {
            sample_rate,
            low: [
                Biquad::lowpass(150.0, 0.707, sr),
                Biquad::lowpass(150.0, 0.707, sr),
            ],
            mid: [
                Biquad::highpass(300.0, 0.707, sr),
                Biquad::lowpass(3_000.0, 0.707, sr),
            ],
            high: [
                Biquad::highpass(5_000.0, 0.707, sr),
                Biquad::highpass(5_000.0, 0.707, sr),
            ],
            e: [0.0; 3],
            filled: 0,
            energy: Vec::new(),
        }
    }

    /// Adds interleaved stereo samples (an even number).
    pub fn push(&mut self, stereo: &[f32]) {
        self.energy.reserve((self.filled + stereo.len() / 2) / HOP);
        let mut e = self.e;
        let mut frames = stereo.as_chunks::<2>().0;
        while !frames.is_empty() {
            // The rest of the current hop, or as much of it as there is.
            let (part, rest) = frames.split_at((HOP - self.filled).min(frames.len()));
            frames = rest;
            for [l, r] in part {
                let x = 0.5 * (l + r);
                let lo = self.low[0].process(x);
                let lo = self.low[1].process(lo);
                let mi = self.mid[0].process(x);
                let mi = self.mid[1].process(mi);
                let hi = self.high[0].process(x);
                let hi = self.high[1].process(hi);
                e[0] += lo * lo;
                e[1] += mi * mi;
                e[2] += hi * hi;
            }
            self.filled += part.len();
            if self.filled == HOP {
                self.end_hop(e);
                e = [0.0; 3];
            }
        }
        self.e = e;
    }

    fn end_hop(&mut self, e: [f32; 3]) {
        let n = self.filled as f32;
        // Log energy, so a quiet hi-hat counts as much as a loud kick rise.
        self.energy.push(e.map(|v| (1.0 + 1_000.0 * v / n).ln()));
        self.filled = 0;
    }

    pub fn finish(mut self) -> Option<Beatgrid> {
        if self.filled > 0 {
            self.end_hop(self.e);
        }
        let fps = self.sample_rate as f64 / HOP as f64;
        if self.energy.len() < (fps * 6.0) as usize {
            return None;
        }
        // Positive energy change per band, then the weighted sum.
        let flux: [Vec<f32>; 3] = std::array::from_fn(|b| {
            let mut prev = self.energy[0][b];
            self.energy
                .iter()
                .map(|e| {
                    let d = (e[b] - prev).max(0.0);
                    prev = e[b];
                    d
                })
                .collect()
        });
        // Rounding noise in a steady tone would otherwise be scaled up
        // into an envelope; real onsets rise by far more than this.
        if flux.iter().flatten().all(|&d| d < 0.1) {
            return None;
        }
        let combined = (0..self.energy.len())
            .map(|i| (0..3).map(|b| flux[b][i] * WEIGHTS[b]).sum())
            .collect();
        let env = normalize_envelope(combined);

        let ac = autocorrelation(&env, (lag_for(BASE_MIN, fps) * 8.0) as usize + 4);
        let (score, bpm, phase) = best_candidate(&env, fps, &ac)?;
        let k = octave(&flux, fps, bpm);
        let (score, bpm, phase) = if k == 1.0 {
            (score, bpm, phase)
        } else {
            let (s, p) = fit(&env, fps, bpm * k);
            (s, bpm * k, p)
        };
        let (bpm, phase) = snap(&env, fps, score, bpm, phase);
        let beat = 60.0 / bpm;
        let first_beat = downbeat(&self.energy, fps, bpm, phase.rem_euclid(beat));
        Some(Beatgrid { bpm, first_beat })
    }
}

fn lag_for(bpm: f64, fps: f64) -> f64 {
    60.0 * fps / bpm
}

/// Removes the slowly moving average from the onset envelope, so loud
/// sections don't dominate, and scales it to 0..=1.
fn normalize_envelope(env: Vec<f32>) -> Vec<f32> {
    let w = 16;
    let mut out = vec![0f32; env.len()];
    let mut sum: f32 = env.iter().take(w).sum();
    for i in 0..env.len() {
        if i + w < env.len() {
            sum += env[i + w];
        }
        if i > w {
            sum -= env[i - w - 1];
        }
        let n = (i + w + 1).min(env.len()) - i.saturating_sub(w);
        out[i] = (env[i] - sum / n as f32).max(0.0);
    }
    let max = out.iter().cloned().fold(0.0, f32::max);
    if max > 0.0 {
        out.iter_mut().for_each(|v| *v /= max);
    }
    out
}

/// Autocorrelation of the envelope minus its mean, for lags 0..=max_lag.
fn autocorrelation(env: &[f32], max_lag: usize) -> Vec<f64> {
    let mean = env.iter().map(|&v| v as f64).sum::<f64>() / env.len() as f64;
    let x: Vec<f64> = env.iter().map(|&v| v as f64 - mean).collect();
    (0..=max_lag.min(x.len() - 1))
        .map(|lag| x.iter().zip(&x[lag..]).map(|(a, b)| a * b).sum())
        .collect()
}

/// The autocorrelation at a fractional lag, relative to lag 0.
fn ac_at(ac: &[f64], lag: f64) -> f64 {
    let i = lag as usize;
    if i + 1 >= ac.len() || ac[0] <= 0.0 {
        return 0.0;
    }
    let f = lag - i as f64;
    (ac[i] * (1.0 - f) + ac[i + 1] * f) / ac[0]
}

/// The strongest autocorrelation peaks between 45 and 220 BPM, as tempos
/// folded into [`BASE_MIN`], [`BASE_MAX`).
fn candidates(ac: &[f64], fps: f64) -> Vec<f64> {
    let lo = (lag_for(220.0, fps) as usize).max(1);
    let hi = (lag_for(45.0, fps) as usize).min(ac.len().saturating_sub(1));
    let mut peaks: Vec<usize> = (lo..hi)
        .filter(|&l| ac[l] > ac[l - 1] && ac[l] >= ac[l + 1] && ac[l] > 0.0)
        .collect();
    peaks.sort_by(|a, b| ac[*b].total_cmp(&ac[*a]));
    let mut out: Vec<f64> = Vec::new();
    for &l in peaks.iter().take(6) {
        // Parabolic interpolation around the peak.
        let (a, b, c) = (ac[l - 1], ac[l], ac[l + 1]);
        let denom = a - 2.0 * b + c;
        let offset = if denom.abs() > 1e-12 {
            (0.5 * (a - c) / denom).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        let mut bpm = 60.0 * fps / (l as f64 + offset);
        while bpm < BASE_MIN {
            bpm *= 2.0;
        }
        while bpm >= BASE_MAX {
            bpm /= 2.0;
        }
        if out.iter().all(|&o| (bpm / o - 1.0).abs() > 0.01) {
            out.push(bpm);
        }
    }
    out
}

/// Refines each candidate and returns the best: (fit, bpm, phase in
/// seconds).
fn best_candidate(env: &[f32], fps: f64, ac: &[f64]) -> Option<(f64, f64, f64)> {
    let mut best: Option<(f64, f64, f64, f64)> = None; // (rank, fit, bpm, phase)
    for c in candidates(ac, fps) {
        let (_, b, _) = search(env, fps, c * 0.985, c * 1.015, 0.02);
        let (score, bpm, phase) = search(env, fps, b - 0.03, b + 0.03, 0.002);
        // Music repeats every bar and every two bars: a beat-length
        // candidate correlates there, a dotted or triplet one doesn't.
        let lag = lag_for(bpm, fps);
        let bars = ac_at(ac, 4.0 * lag).max(0.0) + ac_at(ac, 8.0 * lag).max(0.0);
        let rank = score * (1.0 + 2.0 * bars);
        if best.is_none_or(|b| rank > b.0) {
            best = Some((rank, score, bpm, phase));
        }
    }
    let (_, score, bpm, phase) = best?;
    // A pulse that isn't clearly stronger than a uniform spread isn't a beat.
    (score >= 2.5 / PHASE_BINS as f64).then_some((score, bpm, phase))
}

/// Snaps to an integer or half-integer tempo if it fits as well, else
/// rounds to 0.01 BPM.
fn snap(env: &[f32], fps: f64, score: f64, bpm: f64, phase: f64) -> (f64, f64) {
    for snapped in [bpm.round(), (bpm * 2.0).round() / 2.0] {
        if (snapped - bpm).abs() < 0.06 {
            let (s, p) = fit(env, fps, snapped);
            if s >= score * 0.97 {
                return (snapped, p);
            }
        }
    }
    ((bpm * 100.0).round() / 100.0, phase)
}

/// The best fit for tempos from `lo` to `hi` in `step`s: (score, bpm, phase).
fn search(env: &[f32], fps: f64, lo: f64, hi: f64, step: f64) -> (f64, f64, f64) {
    let mut best = (f64::MIN, lo, 0.0);
    let mut i = 0;
    loop {
        let bpm = lo + i as f64 * step;
        if bpm > hi + 1e-9 {
            break best;
        }
        let (score, phase) = fit(env, fps, bpm);
        if score > best.0 {
            best = (score, bpm, phase);
        }
        i += 1;
    }
}

/// How well the onsets line up with a grid of this tempo, and at which
/// phase (seconds). Folds every onset onto one beat period.
fn fit(env: &[f32], fps: f64, bpm: f64) -> (f64, f64) {
    let beat = 60.0 / bpm;
    let hist = fold(env, fps, beat, PHASE_BINS);
    // Smooth a little and take the peak.
    let mut best = (0.0, 0usize);
    for i in 0..PHASE_BINS {
        let s = hist[(i + PHASE_BINS - 1) % PHASE_BINS] * 0.5
            + hist[i]
            + hist[(i + 1) % PHASE_BINS] * 0.5;
        if s > best.0 {
            best = (s, i);
        }
    }
    let total: f64 = hist.iter().sum();
    let score = if total > 0.0 { best.0 / total } else { 0.0 };
    (score, best.1 as f64 / PHASE_BINS as f64 * beat)
}

/// Folds the envelope onto one `period` (seconds), in `bins` bins.
fn fold(env: &[f32], fps: f64, period: f64, bins: usize) -> Vec<f64> {
    let mut hist = vec![0f64; bins];
    let step = 1.0 / (fps * period);
    for (i, &v) in env.iter().enumerate() {
        if v <= 0.0 {
            continue;
        }
        let p = (i as f64 * step).fract() * bins as f64;
        // Linear split between the two nearest bins.
        let b0 = p as usize % bins;
        let f = p.fract();
        hist[b0] += v as f64 * (1.0 - f);
        hist[(b0 + 1) % bins] += v as f64 * f;
    }
    hist
}

/// Whether to double (2.0) or halve (0.5) `bpm`, or keep it (1.0), from
/// where the snare (mid band) falls after the kick (low band).
fn octave(flux: &[Vec<f32>; 3], fps: f64, bpm: f64) -> f64 {
    const BINS: usize = 96;
    const MARGIN: f64 = 1.3;
    let beat = 60.0 / bpm;
    // Mid-band energy `d` bins after low-band energy, over one period.
    // A band's onsets folded onto `period`, smoothed, summing to 1.
    let folded = |band: usize, period: f64| {
        let h = fold(&normalize_envelope(flux[band].clone()), fps, period, BINS);
        let s: Vec<f64> = (0..BINS)
            .map(|i| h[(i + BINS - 1) % BINS] * 0.5 + h[i] + h[(i + 1) % BINS] * 0.5)
            .collect();
        let total: f64 = s.iter().sum::<f64>().max(1e-12);
        s.into_iter().map(|v| v / total).collect::<Vec<_>>()
    };
    let kick_to_snare = |period: f64| -> Vec<f64> {
        let lo = folded(0, period);
        let mi = folded(1, period);
        (0..BINS)
            .map(|d| (0..BINS).map(|x| lo[x] * mi[(x + d) % BINS]).sum())
            .collect()
    };
    let peak = |c: &[f64], center: usize, w: usize| {
        (center + BINS - w..=center + BINS + w)
            .map(|i| c[i % BINS])
            .fold(0.0, f64::max)
    };
    if bpm < 90.0 {
        // Two beats, 48 bins each: a snare half a beat after the kick.
        let c = kick_to_snare(2.0 * beat);
        let half = peak(&c, 24, 4).max(peak(&c, 72, 4));
        if half > MARGIN * peak(&c, 48, 4) {
            return 2.0;
        }
    }
    if bpm >= 145.0 {
        // Four beats, 24 bins each: a snare two beats after the kick.
        let c = kick_to_snare(4.0 * beat);
        let one = peak(&c, 24, 2).max(peak(&c, 72, 2));
        if peak(&c, 48, 2) > MARGIN * one {
            return 0.5;
        }
        // Or the snare only comes every four beats, wherever the kicks are:
        // its loudest spot has nothing like it two beats later.
        let mi = folded(1, 4.0 * beat);
        let mut sorted = mi.clone();
        sorted.sort_by(f64::total_cmp);
        let floor = sorted[BINS / 2];
        let top = (0..BINS)
            .max_by(|a, b| mi[*a].total_cmp(&mi[*b]))
            .unwrap_or(0);
        let across = (top + 45..=top + 51)
            .map(|i| mi[i % BINS])
            .fold(0.0, f64::max);
        if (across - floor).max(0.0) < 0.4 * (mi[top] - floor) {
            return 0.5;
        }
    }
    1.0
}

/// The first beat of a bar, within one bar of the start: sections start on
/// bar lines, so the beat where the energy of the bands changes most, bar
/// after bar, is beat 1.
fn downbeat(energy: &[[f32; 3]], fps: f64, bpm: f64, first: f64) -> f64 {
    let beat = 60.0 / bpm;
    let beats = ((energy.len() as f64 / fps - first) / beat) as usize;
    if beats < 16 {
        return first;
    }
    // Mean log energy of each band over each beat, in standard deviations.
    let mut per_beat = vec![[0f64; 3]; beats];
    for (k, out) in per_beat.iter_mut().enumerate() {
        let a = ((first + k as f64 * beat) * fps) as usize;
        let b = (((first + (k + 1) as f64 * beat) * fps) as usize).max(a + 1);
        let span = &energy[a.min(energy.len() - 1)..b.min(energy.len())];
        for band in 0..3 {
            out[band] = span.iter().map(|e| e[band] as f64).sum::<f64>() / span.len().max(1) as f64;
        }
    }
    for band in 0..3 {
        let mean = per_beat.iter().map(|e| e[band]).sum::<f64>() / beats as f64;
        let var = per_beat
            .iter()
            .map(|e| (e[band] - mean).powi(2))
            .sum::<f64>()
            / beats as f64;
        let sd = var.sqrt().max(1e-9);
        per_beat.iter_mut().for_each(|e| e[band] /= sd);
    }
    let mut votes = [0f64; 4];
    for k in 4..beats - 4 {
        let change: f64 = (0..3)
            .map(|band| {
                let before: f64 = per_beat[k - 4..k].iter().map(|e| e[band]).sum();
                let after: f64 = per_beat[k..k + 4].iter().map(|e| e[band]).sum();
                ((after - before) / 4.0).abs()
            })
            .sum();
        votes[k % 4] += change * change;
    }
    let bar_start = (0..4)
        .max_by(|a, b| votes[*a].total_cmp(&votes[*b]))
        .unwrap_or(0);
    first + bar_start as f64 * beat
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 44_100;

    /// A drum-machine style loop: kick on every beat, hat on the off-beat,
    /// a quiet pad underneath, starting `offset` seconds in.
    fn drums(bpm: f64, secs: f64, offset: f64) -> Vec<f32> {
        let n = (SR as f64 * secs) as usize;
        let beat = 60.0 / bpm;
        let mut seed = 1u32;
        (0..n)
            .flat_map(|i| {
                let t = i as f64 / SR as f64;
                let mut v = 0.1 * (2.0 * std::f64::consts::PI * 220.0 * t).sin();
                if t >= offset {
                    let bt = (t - offset) % beat;
                    let f = 50.0 + 100.0 * (-bt * 30.0).exp();
                    v += 0.7 * (2.0 * std::f64::consts::PI * f * bt).sin() * (-bt * 8.0).exp();
                    let ht = (t - offset + beat / 2.0) % beat;
                    seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                    let noise = (seed >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0;
                    v += 0.15 * noise * (-ht * 60.0).exp();
                }
                let s = v as f32;
                [s, s]
            })
            .collect()
    }

    fn check(bpm: f64, offset: f64) {
        let g = detect_beatgrid(&drums(bpm, 60.0, offset), SR).expect("no grid found");
        assert!(
            (g.bpm - bpm).abs() < 0.02,
            "expected {bpm} BPM, got {}",
            g.bpm
        );
        // The grid should land on the kicks to within 10 ms.
        let beat = 60.0 / bpm;
        let expect = offset % beat;
        let mut err = (g.first_beat - expect).abs();
        err = err.min(beat - err);
        assert!(
            err < 0.010,
            "{bpm} BPM: first beat {:.4}s, expected {expect:.4}s",
            g.first_beat
        );
    }

    #[test]
    fn detects_house_tempo() {
        check(124.0, 0.0);
    }

    #[test]
    fn detects_techno_tempo_with_offset() {
        check(132.0, 0.37);
    }

    #[test]
    fn detects_fractional_tempo() {
        check(122.5, 0.12);
    }

    #[test]
    fn detects_hip_hop_tempo() {
        check(92.0, 0.05);
    }

    #[test]
    fn four_on_the_floor_at_174_reads_half_time() {
        // No snare to say otherwise: it stays in the 80-160 range.
        let g = detect_beatgrid(&drums(174.0, 60.0, 0.0), SR).unwrap();
        assert!((g.bpm - 87.0).abs() < 0.02, "got {}", g.bpm);
    }

    /// One bar of sixteenths, looped: which steps have a kick, a snare,
    /// a closed hat and a bass note.
    struct Pattern {
        kick: &'static [usize],
        snare: &'static [usize],
        hat: &'static [usize],
        bass: &'static [usize],
    }

    fn render(bpm: f64, bars: usize, p: &Pattern) -> Vec<f32> {
        let step = 60.0 / bpm / 4.0;
        let n = (SR as f64 * step * 16.0 * bars as f64) as usize;
        let tau = 2.0 * std::f64::consts::PI;
        let mut out = vec![0f64; n];
        let mut last = 0.0;
        let mut seed = 3u32;
        let mut noise = || {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            (seed >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0
        };
        for s in 0..bars * 16 {
            let at = (s as f64 * step * SR as f64) as usize;
            let k = s % 16;
            let len = (0.3 * SR as f64) as usize;
            for i in 0..len.min(n - at) {
                let t = i as f64 / SR as f64;
                let mut v = 0.0;
                if p.kick.contains(&k) {
                    let f = 50.0 + 100.0 * (-t * 30.0).exp();
                    v += 0.7 * (tau * f * t).sin() * (-t * 8.0).exp();
                }
                if p.snare.contains(&k) {
                    v += 0.3 * (tau * 200.0 * t).sin() * (-t * 30.0).exp();
                    v += 0.4 * noise() * (-t * 18.0).exp();
                }
                if p.hat.contains(&k) {
                    // Differenced noise: hats have little below a few kHz.
                    let n = noise();
                    v += 0.1 * (n - last) * (-t * 70.0).exp();
                    last = n;
                }
                if p.bass.contains(&k) {
                    v += 0.3 * (tau * 55.0 * t).sin() * (-t * 6.0).exp();
                }
                out[at + i] += v;
            }
        }
        out.into_iter().flat_map(|v| [v as f32, v as f32]).collect()
    }

    #[test]
    fn drum_and_bass_reads_full_tempo() {
        // Kick on 1 and the "and" of 3, snare on 2 and 4.
        let p = Pattern {
            kick: &[0, 10],
            snare: &[4, 12],
            hat: &[0, 2, 4, 6, 8, 10, 12, 14],
            bass: &[0, 10],
        };
        let g = detect_beatgrid(&render(174.0, 48, &p), SR).unwrap();
        assert!((g.bpm - 174.0).abs() < 0.02, "got {}", g.bpm);
    }

    #[test]
    fn hip_hop_reads_half_time_below_80() {
        // Boom bap at 75: kick on 1, the "and" of 2 and the "and" of 3,
        // snare on 2 and 4.
        let p = Pattern {
            kick: &[0, 6, 10],
            snare: &[4, 12],
            hat: &[0, 2, 4, 6, 8, 10, 12, 14],
            bass: &[],
        };
        let g = detect_beatgrid(&render(75.0, 24, &p), SR).unwrap();
        assert!((g.bpm - 75.0).abs() < 0.02, "got {}", g.bpm);
    }

    #[test]
    fn offbeat_bass_and_hats_are_not_a_dotted_pulse() {
        // House with open hats and bass on every off-beat: the onsets also
        // line up every beat and a half, which used to read 127 as 84.67.
        let p = Pattern {
            kick: &[0, 4, 8, 12],
            snare: &[4, 12],
            hat: &[2, 6, 10, 14],
            bass: &[2, 6, 10, 14],
        };
        let g = detect_beatgrid(&render(127.0, 48, &p), SR).unwrap();
        assert!((g.bpm - 127.0).abs() < 0.02, "got {}", g.bpm);
        let err = g.first_beat % (60.0 / 127.0);
        assert!(
            err.min(60.0 / 127.0 - err) < 0.010,
            "first beat {}",
            g.first_beat
        );
    }

    /// Closer to a real track: hats-only intro, kicks + claps on 2 and 4 +
    /// a syncopated bassline, then a kickless breakdown, then the drop.
    fn arrangement(bpm: f64) -> Vec<f32> {
        let beat = 60.0 / bpm;
        let bar = beat * 4.0;
        let secs = bar * 64.0;
        let n = (SR as f64 * secs) as usize;
        let tau = 2.0 * std::f64::consts::PI;
        let mut seed = 7u32;
        (0..n)
            .flat_map(|i| {
                let t = i as f64 / SR as f64;
                let bars = t / bar;
                let kicks = (16.0..40.0).contains(&bars) || bars >= 48.0;
                let bt = t % beat;
                let mut v = 0.15 * (tau * 110.0 * t).sin() * (tau * 0.1 * t).sin().abs();
                if kicks {
                    let f = 50.0 + 100.0 * (-bt * 30.0).exp();
                    v += 0.6 * (tau * f * bt).sin() * (-bt * 8.0).exp();
                    // Bass on the "and" of each beat.
                    let st = (t + beat / 2.0) % beat;
                    v += 0.3 * (tau * 55.0 * t).sin() * (-st * 6.0).exp();
                    // Clap on 2 and 4.
                    let ct = (t + beat) % (beat * 2.0);
                    seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                    let noise = (seed >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0;
                    v += 0.25 * noise * (-ct * 25.0).exp();
                }
                // 16th-note hats throughout.
                let ht = t % (beat / 4.0);
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let noise = (seed >> 8) as f64 / (1u32 << 24) as f64 * 2.0 - 1.0;
                v += 0.08 * noise * (-ht * 90.0).exp();
                let s = v as f32;
                [s, s]
            })
            .collect()
    }

    #[test]
    fn detects_tempo_through_intro_and_breakdown() {
        for bpm in [118.0, 126.0, 140.0] {
            let g = detect_beatgrid(&arrangement(bpm), SR).expect("no grid");
            assert!((g.bpm - bpm).abs() < 0.02, "expected {bpm}, got {}", g.bpm);
            let err = g.first_beat.min(60.0 / bpm - g.first_beat);
            assert!(err < 0.010, "{bpm}: first beat at {:.4}s", g.first_beat);
        }
    }

    #[test]
    fn silence_has_no_grid() {
        assert_eq!(detect_beatgrid(&vec![0.0; SR as usize * 20], SR), None);
    }

    #[test]
    fn beat_math_round_trips() {
        let g = Beatgrid {
            bpm: 120.0,
            first_beat: 0.25,
        };
        assert_eq!(g.beat_at(0.25), 0.0);
        assert_eq!(g.beat_at(0.75), 1.0);
        assert_eq!(g.time_of_beat(4.0), 2.25);
    }
}
