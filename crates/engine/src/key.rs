//! Musical key detection.
//!
//! 1. Mix to mono and downsample to about 11 kHz; key lives below that.
//! 2. Take an FFT of each ~0.7 s frame and fold the spectrum from 55 Hz to
//!    1.76 kHz onto the 12 pitch classes (a chromagram). Each frame is
//!    normalized so loud sections don't outvote quiet ones.
//! 3. Correlate the track's average chroma with a major and a minor key
//!    profile rotated to all 12 tonics, and pick the best of the 24.
//!
//! Like every key detector, it can mistake a key for its relative
//! major/minor or a fifth away; those are also the harmonically compatible
//! neighbours, so the error is gentle for mixing.

use std::f64::consts::PI;

use crate::dsp::Biquad;

/// A musical key: a tonic pitch class and a mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct Key {
    /// Pitch class of the tonic: 0 = C, 1 = C♯/D♭, ... 11 = B.
    pub tonic: u8,
    pub minor: bool,
}

const MAJOR_NAMES: [&str; 12] = [
    "C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B",
];
const MINOR_NAMES: [&str; 12] = [
    "C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B",
];

impl Key {
    pub fn new(tonic: u8, minor: bool) -> Self {
        Self {
            tonic: tonic % 12,
            minor,
        }
    }

    /// Short name, e.g. "A♭" or "F♯m".
    pub fn name(&self) -> String {
        if self.minor {
            format!("{}m", MINOR_NAMES[self.tonic as usize])
        } else {
            MAJOR_NAMES[self.tonic as usize].to_string()
        }
    }

    /// Camelot wheel code, e.g. "8A" for A minor, "8B" for C major.
    pub fn camelot(&self) -> String {
        // Each step round the wheel is a fifth (7 semitones). 8B is C major
        // and 8A is A minor.
        let relative_major = if self.minor {
            (self.tonic + 3) % 12
        } else {
            self.tonic
        };
        let n = (relative_major as u32 * 7 + 7) % 12 + 1;
        format!("{n}{}", if self.minor { 'A' } else { 'B' })
    }

    /// The key `semitones` higher (or lower, if negative).
    pub fn transpose(self, semitones: i32) -> Self {
        Self::new(
            (self.tonic as i32 + semitones).rem_euclid(12) as u8,
            self.minor,
        )
    }

    /// 1..=24 for storing in an atomic; 0 means no key.
    pub(crate) fn code(key: Option<Key>) -> u32 {
        key.map_or(0, |k| 1 + k.tonic as u32 + if k.minor { 12 } else { 0 })
    }

    pub(crate) fn from_code(code: u32) -> Option<Key> {
        match code {
            1..=24 => Some(Key::new(((code - 1) % 12) as u8, code > 12)),
            _ => None,
        }
    }
}

impl std::fmt::Display for Key {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.name())
    }
}

/// Key profiles from Temperley (2001): how strongly each scale degree
/// suggests the key, starting from the tonic.
const MAJOR_PROFILE: [f64; 12] = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const MINOR_PROFILE: [f64; 12] = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

const TARGET_RATE: f64 = 11_025.0;
const FRAME: usize = 8192;
const LOW_HZ: f64 = 55.0;
const HIGH_HZ: f64 = 1_760.0;

/// Detects the key of interleaved stereo audio. Returns `None` for audio
/// without enough tonal content (silence, pure drums, very short clips).
pub fn detect_key(stereo: &[f32], sample_rate: u32) -> Option<Key> {
    let mut b = KeyBuilder::new(sample_rate);
    b.push(stereo);
    b.finish()
}

/// Detects the key of audio fed in pieces of any size, so a track can be
/// analyzed while it is still being decoded. The result is the same as
/// [`detect_key`] on the whole track.
pub(crate) struct KeyBuilder {
    factor: usize,
    lp: [Biquad; 2],
    /// Frames to skip before keeping the next one.
    skip: usize,
    chroma: Chroma,
}

impl KeyBuilder {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f64;
        let factor = (sr / TARGET_RATE).floor().max(1.0) as usize;
        let rate = sr / factor as f64;
        Self {
            factor,
            // Anti-alias before keeping every `factor`-th sample.
            lp: [
                Biquad::lowpass(rate * 0.4, 0.707, sr),
                Biquad::lowpass(rate * 0.4, 0.707, sr),
            ],
            skip: 0,
            chroma: Chroma::new(rate),
        }
    }

    /// Adds interleaved stereo samples (an even number).
    pub fn push(&mut self, stereo: &[f32]) {
        for [l, r] in stereo.as_chunks::<2>().0 {
            let x = self.lp[0].process(0.5 * (l + r));
            let x = self.lp[1].process(x);
            if self.skip == 0 {
                self.chroma.push(x);
                self.skip = self.factor;
            }
            self.skip -= 1;
        }
    }

    pub fn finish(self) -> Option<Key> {
        key_of(&self.chroma.finish()?)
    }
}

