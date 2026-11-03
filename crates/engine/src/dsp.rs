//! Small, allocation-free DSP building blocks used on the audio thread.

use std::f64::consts::PI;

/// EQ gains at or below this many dB are treated as a full kill.
pub const EQ_KILL_DB: f32 = -40.0;
/// Highest EQ boost allowed.
pub const EQ_MAX_DB: f32 = 6.0;
/// Crossover between the low and mid bands, in Hz.
pub const EQ_LOW_MID_HZ: f64 = 250.0;
/// Crossover between the mid and high bands, in Hz.
pub const EQ_MID_HIGH_HZ: f64 = 2_500.0;

pub fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

pub fn gain_to_db(gain: f32) -> f32 {
    20.0 * gain.max(1e-9).log10()
}

/// Gain for an EQ band. Kills fully at [`EQ_KILL_DB`] so DJs can drop the bass
/// out completely, like a hardware isolator.
pub fn eq_gain(db: f32) -> f32 {
    if db <= EQ_KILL_DB {
        0.0
    } else {
        db_to_gain(db.min(EQ_MAX_DB))
    }
}

/// Constant-power crossfader curve. `x` runs from -1.0 (deck A) to 1.0
/// (deck B). Returns `(gain_a, gain_b)`; both are about -3 dB in the middle.
pub fn crossfader_gains(x: f32) -> (f32, f32) {
    let t = ((x.clamp(-1.0, 1.0) + 1.0) * 0.5) * std::f32::consts::FRAC_PI_2;
    (t.cos(), t.sin())
}

/// A value that glides towards its target to avoid clicks ("zipper noise")
/// when a fader or knob moves.
#[derive(Debug, Clone, Copy)]
pub struct Smoothed {
    current: f32,
    target: f32,
    coeff: f32,
}

impl Smoothed {
    /// `time_ms` is roughly how long a full jump takes to settle (to ~63%).
    pub fn new(value: f32, time_ms: f32, sample_rate: f32) -> Self {
        let coeff = 1.0 - (-1.0 / (time_ms * 0.001 * sample_rate)).exp();
        Self {
            current: value,
            target: value,
            coeff,
        }
    }

    pub fn set(&mut self, target: f32) {
        self.target = target;
    }

    pub fn target(&self) -> f32 {
        self.target
    }

    #[inline]
    pub fn tick(&mut self) -> f32 {
        self.current += (self.target - self.current) * self.coeff;
        // Snap when close enough so we don't spend forever in denormals.
        if (self.target - self.current).abs() < 1e-6 {
            self.current = self.target;
        }
        self.current
    }
}

/// Second-order IIR filter (transposed direct form II), RBJ cookbook designs.
#[derive(Debug, Clone, Copy, Default)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn from_coeffs(b0: f64, b1: f64, b2: f64, a0: f64, a1: f64, a2: f64) -> Self {
        Self {
            b0: (b0 / a0) as f32,
            b1: (b1 / a0) as f32,
            b2: (b2 / a0) as f32,
            a1: (a1 / a0) as f32,
            a2: (a2 / a0) as f32,
            z1: 0.0,
            z2: 0.0,
        }
    }

    pub fn lowpass(freq: f64, q: f64, sample_rate: f64) -> Self {
        let w0 = 2.0 * PI * freq / sample_rate;
        let (sin, cos) = w0.sin_cos();
        let alpha = sin / (2.0 * q);
        Self::from_coeffs(
            (1.0 - cos) / 2.0,
            1.0 - cos,
            (1.0 - cos) / 2.0,
            1.0 + alpha,
            -2.0 * cos,
            1.0 - alpha,
        )
    }

    pub fn highpass(freq: f64, q: f64, sample_rate: f64) -> Self {
        let w0 = 2.0 * PI * freq / sample_rate;
        let (sin, cos) = w0.sin_cos();
        let alpha = sin / (2.0 * q);
        Self::from_coeffs(
            (1.0 + cos) / 2.0,
            -(1.0 + cos),
            (1.0 + cos) / 2.0,
            1.0 + alpha,
            -2.0 * cos,
            1.0 - alpha,
        )
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

/// 4th-order Linkwitz-Riley crossover for one channel. The low and high
/// outputs sum back to an all-pass, so a flat EQ is flat in magnitude.
#[derive(Debug, Clone, Copy)]
struct Lr4 {
    lp: [Biquad; 2],
    hp: [Biquad; 2],
}

impl Lr4 {
    fn new(freq: f64, sample_rate: f64) -> Self {
        let q = std::f64::consts::FRAC_1_SQRT_2;
        let lp = Biquad::lowpass(freq, q, sample_rate);
        let hp = Biquad::highpass(freq, q, sample_rate);
        Self {
            lp: [lp, lp],
            hp: [hp, hp],
        }
    }

    #[inline]
    fn split(&mut self, x: f32) -> (f32, f32) {
        let lo = self.lp[0].process(x);
        let lo = self.lp[1].process(lo);
        let hi = self.hp[0].process(x);
        let hi = self.hp[1].process(hi);
        (lo, hi)
    }

    fn reset(&mut self) {
        for f in self.lp.iter_mut().chain(self.hp.iter_mut()) {
            f.reset();
        }
    }
}

/// One channel of a 3-band DJ isolator EQ.
#[derive(Debug, Clone, Copy)]
struct IsolatorChannel {
    low_mid: Lr4,
    mid_high: Lr4,
    /// Runs the low band through the second crossover too, so its phase
    /// matches the mid and high bands and the bands sum flat.
    low_phase: Lr4,
}

impl IsolatorChannel {
    fn new(sample_rate: f64) -> Self {
        Self {
            low_mid: Lr4::new(EQ_LOW_MID_HZ, sample_rate),
            mid_high: Lr4::new(EQ_MID_HIGH_HZ, sample_rate),
            low_phase: Lr4::new(EQ_MID_HIGH_HZ, sample_rate),
        }
    }

    #[inline]
    fn process(&mut self, x: f32, g: [f32; 3]) -> f32 {
        let (low, rest) = self.low_mid.split(x);
        let (mid, high) = self.mid_high.split(rest);
        let (l1, l2) = self.low_phase.split(low);
        (l1 + l2) * g[0] + mid * g[1] + high * g[2]
    }

    fn reset(&mut self) {
        self.low_mid.reset();
        self.mid_high.reset();
        self.low_phase.reset();
    }
}

/// Stereo 3-band isolator EQ with smoothed band gains.
#[derive(Debug, Clone)]
pub struct Eq3 {
    channels: [IsolatorChannel; 2],
    gains: [Smoothed; 3],
}

impl Eq3 {
    pub fn new(sample_rate: f32) -> Self {
        let ch = IsolatorChannel::new(sample_rate as f64);
        Self {
            channels: [ch, ch],
            gains: [Smoothed::new(1.0, 10.0, sample_rate); 3],
        }
    }

    /// Set a band's gain in dB (see [`eq_gain`]).
    pub fn set_band_db(&mut self, band: usize, db: f32) {
        self.gains[band].set(eq_gain(db));
    }

    /// Process one stereo frame in place.
    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let g = [
            self.gains[0].tick(),
            self.gains[1].tick(),
            self.gains[2].tick(),
        ];
        (
            self.channels[0].process(l, g),
            self.channels[1].process(r, g),
        )
    }

    pub fn reset(&mut self) {
        for c in &mut self.channels {
            c.reset();
        }
    }
}

