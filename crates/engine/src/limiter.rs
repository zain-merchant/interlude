//! Master limiter: keeps the master output under full scale without the
//! harsh distortion of hard clipping.
//!
//! A look-ahead brickwall design. The signal is delayed by about 1.5 ms
//! while the limiter looks at what's coming, so the gain can glide down
//! before a peak arrives instead of slamming on it:
//!
//! 1. For each incoming frame, the gain that would bring it to the ceiling
//!    (both channels linked, so the stereo image doesn't shift).
//! 2. The lowest of those over the look-ahead window ("hold").
//! 3. Instant down, slow release back up.
//! 4. A moving average over the window, which turns each step into a
//!    smooth ramp that still reaches its target by the time the peak
//!    leaves the delay line.
//!
//! Below the ceiling it changes nothing: the gain stays at exactly 1 and
//! the output is the input, just later.
//!
//! Real-time safe: fixed-size buffers, no allocation.

/// Output never goes above this: -0.3 dBFS.
pub const CEILING: f32 = 0.966_051;
/// Look-ahead, and the length of the attack ramp, in seconds.
const LOOKAHEAD_SECS: f32 = 0.0015;
/// How long the gain takes to recover after a peak (to ~63%), in seconds.
const RELEASE_SECS: f32 = 0.150;
/// Room for the look-ahead at 192 kHz.
const MAX_WINDOW: usize = 512;

pub(crate) struct Limiter {
    /// Window length in frames; the signal comes out `window - 1` frames late.
    window: usize,
    /// Delayed audio, a ring of `window` stereo frames.
    delay: [[f32; 2]; MAX_WINDOW],
    /// Gain each frame in the window needs, a ring of `window`.
    need: [f32; MAX_WINDOW],
    /// Released gain for each frame in the window, a ring of `window`.
    held: [f32; MAX_WINDOW],
    /// Sum of `held`, for the moving average.
    sum: f64,
    pos: usize,
    release: f32,
    released: f32,
    /// Lowest gain applied since `take_reduction`.
    lowest: f32,
}

impl Limiter {
    pub fn new(sample_rate: f32) -> Self {
        let window = ((LOOKAHEAD_SECS * sample_rate).round() as usize).clamp(2, MAX_WINDOW);
        Self {
            window,
            delay: [[0.0; 2]; MAX_WINDOW],
            need: [1.0; MAX_WINDOW],
            held: [1.0; MAX_WINDOW],
            sum: window as f64,
            pos: 0,
            release: 1.0 - (-1.0 / (RELEASE_SECS * sample_rate)).exp(),
            released: 1.0,
            lowest: 1.0,
        }
    }

    /// How late the output is, in frames.
    pub fn latency(&self) -> usize {
        self.window - 1
    }

    /// Takes one stereo frame in and gives the frame from `latency()`
    /// frames ago back, limited.
    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> [f32; 2] {
        let w = self.window;
        let peak = l.abs().max(r.abs());
        let need = if peak > CEILING { CEILING / peak } else { 1.0 };

        // The frame after this one in the ring is the oldest, `w - 1`
        // frames back: it comes out now.
        self.delay[self.pos] = [l, r];
        let out = self.delay[(self.pos + 1) % w];
        self.need[self.pos] = need;

        // Hold: the lowest gain any frame in the window needs.
        let hold = self.need[..w].iter().copied().fold(1.0f32, f32::min);
        // Down at once, back up slowly.
        self.released = if hold < self.released {
            hold
        } else {
            self.released + (hold - self.released) * self.release
        };
        // Moving average over the window.
        self.sum += self.released as f64 - self.held[self.pos] as f64;
        self.held[self.pos] = self.released;
        self.pos = (self.pos + 1) % w;
        if self.pos == 0 {
            // Re-add from scratch now and then so rounding can't build up.
            self.sum = self.held[..w].iter().map(|&g| g as f64).sum();
        }
        let gain = ((self.sum / w as f64) as f32).min(1.0);
        self.lowest = self.lowest.min(gain);
        [out[0] * gain, out[1] * gain]
    }