/// The best fitting of the 24 keys for a track's average chroma.
fn key_of(chroma: &[f64; 12]) -> Option<Key> {
    let chroma = *chroma;
    let mut best = (f64::MIN, Key::new(0, false));
    for tonic in 0..12 {
        for (minor, profile) in [(false, &MAJOR_PROFILE), (true, &MINOR_PROFILE)] {
            let rotated: [f64; 12] = std::array::from_fn(|pc| profile[(pc + 12 - tonic) % 12]);
            let r = pearson(&chroma, &rotated);
            if r > best.0 {
                best = (r, Key::new(tonic as u8, minor));
            }
        }
    }
    // A flat chroma (noise, drums) correlates weakly with everything.
    (best.0 > 0.3).then_some(best.1)
}

/// Average normalized chroma over a track, built from mono audio fed one
/// sample at a time: each full frame is analyzed as soon as it's in.
struct Chroma {
    /// Where each FFT bin goes: its pitch class and a weight.
    bins: Vec<(usize, usize, f64)>,
    window: Vec<f32>,
    fft: Fft,
    re: Vec<f32>,
    im: Vec<f32>,
    /// The frame being filled.
    frame: Vec<f32>,
    loudest: f64,
    /// Each frame's total and chroma.
    sums: Vec<(f64, [f64; 12])>,
}

impl Chroma {
    fn new(rate: f64) -> Self {
        // A bin's weight falls off between two semitones, so a bin halfway
        // between notes counts for neither.
        let bins = (1..FRAME / 2)
            .filter_map(|k| {
                let f = k as f64 * rate / FRAME as f64;
                if !(LOW_HZ..=HIGH_HZ).contains(&f) {
                    return None;
                }
                let midi = 69.0 + 12.0 * (f / 440.0).log2();
                let note = midi.round();
                let w = 1.0 - 2.0 * (midi - note).abs();
                Some((k, (note as i64).rem_euclid(12) as usize, w))
            })
            .collect();
        let window = (0..FRAME)
            .map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / FRAME as f64).cos()) as f32)
            .collect();
        Self {
            bins,
            window,
            fft: Fft::new(FRAME),
            re: vec![0f32; FRAME],
            im: vec![0f32; FRAME],
            frame: Vec::with_capacity(FRAME),
            loudest: 0.0,
            sums: Vec::new(),
        }
    }

    fn push(&mut self, x: f32) {
        self.frame.push(x);
        if self.frame.len() < FRAME {
            return;
        }
        for i in 0..FRAME {
            self.re[i] = self.frame[i] * self.window[i];
            self.im[i] = 0.0;
        }
        self.frame.clear();
        self.fft.run(&mut self.re, &mut self.im);
        let mut c = [0f64; 12];
        for &(k, pc, w) in &self.bins {
            let (re, im) = (self.re[k], self.im[k]);
            let mag = ((re * re + im * im) as f64).sqrt();
            c[pc] += mag * w;
        }
        let sum: f64 = c.iter().sum();
        self.loudest = self.loudest.max(sum);
        self.sums.push((sum, c));
    }

    /// The average chroma, or `None` if nothing tonal (or not one full
    /// frame).
    fn finish(self) -> Option<[f64; 12]> {
        let mut total = [0f64; 12];
        let mut frames = 0;
        // Skip near-silent frames (fade-ins, gaps), then weight the rest
        // equally.
        for (sum, c) in self.sums {
            if sum > self.loudest * 0.05 && sum > 1e-3 {
                for pc in 0..12 {
                    total[pc] += c[pc] / sum;
                }
                frames += 1;
            }
        }
        (frames > 0).then_some(total)
    }
}

fn pearson(a: &[f64; 12], b: &[f64; 12]) -> f64 {
    let ma = a.iter().sum::<f64>() / 12.0;
    let mb = b.iter().sum::<f64>() / 12.0;
    let (mut ab, mut aa, mut bb) = (0.0, 0.0, 0.0);
    for i in 0..12 {
        let (x, y) = (a[i] - ma, b[i] - mb);
        ab += x * y;
        aa += x * x;
        bb += y * y;
    }
    if aa <= 0.0 || bb <= 0.0 {
        0.0
    } else {
        ab / (aa * bb).sqrt()
    }
}

/// In-place radix-2 complex FFT of a fixed power-of-two size.
struct Fft {
    n: usize,
    cos: Vec<f32>,
    sin: Vec<f32>,
}

