//! Neural beat and downbeat detection with Beat This! (Foscarin, Schlüter
//! and Widmer, "Beat This! Accurate and Generalizable Beat Tracking",
//! ISMIR 2024; MIT licence), run through the `beat-this` crate on its
//! pure-Rust runtime.
//!
//! The DSP analysis ([`crate::analysis`]) gives a track its tempo and a
//! first grid within a second or so. This runs after it, in the
//! background: the network finds each beat and downbeat, and [`fit`]
//! weighs them against the DSP grid. Where the two agree on the beats, the
//! network's downbeats choose bar 1, which the DSP analysis gets wrong more
//! often. Where they disagree, the DSP grid stays unless the network is
//! sure of a steady tempo of its own (it does better on live drums).
//!
//! The grid stays constant, as the rest of the app expects. A grid that
//! the two disagree about is marked unsure.
//!
//! The two model files (the log-mel front end and the 2M-parameter small
//! beat model, from beat-this-rs) are built into the app, so this works
//! offline. See `models/README.md`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use beat_this::{BeatThis, RtenRuntime, Runtime};

use crate::analysis::{Beatgrid, MAX_BPM, MIN_BPM};

static MEL: &[u8] = include_bytes!("../models/beat-this-mel.onnx");
static SMALL: &[u8] = include_bytes!("../models/beat-this-small.onnx");

/// Fewest beats to fit a grid through.
const MIN_BEATS: usize = 16;
/// Beats further than this (seconds) from the line are left out of the fit.
const OUTLIER: f64 = 0.05;
/// How close (seconds) a downbeat must be to a beat of the grid to count.
const DOWNBEAT_TOLERANCE: f64 = 0.07;
/// A grid whose beats sit further than this from it (root mean square,
/// seconds) is marked unsure.
const UNSURE_RMS: f64 = 0.035;
/// A grid is marked unsure when fewer than this share of the downbeats fall
/// on its bar lines.
const UNSURE_DOWNBEATS: f64 = 0.6;
/// Tempos within this share of each other are the same.
const SAME_TEMPO: f64 = 0.01;

/// A grid from [`refine`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Refined {
    pub grid: Beatgrid,
    /// The beats wander from one steady tempo, or the downbeats disagree
    /// about where bar 1 is: worth a look before trusting sync.
    pub unsure: bool,
}

/// The grid Beat This! finds in interleaved stereo audio, or `None` when
/// it finds too few beats (or the models couldn't be loaded). `hint`, the
/// DSP grid, chooses the tempo octave: the DSP analysis knows drum & bass
/// is 174, not 87.
pub fn refine(stereo: &[f32], sample_rate: u32, hint: Option<Beatgrid>) -> Option<Refined> {
    let (beats, downbeats) = match detect(stereo, sample_rate) {
        Ok(found) => found,
        Err(e) => {
            eprintln!("beat detection: {e}");
            return None;
        }
    };
    fit(&beats, &downbeats, hint)
}

/// Beat and downbeat times (seconds), from the network.
fn detect(stereo: &[f32], sample_rate: u32) -> Result<(Vec<f64>, Vec<f64>), String> {
    type Model = <RtenRuntime as Runtime>::Model;
    // Loaded once, and run for one track at a time.
    static TRACKER: Mutex<Option<BeatThis<Model>>> = Mutex::new(None);
    let mut tracker = TRACKER.lock().unwrap_or_else(|e| e.into_inner());
    if tracker.is_none() {
        let mel = model_file("beat-this-mel.onnx", MEL)?;
        let small = model_file("beat-this-small.onnx", SMALL)?;
        *tracker = Some(BeatThis::new(&RtenRuntime, &mel, &small).map_err(|e| e.to_string())?);
    }
    let bt = tracker.as_mut().expect("loaded above");
    let mut stream = bt.stream(sample_rate).map_err(|e| e.to_string())?;
    // A minute at a time keeps the mono copy small.
    let mut mono = Vec::new();
    for chunk in stereo.chunks(sample_rate as usize * 2 * 60) {
        mono.clear();
        mono.extend(chunk.as_chunks::<2>().0.iter().map(|[l, r]| 0.5 * (l + r)));
        stream.push(&mono).map_err(|e| e.to_string())?;
    }
    let found = stream.finish().map_err(|e| e.to_string())?;
    let secs = |v: Vec<f32>| v.into_iter().map(f64::from).collect();
    Ok((secs(found.beats), secs(found.downbeats)))
}