    /// The deepest gain reduction since the last call, in dB (0 when the
    /// limiter hasn't touched the signal).
    pub fn take_reduction_db(&mut self) -> f32 {
        let g = std::mem::replace(&mut self.lowest, 1.0);
        -crate::dsp::gain_to_db(g).min(0.0)
    }
}

/// A plain stereo delay of a fixed number of frames, to keep another
/// signal lined up with the limiter's output.
pub(crate) struct Delay {
    len: usize,
    ring: [[f32; 2]; MAX_WINDOW],
    pos: usize,
}

impl Delay {
    pub fn new(frames: usize) -> Self {
        Self {
            len: frames.clamp(1, MAX_WINDOW),
            ring: [[0.0; 2]; MAX_WINDOW],
            pos: 0,
        }
    }

    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> [f32; 2] {
        let out = self.ring[self.pos];
        self.ring[self.pos] = [l, r];
        self.pos = (self.pos + 1) % self.len;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn sine(i: usize, freq: f32, amp: f32) -> f32 {
        amp * (std::f32::consts::TAU * freq * i as f32 / SR).sin()
    }

    #[test]
    fn quiet_signal_passes_unchanged_just_later() {
        let mut lim = Limiter::new(SR);
        let lat = lim.latency();
        let input: Vec<f32> = (0..4800).map(|i| sine(i, 440.0, 0.5)).collect();
        let out: Vec<[f32; 2]> = input.iter().map(|&x| lim.process(x, -x)).collect();
        for (o, &x) in out[lat..].iter().zip(&input) {
            assert_eq!(*o, [x, -x]);
        }
        assert_eq!(lim.take_reduction_db(), 0.0);
    }

    #[test]
    fn loud_signal_never_passes_the_ceiling() {
        let mut lim = Limiter::new(SR);
        let mut max = 0f32;
        // +12 dB over full scale, with a sudden jump halfway.
        for i in 0..48_000 {
            let amp = if i < 24_000 { 0.8 } else { 4.0 };
            let [l, r] = lim.process(sine(i, 100.0, amp), sine(i, 3_000.0, amp));
            max = max.max(l.abs()).max(r.abs());
        }
        assert!(max <= CEILING + 1e-5, "peak {max}");
        let db = lim.take_reduction_db();
        assert!((10.0..14.0).contains(&db), "reduction {db} dB");
    }

    #[test]
    fn single_spike_is_caught() {
        let mut lim = Limiter::new(SR);
        let mut max = 0f32;
        for i in 0..2_000 {
            let x = if i == 1_000 { 3.0 } else { 0.1 };
            let [l, _] = lim.process(x, x);
            max = max.max(l.abs());
        }
        assert!(max <= CEILING + 1e-5, "peak {max}");
    }

    #[test]
    fn gain_recovers_after_a_peak() {
        let mut lim = Limiter::new(SR);
        for i in 0..4_800 {
            lim.process(sine(i, 200.0, 2.0), 0.0);
        }
        lim.take_reduction_db();
        // A second at a safe level: back to unity.
        for i in 0..48_000 {
            lim.process(sine(i, 200.0, 0.5), 0.0);
        }
        lim.take_reduction_db();
        for i in 48_000..48_100 {
            lim.process(sine(i, 200.0, 0.5), 0.0);
        }
        assert!(lim.take_reduction_db() < 0.01);
    }

    #[test]
    fn delay_matches_limiter_latency() {
        let lim = Limiter::new(SR);
        let mut d = Delay::new(lim.latency());
        let out: Vec<f32> = (0..200).map(|i| d.process(i as f32, 0.0)[0]).collect();
        let lat = lim.latency();
        for (i, &x) in out.iter().enumerate().skip(lat) {
            assert_eq!(x, (i - lat) as f32);
        }
    }
}