/// 4-point, 3rd-order Hermite interpolation between `y1` and `y2`.
#[inline]
pub fn hermite(t: f32, y0: f32, y1: f32, y2: f32, y3: f32) -> f32 {
    let c0 = y1;
    let c1 = 0.5 * (y2 - y0);
    let c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
    let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    ((c3 * t + c2) * t + c1) * t + c0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, sr: f32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin())
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Runs a mono sine through the EQ and returns output RMS / input RMS,
    /// ignoring the first half while the filters settle.
    fn eq_response(freq: f32, db: [f32; 3]) -> f32 {
        let sr = 48_000.0;
        let input = sine(freq, sr, 48_000);
        let mut eq = Eq3::new(sr);
        for (b, d) in db.iter().enumerate() {
            eq.set_band_db(b, *d);
        }
        // Let the gain smoothing settle before measuring.
        for _ in 0..4_800 {
            eq.process(0.0, 0.0);
        }
        let out: Vec<f32> = input.iter().map(|&x| eq.process(x, x).0).collect();
        rms(&out[24_000..]) / rms(&input[24_000..])
    }

    #[test]
    fn flat_eq_is_flat() {
        for f in [40.0, 250.0, 1_000.0, 2_500.0, 10_000.0] {
            let r = eq_response(f, [0.0, 0.0, 0.0]);
            assert!((r - 1.0).abs() < 0.02, "{f} Hz gave {r}");
        }
    }

    #[test]
    fn low_kill_removes_bass_but_keeps_mids() {
        let bass = eq_response(50.0, [EQ_KILL_DB, 0.0, 0.0]);
        let mid = eq_response(1_000.0, [EQ_KILL_DB, 0.0, 0.0]);
        assert!(
            gain_to_db(bass) < -30.0,
            "bass only dropped to {} dB",
            gain_to_db(bass)
        );
        assert!((mid - 1.0).abs() < 0.05, "mid changed to {mid}");
    }

    #[test]
    fn high_kill_removes_treble() {
        let hi = eq_response(12_000.0, [0.0, 0.0, EQ_KILL_DB]);
        assert!(gain_to_db(hi) < -30.0);
    }

    #[test]
    fn crossfader_is_constant_power() {
        for i in 0..=20 {
            let x = -1.0 + i as f32 * 0.1;
            let (a, b) = crossfader_gains(x);
            assert!((a * a + b * b - 1.0).abs() < 1e-5);
        }
        assert_eq!(crossfader_gains(-1.0).1, 0.0);
        assert!(crossfader_gains(1.0).0.abs() < 1e-6);
    }

    #[test]
    fn hermite_passes_through_points() {
        assert_eq!(hermite(0.0, 0.0, 1.0, 2.0, 3.0), 1.0);
        assert!((hermite(1.0, 0.0, 1.0, 2.0, 3.0) - 2.0).abs() < 1e-6);
        assert!((hermite(0.5, 0.0, 1.0, 2.0, 3.0) - 1.5).abs() < 1e-6);
    }
}
