//! Waveform analysis for display.
//!
//! Each track is analyzed once into fixed-size bins. Every bin stores the
//! peak level and the energy in three frequency bands, so the UI can color
//! the waveform by frequency (bass, mids, highs) the way DJs expect.

use crate::dsp::Biquad;

/// Source frames per waveform bin. At 44.1 kHz this is about 172 bins per
/// second, enough detail for a zoomed-in scrolling waveform.
pub const FRAMES_PER_BIN: usize = 256;

/// One waveform bin, each value scaled to 0..=255.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
#[repr(C)]
pub struct Bin {
    pub peak: u8,
    pub low: u8,
    pub mid: u8,
    pub high: u8,
}

/// Builds a [`Waveform`] from audio fed in pieces of any size, so a track
/// can be analyzed while it is still being decoded. The result is the same
/// as [`Waveform::analyze`] on the whole track.
pub(crate) struct WaveformBuilder {
    sr: f64,
    low_lp: [Biquad; 2],
    high_hp: [Biquad; 2],
    /// The bin being filled: peak, low, mid, high, and frames so far.
    acc: [f32; 4],
    filled: usize,
    bins: Vec<Bin>,
}

impl WaveformBuilder {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f64;
        Self {
            sr,
            low_lp: [
                Biquad::lowpass(250.0, 0.707, sr),
                Biquad::lowpass(250.0, 0.707, sr),
            ],
            high_hp: [
                Biquad::highpass(2_500.0, 0.707, sr),
                Biquad::highpass(2_500.0, 0.707, sr),
            ],
            acc: [0.0; 4],
            filled: 0,
            bins: Vec::new(),
        }
    }

    /// Adds interleaved stereo samples (an even number).
    pub fn push(&mut self, stereo: &[f32]) {
        self.bins
            .reserve((self.filled + stereo.len() / 2) / FRAMES_PER_BIN);
        let [mut peak, mut lo, mut mi, mut hi] = self.acc;
        let mut frames = stereo.as_chunks::<2>().0;
        while !frames.is_empty() {
            // The rest of the current bin, or as much of it as there is.
            let (part, rest) = frames.split_at((FRAMES_PER_BIN - self.filled).min(frames.len()));
            frames = rest;
            for f in part {
                let x = 0.5 * (f[0] + f[1]);
                let l = self.low_lp[0].process(x);
                let l = self.low_lp[1].process(l);
                let h = self.high_hp[0].process(x);
                let h = self.high_hp[1].process(h);
                let m = x - l - h;
                peak = peak.max(f[0].abs()).max(f[1].abs());
                lo = lo.max(l.abs());
                mi = mi.max(m.abs());
                hi = hi.max(h.abs());
            }
            self.filled += part.len();
            if self.filled == FRAMES_PER_BIN {
                self.bins.push(bin([peak, lo, mi, hi]));
                (peak, lo, mi, hi) = (0.0, 0.0, 0.0, 0.0);
                self.filled = 0;
            }
        }
        self.acc = [peak, lo, mi, hi];
    }

    pub fn finish(mut self) -> Waveform {
        if self.filled > 0 {
            self.bins.push(bin(self.acc));
        }
        Waveform {
            bins_per_sec: self.sr / FRAMES_PER_BIN as f64,
            bins: self.bins,
        }
    }
}

fn bin([peak, lo, mi, hi]: [f32; 4]) -> Bin {
    Bin {
        peak: to_u8(peak),
        low: to_u8(lo),
        mid: to_u8(mi),
        high: to_u8(hi),
    }
}

#[derive(Debug, Clone, Default)]
pub struct Waveform {
    /// Bins per second of audio.
    pub bins_per_sec: f64,
    pub bins: Vec<Bin>,
}

fn to_u8(x: f32) -> u8 {
    // A gentle curve so quiet parts stay visible without clipping loud ones.
    (x.clamp(0.0, 1.0).sqrt() * 255.0).round() as u8
}

impl Waveform {
    pub fn analyze(stereo: &[f32], sample_rate: u32) -> Self {
        let mut b = WaveformBuilder::new(sample_rate);
        b.push(stereo);
        b.finish()
    }

    /// Downsamples to `n` bins (max per group) for the full-track overview.
    pub fn overview(&self, n: usize) -> Vec<Bin> {
        if self.bins.is_empty() || n == 0 {
            return Vec::new();
        }
        (0..n)
            .map(|i| {
                let a = i * self.bins.len() / n;
                let b = ((i + 1) * self.bins.len() / n)
                    .max(a + 1)
                    .min(self.bins.len());
                self.bins[a..b].iter().fold(Bin::default(), |acc, x| Bin {
                    peak: acc.peak.max(x.peak),
                    low: acc.low.max(x.low),
                    mid: acc.mid.max(x.mid),
                    high: acc.high.max(x.high),
                })
            })
            .collect()
    }

    /// Flattens bins to `[peak, low, mid, high, peak, low, ...]` bytes, the
    /// format the UI uploads straight into a GPU texture.
    pub fn to_bytes(bins: &[Bin]) -> Vec<u8> {
        bins.iter()
            .flat_map(|b| [b.peak, b.low, b.mid, b.high])
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(freq: f32, sr: u32, secs: f32) -> Vec<f32> {
        let n = (sr as f32 * secs) as usize;
        (0..n)
            .flat_map(|i| {
                let v = 0.8 * (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin();
                [v, v]
            })
            .collect()
    }

    #[test]
    fn bass_tone_shows_up_in_low_band() {
        let w = Waveform::analyze(&tone(60.0, 44_100, 1.0), 44_100);
        let b = w.bins[w.bins.len() / 2];
        assert!(b.low > 200 && b.high < 40, "{b:?}");
    }

    #[test]
    fn treble_tone_shows_up_in_high_band() {
        let w = Waveform::analyze(&tone(8_000.0, 44_100, 1.0), 44_100);
        let b = w.bins[w.bins.len() / 2];
        assert!(b.high > 200 && b.low < 40, "{b:?}");
    }

    #[test]
    fn overview_has_requested_length() {
        let w = Waveform::analyze(&tone(440.0, 44_100, 2.0), 44_100);
        assert_eq!(w.overview(100).len(), 100);
        assert_eq!(Waveform::to_bytes(&w.overview(10)).len(), 40);
    }
}