impl Fft {
    fn new(n: usize) -> Self {
        assert!(n.is_power_of_two());
        let (cos, sin) = (0..n / 2)
            .map(|i| {
                let a = -2.0 * PI * i as f64 / n as f64;
                (a.cos() as f32, a.sin() as f32)
            })
            .unzip();
        Self { n, cos, sin }
    }

    fn run(&self, re: &mut [f32], im: &mut [f32]) {
        let n = self.n;
        // Bit-reversal permutation.
        let mut j = 0;
        for i in 1..n {
            let mut bit = n >> 1;
            while j & bit != 0 {
                j ^= bit;
                bit >>= 1;
            }
            j |= bit;
            if i < j {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut len = 2;
        while len <= n {
            let half = len / 2;
            let stride = n / len;
            for start in (0..n).step_by(len) {
                for k in 0..half {
                    let (c, s) = (self.cos[k * stride], self.sin[k * stride]);
                    let (a, b) = (start + k, start + k + half);
                    let tr = re[b] * c - im[b] * s;
                    let ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            len <<= 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 44_100;

    fn freq(midi: i32) -> f64 {
        440.0 * 2f64.powf((midi - 69) as f64 / 12.0)
    }

    /// Plays chords (MIDI note lists), two seconds each, as a soft
    /// sawtooth-ish tone with a few harmonics, looping for `secs`.
    fn progression(chords: &[&[i32]], secs: f64) -> Vec<f32> {
        let n = (SR as f64 * secs) as usize;
        let tau = 2.0 * PI;
        (0..n)
            .flat_map(|i| {
                let t = i as f64 / SR as f64;
                let chord = chords[(t / 2.0) as usize % chords.len()];
                let ct = t % 2.0;
                let env = (ct * 40.0).min(1.0) * (-ct * 0.6).exp();
                let mut v = 0.0;
                for &m in chord {
                    let f = freq(m);
                    for h in 1..=4 {
                        v += (tau * f * h as f64 * t).sin() / (h * h) as f64;
                    }
                }
                let s = (0.15 * env * v) as f32;
                [s, s]
            })
            .collect()
    }

    fn check(chords: &[&[i32]], expect: Key) {
        let got = detect_key(&progression(chords, 40.0), SR).expect("no key found");
        assert_eq!(got, expect, "expected {expect}, got {got}");
    }

    #[test]
    fn detects_a_minor() {
        // Am Dm E Am, with the bass note an octave down. The E major
        // chord's G♯ is what tells minor apart from its relative major.
        check(
            &[
                &[45, 57, 60, 64],
                &[38, 57, 62, 65],
                &[40, 56, 59, 64],
                &[45, 57, 60, 64],
            ],
            Key::new(9, true),
        );
    }

    #[test]
    fn detects_c_major() {
        // C F G C.
        check(
            &[
                &[48, 60, 64, 67],
                &[41, 60, 65, 69],
                &[43, 59, 62, 67],
                &[48, 60, 64, 67],
            ],
            Key::new(0, false),
        );
    }

    #[test]
    fn detects_f_sharp_minor() {
        // F♯m Bm C♯ F♯m.
        check(
            &[
                &[42, 54, 57, 61],
                &[47, 59, 62, 66],
                &[37, 56, 61, 65],
                &[42, 54, 57, 61],
            ],
            Key::new(6, true),
        );
    }

    #[test]
    fn detects_e_flat_major() {
        // E♭ A♭ B♭ E♭.
        check(
            &[
                &[39, 55, 58, 63],
                &[44, 56, 60, 63],
                &[46, 58, 62, 65],
                &[39, 55, 58, 63],
            ],
            Key::new(3, false),
        );
    }

    #[test]
    fn silence_has_no_key() {
        assert_eq!(detect_key(&vec![0.0; SR as usize * 20], SR), None);
    }

    #[test]
    fn names_and_camelot() {
        assert_eq!(Key::new(9, true).name(), "Am");
        assert_eq!(Key::new(9, true).camelot(), "8A");
        assert_eq!(Key::new(0, false).camelot(), "8B");
        assert_eq!(Key::new(7, false).camelot(), "9B");
        assert_eq!(Key::new(6, true).name(), "F♯m");
        assert_eq!(Key::new(6, true).camelot(), "11A");
        assert_eq!(Key::new(8, false).name(), "A♭");
        assert_eq!(Key::new(8, false).camelot(), "4B");
        assert_eq!(Key::new(11, false).transpose(1), Key::new(0, false));
        assert_eq!(Key::new(0, true).transpose(-1), Key::new(11, true));
        for code in 0..=24 {
            assert_eq!(Key::code(Key::from_code(code)), code);
        }
    }
}
