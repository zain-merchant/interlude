//! Tempo analysis: BPM and a constant beatgrid.
//!
//! 1. Build an onset envelope: how much the energy rises in three bands
//!    (kick, body, hats), ~86 times per second.
//! 2. Estimate the tempo from the envelope's autocorrelation, folded into the
//!    DJ range [`MIN_BPM`, `MAX_BPM`).
//! 3. Refine the tempo to 0.01 BPM, and find the beat phase, by folding every
//!    onset in the track onto one beat period and picking the tempo whose
//!    onsets line up best. Over a whole track this is very precise, because
//!    a small tempo error adds up beat after beat.
//!
//! Most electronic music sits on integer (or half-integer) tempos, so a
//! result within a hair of one snaps to it when the fit is as good.
//!
//! Tracks with tempo changes (live drums, edits) get the average tempo;
//! variable grids come later.

use crate::dsp::Biquad;

/// Lowest BPM reported; slower tempos are doubled.
pub const MIN_BPM: f64 = 80.0;
/// Highest BPM reported (exclusive); faster tempos are halved.
pub const MAX_BPM: f64 = 160.0;

const HOP: usize = 512;
const PHASE_BINS: usize = 96;

/// A constant-tempo beatgrid.
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct Beatgrid {
    pub bpm: f64,
    /// Time of beat 0, in seconds, which starts a bar. Detected grids put
    /// it within one beat of 0; a downbeat set by hand puts it within one
    /// bar (4 beats).
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
    prev: [f32; 3],
    env: Vec<f32>,
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
            prev: [0.0; 3],
            env: Vec::new(),
        }
    }

    /// Adds interleaved stereo samples (an even number).
    pub fn push(&mut self, stereo: &[f32]) {
        self.env.reserve((self.filled + stereo.len() / 2) / HOP);
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

    /// Positive energy change over the hop just filled, summed over the
    /// three bands.
    fn end_hop(&mut self, e: [f32; 3]) {
        let n = self.filled as f32;
        // Log energy, so a quiet hi-hat counts as much as a loud kick rise.
        let cur = e.map(|v| (1.0 + 1_000.0 * v / n).ln());
        // Kicks carry the pulse in most dance music, so weight them most.
        let weights = [1.0, 0.6, 0.5];
        let flux: f32 = (0..3)
            .map(|b| (cur[b] - self.prev[b]).max(0.0) * weights[b])
            .sum();
        self.env.push(flux);
        self.prev = cur;
        self.filled = 0;
    }

    pub fn finish(mut self) -> Option<Beatgrid> {
        if self.filled > 0 {
            self.end_hop(self.e);
        }
        let env = normalize_envelope(self.env);
        let fps = self.sample_rate as f64 / HOP as f64;
        if env.len() < (fps * 6.0) as usize {
            return None;
        }
        let coarse = coarse_tempo(&env, fps)?;
        let (bpm, phase) = refine(&env, fps, coarse)?;
        let beat = 60.0 / bpm;
        let first_beat = phase.rem_euclid(beat);
        Some(Beatgrid { bpm, first_beat })
    }
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

/// Autocorrelation peak, folded into the DJ range. Returns BPM.
fn coarse_tempo(env: &[f32], fps: f64) -> Option<f64> {
    let lag_for = |bpm: f64| 60.0 * fps / bpm;
    // Only consider periods inside the DJ range. Searching wider and folding
    // afterwards goes wrong: a 3-beat period folds to 2/3 of the tempo.
    let min_lag = lag_for(MAX_BPM).floor().max(2.0) as usize;
    let max_lag = lag_for(MIN_BPM).ceil() as usize;
    if env.len() <= max_lag * 4 {
        return None;
    }
    let ac: Vec<f64> = (0..=max_lag * 4 + 1)
        .map(|lag| {
            env.iter()
                .zip(&env[lag..])
                .map(|(a, b)| (*a * *b) as f64)
                .sum::<f64>()
        })
        .collect();
    if ac[0] <= 0.0 {
        return None;
    }

    // Score each lag by its own peak plus its multiples: a true beat period
    // also correlates at 2, 3 and 4 periods. Including 3 matters: a lag of
    // 1.5 beats lines kicks up with off-beat hats and scores well at 2x and
    // 4x, but not at 3x.
    let mut best = (0.0, 0usize);
    for lag in min_lag..=max_lag {
        let score: f64 = (1..=4).map(|k| ac[lag * k] / k as f64).sum();
        if score > best.0 {
            best = (score, lag);
        }
    }
    let lag = best.1;
    if lag == 0 || ac[lag] < ac[0] * 0.02 {
        return None;
    }
    // Parabolic interpolation around the peak.
    let (a, b, c) = (ac[lag - 1], ac[lag], ac[lag + 1]);
    let denom = a - 2.0 * b + c;
    let offset = if denom.abs() > 1e-12 {
        0.5 * (a - c) / denom
    } else {
        0.0
    };
    let mut bpm = 60.0 * fps / (lag as f64 + offset.clamp(-0.5, 0.5));
    while bpm < MIN_BPM {
        bpm *= 2.0;
    }
    while bpm >= MAX_BPM {
        bpm /= 2.0;
    }
    Some(bpm)
}

/// How well the onsets line up with a grid of this tempo, and at which
/// phase (seconds). Folds every onset onto one beat period.
fn fit(env: &[f32], fps: f64, bpm: f64) -> (f64, f64) {
    let beat = 60.0 / bpm;
    let mut hist = [0f64; PHASE_BINS];
    for (i, &v) in env.iter().enumerate() {
        if v <= 0.0 {
            continue;
        }
        let t = i as f64 / fps;
        let p = (t / beat).fract() * PHASE_BINS as f64;
        // Linear split between the two nearest bins.
        let b0 = p.floor() as usize % PHASE_BINS;
        let f = p.fract();
        hist[b0] += v as f64 * (1.0 - f);
        hist[(b0 + 1) % PHASE_BINS] += v as f64 * f;
    }
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

fn refine(env: &[f32], fps: f64, coarse: f64) -> Option<(f64, f64)> {
    // Coarse search ±2% in 0.02 BPM steps, then fine ±0.03 in 0.002 steps.
    let search = |lo: f64, hi: f64, step: f64| {
        let mut best = (f64::MIN, coarse, 0.0);
        let mut bpm = lo;
        while bpm <= hi {
            let (score, phase) = fit(env, fps, bpm);
            if score > best.0 {
                best = (score, bpm, phase);
            }
            bpm += step;
        }
        best
    };
    let (_, b, _) = search(coarse * 0.98, coarse * 1.02, 0.02);
    let (score, bpm, phase) = search(b - 0.03, b + 0.03, 0.002);
    // A pulse that isn't clearly stronger than a uniform spread isn't a beat.
    if score < 2.5 / PHASE_BINS as f64 {
        return None;
    }

    // Snap to an integer or half-integer tempo if it fits as well.
    for snapped in [bpm.round(), (bpm * 2.0).round() / 2.0] {
        if (snapped - bpm).abs() < 0.06 {
            let (s, p) = fit(env, fps, snapped);
            if s >= score * 0.97 {
                return Some((snapped, p));
            }
        }
    }
    Some(((bpm * 100.0).round() / 100.0, phase))
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
    fn folds_drum_and_bass_into_range() {
        let g = detect_beatgrid(&drums(174.0, 60.0, 0.0), SR).unwrap();
        assert!((g.bpm - 87.0).abs() < 0.02, "got {}", g.bpm);
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
