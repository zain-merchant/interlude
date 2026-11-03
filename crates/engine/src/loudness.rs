//! Loudness: how loud a track sounds, so decks can load at matched levels.
//!
//! Integrated loudness per EBU R128 / ITU-R BS.1770-4, in LUFS: the audio
//! is K-weighted (a high shelf for the head, a high-pass below the bass),
//! its power measured over 400 ms blocks every 100 ms, and blocks gated
//! out that are silent (below -70 LUFS) or more than 10 LU under the rest,
//! so intros, breakdowns and fades don't pull the result down.
//!
//! The sample peak is kept too, so a quiet track is only turned up as far
//! as it can go without clipping.

/// Loudness the deck aims for when auto gain is on, in LUFS. Loud enough
/// to sit with most current masters (cut, never boosted), with headroom
/// for EQ boosts and two decks summed.
pub const TARGET_LUFS: f32 = -12.0;
/// The most auto gain cuts, and boosts, in dB.
pub const MAX_CUT_DB: f32 = 12.0;
pub const MAX_BOOST_DB: f32 = 9.0;

const ABSOLUTE_GATE: f64 = -70.0;
const RELATIVE_GATE: f64 = -10.0;

/// A track's measured loudness.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct Loudness {
    /// Integrated loudness, in LUFS. `None` for silence.
    pub lufs: Option<f32>,
    /// Highest sample, as a linear level (1.0 is full scale).
    pub peak: f32,
}

impl Loudness {
    /// The gain, in dB, that brings this track to `target` LUFS. Cuts are
    /// applied in full; boosts stop where the peak would reach full scale,
    /// so auto gain never makes a track clip on its own.
    pub fn gain_db(&self, target: f32) -> f32 {
        let Some(lufs) = self.lufs else { return 0.0 };
        let want = (target - lufs).clamp(-MAX_CUT_DB, MAX_BOOST_DB);
        if want <= 0.0 {
            return want;
        }
        let headroom = -crate::dsp::gain_to_db(self.peak).min(0.0);
        want.min(headroom)
    }
}

/// Measures interleaved stereo audio.
pub fn measure_loudness(stereo: &[f32], sample_rate: u32) -> Loudness {
    let mut b = LoudnessBuilder::new(sample_rate);
    b.push(stereo);
    b.finish()
}

/// One channel's K-weighting: a high shelf, then a high-pass. Run in
/// `f64`, since the shelf's coefficients sit close to the unit circle.
#[derive(Clone, Copy)]
struct KWeight {
    c: [[f64; 5]; 2],
    z: [[f64; 2]; 2],
}

impl KWeight {
    /// BS.1770's filters, redesigned for `sample_rate` from their analog
    /// prototypes (the standard gives coefficients for 48 kHz only).
    fn new(sample_rate: u32) -> Self {
        let fs = sample_rate as f64;
        let pi = std::f64::consts::PI;
        // Stage 1: high shelf, about +4 dB above 1.5 kHz.
        let (f0, g, q) = (
            1_681.974_450_955_533,
            3.999_843_853_973_347,
            0.707_175_236_955_419_6,
        );
        let k = (pi * f0 / fs).tan();
        let vh = 10f64.powf(g / 20.0);
        let vb = vh.powf(0.499_666_774_154_541_6);
        let a0 = 1.0 + k / q + k * k;
        let shelf = [
            (vh + vb * k / q + k * k) / a0,
            2.0 * (k * k - vh) / a0,
            (vh - vb * k / q + k * k) / a0,
            2.0 * (k * k - 1.0) / a0,
            (1.0 - k / q + k * k) / a0,
        ];
        // Stage 2: high-pass at 38 Hz.
        let (f0, q) = (38.135_470_876_024_44, 0.500_327_037_323_877_3);
        let k = (pi * f0 / fs).tan();
        let a0 = 1.0 + k / q + k * k;
        let hp = [
            1.0,
            -2.0,
            1.0,
            2.0 * (k * k - 1.0) / a0,
            (1.0 - k / q + k * k) / a0,
        ];
        Self {
            c: [shelf, hp],
            z: [[0.0; 2]; 2],
        }
    }

    #[inline]
    fn process(&mut self, x: f64) -> f64 {
        let mut x = x;
        for (c, z) in self.c.iter().zip(self.z.iter_mut()) {
            let y = c[0] * x + z[0];
            z[0] = c[1] * x - c[3] * y + z[1];
            z[1] = c[2] * x - c[4] * y;
            x = y;
        }
        x
    }
}

/// Measures audio fed in pieces of any size, so a track can be measured
/// while it is still being decoded.
pub(crate) struct LoudnessBuilder {
    filters: [KWeight; 2],
    /// Frames in 100 ms: a quarter of a gating block, and the step
    /// between blocks.
    step: usize,
    /// Sum of squares of the step being filled, and frames so far.
    sum: f64,
    filled: usize,
    /// Sum of squares (both channels) of every full step.
    steps: Vec<f64>,
    peak: f32,
}

