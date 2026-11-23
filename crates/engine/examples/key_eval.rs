//! Compares KeyNet with the chromagram detector it replaced, on synthetic
//! tracks in every key, or on real files named after their key.
//!
//! ```sh
//! cargo run --release -p dj-engine --example key_eval
//! cargo run --release -p dj-engine --example key_eval -- "Track - 8A.mp3" ...
//! ```
//!
//! A real file is labelled by a Camelot code (`8A`) or key name (`Am`,
//! `F#`) as the last word of its name. Scores use the MIREX weights: the
//! right key 1, a fifth away 0.5, the relative key 0.3, the parallel key
//! 0.2.

use std::time::Instant;

use dj_engine::key::{detect_key, detect_key_chroma};
use dj_engine::{Key, Track};

const RATE: u32 = 44_100;

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    let cases: Vec<(String, Key, Vec<f32>, u32)> = if files.is_empty() {
        synthetic()
    } else {
        files
            .iter()
            .filter_map(|f| {
                let label = label(f)?;
                let t = Track::load(f).ok()?;
                Some((f.clone(), label, t.samples.clone(), t.sample_rate))
            })
            .collect()
    };
    let (mut net_score, mut old_score) = (0.0, 0.0);
    let (mut net_time, mut old_time) = (0.0, 0.0);
    for (name, want, audio, sr) in &cases {
        let t = Instant::now();
        let net = detect_key(audio, *sr);
        net_time += t.elapsed().as_secs_f64();
        let t = Instant::now();
        let old = detect_key_chroma(audio, *sr);
        old_time += t.elapsed().as_secs_f64();
        let (a, b) = (score(*want, net), score(*want, old));
        net_score += a;
        old_score += b;
        println!(
            "{name:40} want {:4} keynet {:4} ({a:.1})  chroma {:4} ({b:.1})",
            want.camelot(),
            net.map_or("-".into(), |k| k.camelot()),
            old.map_or("-".into(), |k| k.camelot()),
        );
    }
    let n = cases.len().max(1) as f64;
    println!(
        "\n{} tracks: keynet {:.1}% ({:.2} s each), chroma {:.1}% ({:.2} s each; keynet's time includes it)",
        cases.len(),
        100.0 * net_score / n,
        net_time / n,
        100.0 * old_score / n,
        old_time / n,
    );
}

/// The MIREX weighted score of `got` against `want`.
fn score(want: Key, got: Option<Key>) -> f64 {
    let Some(got) = got else { return 0.0 };
    let fifth = |k: Key| [k.transpose(7), k.transpose(5)];
    let relative = if want.minor {
        Key::new((want.tonic + 3) % 12, false)
    } else {
        Key::new((want.tonic + 9) % 12, true)
    };
    if got == want {
        1.0
    } else if got.minor == want.minor && fifth(want).contains(&got) {
        0.5
    } else if got == relative {
        0.3
    } else if got.tonic == want.tonic {
        0.2
    } else {
        0.0
    }
}

/// The key named by the last word of a file name.
fn label(path: &str) -> Option<Key> {
    let stem = std::path::Path::new(path).file_stem()?.to_str()?;
    let word = stem.split([' ', '_', '-']).rfind(|w| !w.is_empty())?;
    let all = (0..12u8).flat_map(|t| [Key::new(t, false), Key::new(t, true)]);
    let word = word.replace('#', "♯").replace('b', "♭");
    all.into_iter()
        .find(|k| k.camelot().eq_ignore_ascii_case(&word) || k.name() == word)
}

/// A minute of a simple arrangement in each of the 24 keys, in two styles:
/// pads, bass and a melody over a four-chord loop, with drums.
fn synthetic() -> Vec<(String, Key, Vec<f32>, u32)> {
    let mut out = vec![];
    for tonic in 0..12u8 {
        for minor in [false, true] {
            for style in 0..2 {
                let key = Key::new(tonic, minor);
                let name = format!("synthetic {} style {}", key.name(), style + 1);
                out.push((name, key, render(key, style), RATE));
            }
        }
    }
    out
}