/// The runtime loads models from files, so the built-in ones are written
/// out to the temporary folder the first time they're needed.
fn model_file(name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("interlude-models-{}", env!("CARGO_PKG_VERSION")));
    let path = dir.join(name);
    let current = |p: &Path| std::fs::metadata(p).is_ok_and(|m| m.len() == bytes.len() as u64);
    if !current(&path) {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        // Written whole under another name first, so a half-written file is
        // never loaded.
        let part = dir.join(format!("{name}.{}.part", std::process::id()));
        std::fs::write(&part, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// The grid for a track from the network's `beats` and `downbeats` and the
/// DSP grid (`hint`).
///
/// The network is better at bar 1 and at music without a steady kick, but
/// on some four-to-the-floor tracks it locks onto the offbeat (the open
/// hi-hat and the bass between kicks), where the DSP grid is right. So the
/// DSP grid wins whenever the two disagree, unless the network's own grid
/// is steady and its downbeats agree:
///
/// - Same tempo, beats on the DSP grid's beats: the DSP grid, with bar 1
///   moved to where the downbeats land.
/// - Same tempo, beats between them: the DSP grid as it is, marked unsure.
/// - Another tempo: the network's grid if it is sure of it, or else the
///   DSP grid, marked unsure.
pub fn fit(beats: &[f64], downbeats: &[f64], hint: Option<Beatgrid>) -> Option<Refined> {
    let own = fit_own(beats, downbeats, hint);
    let Some(dsp) = hint else {
        return own;
    };
    let keep = Refined {
        grid: dsp,
        unsure: true,
    };
    let Some(own) = own else {
        return Some(keep);
    };
    let ratio = own.grid.beat_length() / dsp.beat_length();
    if (ratio - 1.0).abs() > SAME_TEMPO {
        return Some(if own.unsure { keep } else { own });
    }
    // On the DSP beats, or between them?
    let near = (0.2 * dsp.beat_length()).min(DOWNBEAT_TOLERANCE) / dsp.beat_length();
    let (mut on, mut off) = (0, 0);
    for &b in beats {
        let x = dsp.beat_at(b).rem_euclid(1.0);
        if x.min(1.0 - x) < near {
            on += 1;
        } else if (x - 0.5).abs() < near {
            off += 1;
        }
    }
    if on <= off {
        return Some(keep);
    }
    let (phase, agreement, counted) = bar_vote(downbeats, dsp.first_beat, dsp.beat_length());
    if counted < MIN_BEATS / 2 || agreement < UNSURE_DOWNBEATS {
        return Some(Refined {
            grid: dsp,
            unsure: false,
        });
    }
    let beat = dsp.beat_length();
    Some(Refined {
        grid: Beatgrid {
            bpm: dsp.bpm,
            first_beat: (dsp.first_beat + phase as f64 * beat).rem_euclid(4.0 * beat),
        },
        unsure: false,
    })
}

/// Which of the four beats from `offset` the most `downbeats` land on, the
/// share of them that do, and how many land on a beat at all.
fn bar_vote(downbeats: &[f64], offset: f64, period: f64) -> (usize, f64, usize) {
    let mut votes = [0usize; 4];
    let mut counted = 0;
    for &d in downbeats {
        let n = ((d - offset) / period).round();
        if (d - offset - n * period).abs() < DOWNBEAT_TOLERANCE {
            votes[n.rem_euclid(4.0) as usize] += 1;
            counted += 1;
        }
    }
    let phase = (0..4).max_by_key(|&i| votes[i]).unwrap_or(0);
    let agreement = if counted == 0 {
        0.0
    } else {
        votes[phase] as f64 / counted as f64
    };
    (phase, agreement, counted)
}

/// Fits a constant grid through `beats`, with bar 1 where the most
/// `downbeats` fall. `hint` only chooses the tempo octave.
fn fit_own(beats: &[f64], downbeats: &[f64], hint: Option<Beatgrid>) -> Option<Refined> {
    let mut beats = beats.to_vec();
    beats.sort_by(f64::total_cmp);
    let mut period = median_gap(&beats)?;
    // Into the hint's octave, or else into the range the app reports.
    for _ in 0..3 {
        let target = hint.map_or_else(
            || {
                let bpm = 60.0 / period;
                if bpm >= MAX_BPM {
                    2.0
                } else if bpm < MIN_BPM {
                    0.5
                } else {
                    1.0
                }
            },
            |h| h.beat_length() / period,
        );
        if target > 1.5 {
            beats = every_other(&beats, downbeats);
        } else if target < 0.75 {
            beats = with_midpoints(&beats);
        } else {
            break;
        }
        period = median_gap(&beats)?;
    }
    if beats.len() < MIN_BEATS {
        return None;
    }

    // The network's times come in 20 ms steps, so the median gap is only
    // roughly the period. The mean of the single-beat gaps is close: the
    // rounding averages out.
    let single: Vec<f64> = beats
        .windows(2)
        .map(|w| w[1] - w[0])
        .filter(|g| (g / period - 1.0).abs() < 0.2)
        .collect();
    if single.len() >= MIN_BEATS {
        period = single.iter().sum::<f64>() / single.len() as f64;
    }
    // Number each beat by counting the beats in the gap since the last one
    // kept, which a breakdown with no beats doesn't throw. A beat that
    // falls well between two (a stray onset) isn't counted.
    let mut numbered = Vec::with_capacity(beats.len());
    let (mut last, mut n) = (beats[0], 0.0);
    numbered.push((n, last));
    for &b in &beats[1..] {
        let gap = (b - last) / period;
        let k = gap.round();
        if k >= 1.0 && (gap - k).abs() < 0.15 {
            n += k;
            last = b;
            numbered.push((n, b));
        }
    }
    if numbered.len() < MIN_BEATS {
        return None;
    }
    // Fit time = offset + period * n by least squares. With that tempo,
    // number every beat again from the line and refit, leaving out beats
    // far from it.
    let (mut offset, mut period) = line(&numbered)?;
    let mut used = numbered.clone();
    for _ in 0..3 {
        let kept: Vec<(f64, f64)> = beats
            .iter()
            .map(|&t| (((t - offset) / period).round(), t))
            .filter(|&(n, t)| (t - offset - period * n).abs() < OUTLIER)
            .collect();
        if kept.len() < MIN_BEATS {
            break;
        }
        used = kept;
        (offset, period) = line(&used)?;
    }
    let rms = |offset: f64, period: f64| {
        let sum: f64 = used
            .iter()
            .map(|&(n, t)| (t - offset - period * n).powi(2))
            .sum();
        (sum / used.len() as f64).sqrt()
    };
    let mut error = rms(offset, period);

    // Most electronic music sits on a whole or half BPM: take it if the
    // beats fit it about as well.
    let bpm = 60.0 / period;
    for round in [bpm.round(), (bpm * 2.0).round() / 2.0] {
        if (round - bpm).abs() < 0.05 && round != bpm {
            let p = 60.0 / round;
            let o = used.iter().map(|&(n, t)| t - p * n).sum::<f64>() / used.len() as f64;
            let e = rms(o, p);
            if e <= error * 1.05 + 0.001 {
                (offset, period, error) = (o, p, e);
                break;
            }
        }
    }

    // Bar 1: the beat of the four that the most downbeats land on.
    let (phase, agreement, _) = bar_vote(downbeats, offset, period);
    let first_beat = (offset + phase as f64 * period).rem_euclid(4.0 * period);
    Some(Refined {
        grid: Beatgrid {
            bpm: 60.0 / period,
            first_beat,
        },
        unsure: error > UNSURE_RMS || agreement < UNSURE_DOWNBEATS,
    })
}

/// The median gap between beats.
fn median_gap(beats: &[f64]) -> Option<f64> {
    let mut gaps: Vec<f64> = beats.windows(2).map(|w| w[1] - w[0]).collect();
    if gaps.len() < MIN_BEATS {
        return None;
    }
    let mid = gaps.len() / 2;
    Some(*gaps.select_nth_unstable_by(mid, f64::total_cmp).1).filter(|g| *g > 0.0)
}

/// Every other beat: the half that more downbeats fall on.
fn every_other(beats: &[f64], downbeats: &[f64]) -> Vec<f64> {
    let on_downbeat = |b: &&f64| {
        downbeats
            .iter()
            .any(|d| (d - **b).abs() < DOWNBEAT_TOLERANCE)
    };
    let even = beats.iter().step_by(2).filter(on_downbeat).count();
    let odd = beats.iter().skip(1).step_by(2).filter(on_downbeat).count();
    beats
        .iter()
        .skip(usize::from(odd > even))
        .step_by(2)
        .copied()
        .collect()
}

/// The beats with one added halfway between each two.
fn with_midpoints(beats: &[f64]) -> Vec<f64> {
    let mut out: Vec<f64> = beats.windows(2).map(|w| (w[0] + w[1]) / 2.0).collect();
    out.extend_from_slice(beats);
    out.sort_by(f64::total_cmp);
    out
}

/// Least-squares line through `(n, t)` points: `(offset, period)`.
fn line(points: &[(f64, f64)]) -> Option<(f64, f64)> {
    let len = points.len() as f64;
    let (mn, mt) = points
        .iter()
        .fold((0.0, 0.0), |(a, b), &(n, t)| (a + n / len, b + t / len));
    let (mut cov, mut var) = (0.0, 0.0);
    for &(n, t) in points {
        cov += (n - mn) * (t - mt);
        var += (n - mn).powi(2);
    }
    if var <= 0.0 {
        return None;
    }
    let period = cov / var;
    (period > 0.0).then_some((mt - period * mn, period))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Beats at `bpm` from `start`, each off by up to `jitter` seconds.
    fn beats(bpm: f64, start: f64, count: usize, jitter: f64) -> Vec<f64> {
        let mut seed = 12345u32;
        (0..count)
            .map(|k| {
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
                let r = (seed >> 16) as f64 / 65536.0 * 2.0 - 1.0;
                start + k as f64 * 60.0 / bpm + r * jitter
            })
            .collect()
    }

    #[test]
    fn a_steady_track_gets_its_tempo_and_bar_one() {
        let b = beats(124.0, 0.31, 400, 0.008);
        // Bars start on the third beat detected.
        let downbeats: Vec<f64> = b.iter().skip(2).step_by(4).copied().collect();
        let r = fit(&b, &downbeats, None).unwrap();
        assert_eq!(r.grid.bpm, 124.0);
        let beat = 60.0 / 124.0;
        let want = (0.31f64 + 2.0 * beat).rem_euclid(4.0 * beat);
        assert!((r.grid.first_beat - want).abs() < 0.005, "{:?}", r.grid);
        assert!(!r.unsure);
    }

    #[test]
    fn a_tempo_off_a_whole_bpm_stays_put() {
        let b = beats(123.37, 0.1, 400, 0.0);
        let r = fit(&b, &[], None).unwrap();
        assert!((r.grid.bpm - 123.37).abs() < 0.001, "{}", r.grid.bpm);
        // No downbeats to go by.
        assert!(r.unsure);
    }

    #[test]
    fn the_hint_sets_the_octave() {
        // The network hears drum & bass at 87; the DSP grid says 174.
        let b = beats(87.0, 0.2, 200, 0.0);
        let hint = Beatgrid {
            bpm: 174.0,
            first_beat: 0.2,
        };
        let r = fit_own(&b, &[], Some(hint)).unwrap();
        assert_eq!(r.grid.bpm, 174.0);
        // And hip-hop the other way, keeping the beats on downbeats.
        let b = beats(150.0, 0.2, 400, 0.0);
        let downbeats: Vec<f64> = b.iter().skip(1).step_by(8).copied().collect();
        let hint = Beatgrid {
            bpm: 75.0,
            first_beat: 0.0,
        };
        let r = fit_own(&b, &downbeats, Some(hint)).unwrap();
        assert_eq!(r.grid.bpm, 75.0);
        let beat = 60.0 / 75.0;
        let want = b[1].rem_euclid(4.0 * beat);
        assert!((r.grid.first_beat - want).abs() < 0.005, "{:?}", r.grid);
    }

    #[test]
    fn stray_beats_dont_pull_the_line() {
        let mut b = beats(128.0, 0.5, 300, 0.005);
        // A breakdown where the network heard a half-time pulse.
        b.retain(|t| !(60.0..75.0).contains(t));
        b.extend([61.3, 63.9, 66.1, 70.2]);
        let downbeats: Vec<f64> = b.iter().step_by(4).copied().collect();
        let r = fit(&b, &downbeats, None).unwrap();
        assert_eq!(r.grid.bpm, 128.0);
    }

    #[test]
    fn beats_on_the_dsp_grid_move_only_bar_one() {
        let beat = 60.0 / 126.0;
        let dsp = Beatgrid {
            bpm: 126.0,
            first_beat: 0.2,
        };
        // The network hears the same beats a little late, with bars
        // starting on the second.
        let b = beats(126.0, 0.21, 400, 0.01);
        let downbeats: Vec<f64> = b.iter().skip(1).step_by(4).copied().collect();
        let r = fit(&b, &downbeats, Some(dsp)).unwrap();
        assert_eq!(r.grid.bpm, 126.0);
        assert!(
            (r.grid.first_beat - (0.2 + beat)).abs() < 1e-9,
            "{:?}",
            r.grid
        );
        assert!(!r.unsure);
    }

    #[test]
    fn beats_between_the_dsp_beats_leave_the_dsp_grid() {
        let dsp = Beatgrid {
            bpm: 124.0,
            first_beat: 0.3,
        };
        // Locked onto the offbeat hi-hat.
        let b = beats(124.0, 0.3 + 30.0 / 124.0, 400, 0.005);
        let downbeats: Vec<f64> = b.iter().step_by(4).copied().collect();
        let r = fit(&b, &downbeats, Some(dsp)).unwrap();
        assert_eq!(r.grid, dsp);
        assert!(r.unsure);
    }

    #[test]
    fn too_few_beats_give_no_grid() {
        assert_eq!(fit(&beats(120.0, 0.0, 10, 0.0), &[], None), None);
    }

    #[test]
    fn the_built_in_models_load() {
        // Silence: the models load and run, and find no beats.
        let quiet = vec![0.0f32; 44_100 * 2 * 5];
        assert!(detect(&quiet, 44_100).is_ok());
    }
}