impl LoudnessBuilder {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            filters: [KWeight::new(sample_rate); 2],
            step: (sample_rate as usize / 10).max(1),
            sum: 0.0,
            filled: 0,
            steps: Vec::new(),
            peak: 0.0,
        }
    }

    /// Adds interleaved stereo samples (an even number).
    pub fn push(&mut self, stereo: &[f32]) {
        let [fl, fr] = &mut self.filters;
        let mut sum = self.sum;
        let mut peak = self.peak;
        for &[l, r] in stereo.as_chunks::<2>().0 {
            peak = peak.max(l.abs()).max(r.abs());
            let l = fl.process(l as f64);
            let r = fr.process(r as f64);
            sum += l * l + r * r;
            self.filled += 1;
            if self.filled == self.step {
                self.steps.push(sum);
                sum = 0.0;
                self.filled = 0;
            }
        }
        self.sum = sum;
        self.peak = peak;
    }

    pub fn finish(self) -> Loudness {
        // Each gating block is four consecutive steps: 400 ms, 75% overlap.
        // Its power is the mean square per channel, summed over channels.
        let n = (self.step * 4) as f64;
        let blocks: Vec<f64> = self
            .steps
            .windows(4)
            .map(|w| w.iter().sum::<f64>() / n)
            .collect();
        let lufs = |power: f64| -0.691 + 10.0 * power.log10();
        let mean_above = |gate: f64| {
            let (sum, count) = blocks
                .iter()
                .filter(|&&p| p > 0.0 && lufs(p) > gate)
                .fold((0.0, 0usize), |(s, c), &p| (s + p, c + 1));
            (count > 0).then(|| sum / count as f64)
        };
        let gated =
            mean_above(ABSOLUTE_GATE).and_then(|ungated| mean_above(lufs(ungated) + RELATIVE_GATE));
        Loudness {
            lufs: gated.map(|p| lufs(p) as f32),
            peak: self.peak,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f64, amp: f32, secs: f64, sr: u32) -> Vec<f32> {
        let n = (sr as f64 * secs) as usize;
        (0..n)
            .flat_map(|i| {
                let s =
                    amp * (2.0 * std::f64::consts::PI * freq * i as f64 / sr as f64).sin() as f32;
                [s, s]
            })
            .collect()
    }

    #[test]
    fn full_scale_sine_on_one_channel_reads_minus_3_lufs() {
        // BS.1770's calibration: a 997 Hz sine at 0 dBFS, in one channel
        // of a stereo pair, reads -3.01 LUFS.
        let sr = 48_000;
        let one: Vec<f32> = sine(997.0, 1.0, 5.0, sr)
            .chunks(2)
            .flat_map(|f| [f[0], 0.0])
            .collect();
        let l = measure_loudness(&one, sr).lufs.unwrap();
        assert!((l + 3.01).abs() < 0.05, "got {l}");
    }

    #[test]
    fn same_reading_at_any_sample_rate() {
        for sr in [44_100, 48_000, 96_000] {
            let l = measure_loudness(&sine(1_000.0, 0.1, 5.0, sr), sr);
            let lufs = l.lufs.unwrap();
            // Stereo sine at -20 dBFS: about -20 LUFS (+0.69 dB of shelf).
            assert!((lufs + 20.0).abs() < 0.1, "{sr} Hz: {lufs}");
            assert!((l.peak - 0.1).abs() < 1e-3);
        }
    }

    #[test]
    fn quiet_intros_and_silence_are_gated_out() {
        let sr = 44_100;
        let loud = sine(1_000.0, 0.5, 40.0, sr);
        let mut track = vec![0.0; sr as usize * 2 * 10];
        track.extend(sine(1_000.0, 0.02, 10.0, sr)); // 28 dB down
        track.extend(&loud);
        track.extend(vec![0.0; sr as usize * 2 * 10]);
        let alone = measure_loudness(&loud, sr).lufs.unwrap();
        let all = measure_loudness(&track, sr).lufs.unwrap();
        assert!((alone - all).abs() < 0.1, "{alone} vs {all}");
    }

    #[test]
    fn bass_counts_for_less_than_mids() {
        let sr = 44_100;
        let sub = measure_loudness(&sine(30.0, 0.5, 5.0, sr), sr)
            .lufs
            .unwrap();
        let mid = measure_loudness(&sine(1_000.0, 0.5, 5.0, sr), sr)
            .lufs
            .unwrap();
        assert!(sub < mid - 1.0, "30 Hz {sub}, 1 kHz {mid}");
    }

    #[test]
    fn pieces_measure_the_same_as_the_whole() {
        let sr = 44_100;
        let audio = sine(440.0, 0.3, 6.0, sr);
        let whole = measure_loudness(&audio, sr);
        let mut b = LoudnessBuilder::new(sr);
        for piece in audio.chunks(2 * 999) {
            b.push(piece);
        }
        assert_eq!(b.finish(), whole);
    }

    #[test]
    fn silence_has_no_loudness_and_no_gain() {
        let silent = measure_loudness(&vec![0.0; 44_100 * 10], 44_100);
        assert_eq!(
            silent,
            Loudness {
                lufs: None,
                peak: 0.0
            }
        );
        assert_eq!(measure_loudness(&[], 44_100).lufs, None);
        assert_eq!(silent.gain_db(TARGET_LUFS), 0.0);
    }

    #[test]
    fn gain_cuts_in_full_and_boosts_only_up_to_the_peak() {
        let loud = Loudness {
            lufs: Some(-7.0),
            peak: 1.0,
        };
        assert_eq!(loud.gain_db(-12.0), -5.0);
        let quiet = Loudness {
            lufs: Some(-18.0),
            peak: 0.5,
        }; // 6 dB of headroom
        assert!((quiet.gain_db(-12.0) - 6.0).abs() < 0.05);
        let peaky = Loudness {
            lufs: Some(-16.0),
            peak: 1.0,
        };
        assert_eq!(peaky.gain_db(-12.0), 0.0);
        let whisper = Loudness {
            lufs: Some(-40.0),
            peak: 0.01,
        };
        assert_eq!(whisper.gain_db(-12.0), MAX_BOOST_DB);
    }
}