fn render(key: Key, style: usize) -> Vec<f32> {
    const BPM: f64 = 124.0;
    let beat = 60.0 / BPM;
    let bars = 30;
    let len = (bars as f64 * 4.0 * beat * RATE as f64) as usize;
    let mut mono = vec![0.0f32; len];
    // Scale degrees in semitones, and the chord loop as scale degrees.
    let scale: [i32; 7] = if key.minor {
        [0, 2, 3, 5, 7, 8, 10]
    } else {
        [0, 2, 4, 5, 7, 9, 11]
    };
    let progression: [usize; 4] = match (key.minor, style) {
        (false, 0) => [0, 4, 5, 3], // I V vi IV
        (false, _) => [0, 3, 4, 0], // I IV V I
        (true, 0) => [0, 5, 2, 6],  // i VI III VII
        (true, _) => [0, 3, 4, 0],  // i iv v i
    };
    let note = |degree: usize, octave: i32| {
        let semis = scale[degree % 7] + 12 * (degree / 7) as i32;
        let midi = 48 + key.tonic as i32 + semis + 12 * octave;
        440.0 * 2f64.powf((midi - 69) as f64 / 12.0)
    };
    let mut rng = 0x1234_5678u32 + style as u32;
    let mut noise = move || {
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        rng as f32 / u32::MAX as f32 * 2.0 - 1.0
    };
    let add_tone = |buf: &mut [f32], start: f64, dur: f64, f: f64, amp: f32, harmonics: usize| {
        let s0 = (start * RATE as f64) as usize;
        let n = (dur * RATE as f64) as usize;
        for i in 0..n.min(buf.len().saturating_sub(s0)) {
            let t = i as f64 / RATE as f64;
            let env = (1.0 - i as f64 / n as f64).powf(0.5) * (t * 200.0).min(1.0);
            let mut v = 0.0;
            for h in 1..=harmonics {
                v += (std::f64::consts::TAU * f * h as f64 * t).sin() / h as f64;
            }
            buf[s0 + i] += amp * (env * v) as f32;
        }
    };
    for bar in 0..bars {
        let root = progression[bar % 4];
        let t0 = bar as f64 * 4.0 * beat;
        // Pad: the triad, held for the bar.
        for d in [root, root + 2, root + 4] {
            add_tone(&mut mono, t0, 4.0 * beat, note(d, 0), 0.06, 6);
        }
        for b in 0..4 {
            let t = t0 + b as f64 * beat;
            // Bass on the off-beat, and a melody note from the chord or scale.
            add_tone(
                &mut mono,
                t + beat / 2.0,
                beat / 2.0,
                note(root, -1),
                0.15,
                3,
            );
            let m = [root + 4, root + 2, root + 7, root + 1][(b + bar) % 4];
            add_tone(&mut mono, t, beat * 0.9, note(m, 1), 0.05, 2);
            // Kick: a falling sine. Hat: a burst of noise.
            let s0 = (t * RATE as f64) as usize;
            for i in 0..(0.15 * RATE as f64) as usize {
                if s0 + i >= len {
                    break;
                }
                let tt = i as f64 / RATE as f64;
                let f = 50.0 + 100.0 * (-tt * 30.0).exp();
                mono[s0 + i] +=
                    0.5 * ((std::f64::consts::TAU * f * tt).sin() * (-tt * 12.0).exp()) as f32;
            }
            let h0 = ((t + beat / 2.0) * RATE as f64) as usize;
            for i in 0..2000 {
                if h0 + i < len {
                    mono[h0 + i] += 0.05 * noise() * (-(i as f32) / 400.0).exp();
                }
            }
        }
    }
    mono.iter().flat_map(|&x| [x, x]).collect()
}
