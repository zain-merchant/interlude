//! Keylock and key shift: change a deck's tempo without changing its
//! pitch, or its pitch without changing its tempo.
//!
//! Uses WSOLA (waveform-similarity overlap-add). Two Hann-windowed grains,
//! each about 40 ms long, overlap by half. Each grain reads the source at
//! normal pitch (or, for key shift, a little faster or slower); a new grain starts every half grain, taken from wherever
//! the deck's play head has got to, so the tempo follows the play head while
//! the pitch stays put. To avoid phasing, the new grain's start is nudged by
//! up to ~12 ms to the spot whose waveform best matches what the old grain
//! is about to play.
//!
//! The play head itself still advances exactly at the deck's speed, so a
//! keylocked deck stays on its beatgrid and in sync.
//!
//! Real-time safe: the window is allocated up front, and grains read the
//! track's samples (with any muted stems taken out) directly, so there are
//! no buffers to fill.

use crate::dsp::hermite;
use crate::stems::Source;

/// Grain length in seconds.
const GRAIN_SECS: f64 = 0.040;
/// How far a grain may move to line up with the previous one, in seconds.
const SEARCH_SECS: f64 = 0.012;
/// Length of the waveform compared when lining grains up, in seconds.
const MATCH_SECS: f64 = 0.010;

#[derive(Clone, Copy, Default)]
struct Grain {
    /// Read position in source frames.
    src: f64,
    /// Output frames since the grain started; done at `window.len()`.
    phase: usize,
}

pub(crate) struct Stretcher {
    window: Vec<f32>,
    hop: usize,
    out_rate: f64,
    grains: [Grain; 2],
    /// Output frames until the next grain starts.
    until_next: usize,
    active: bool,
    /// The play head where the last block ended. A different play head at
    /// the next block means the deck jumped (seek, cue, sync), so restart.
    expect_pos: f64,
}

impl Stretcher {
    pub fn new(out_rate: f32) -> Self {
        let out_rate = out_rate as f64;
        let hop = (GRAIN_SECS * out_rate / 2.0).round().max(16.0) as usize;
        let n = hop * 2;
        // Periodic Hann: w[i] + w[i + hop] == 1, so two overlapping grains
        // sum to unity gain.
        let window = (0..n)
            .map(|i| (0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / n as f64).cos()) as f32)
            .collect();
        Self {
            window,
            hop,
            out_rate,
            grains: [Grain::default(); 2],
            until_next: 0,
            active: false,
            expect_pos: 0.0,
        }
    }

    pub fn active(&self) -> bool {
        self.active
    }

    /// Stops stretching; the next `begin` starts fresh.
    pub fn stop(&mut self) {
        self.active = false;
    }

    /// Call before a block that will use `next`. Restarts the grains if the
    /// stretcher was off or the play head jumped since the last block.
    pub fn begin(&mut self, pos: f64) {
        if self.active && (pos - self.expect_pos).abs() < 0.5 {
            return;
        }
        // One grain at full weight reading from `pos` right now; the other
        // finished, so it restarts on the first frame. The output picks up
        // exactly where direct playback left off, with no fade-in.
        self.grains[0] = Grain {
            src: pos,
            phase: self.hop,
        };
        self.grains[1] = Grain {
            src: pos,
            phase: self.window.len(),
        };
        self.until_next = 0;
        self.active = true;
    }

    /// Call after the block with the play head where it ended.
    pub fn end(&mut self, pos: f64) {
        self.expect_pos = pos;
    }

    /// The next output frame. `pos` is the deck's play head (source frames),
    /// `step` how far it moves per output frame, and `grain` how far each
    /// grain reads per output frame, which sets the pitch: the source to
    /// output sample rate ratio plays at the track's own pitch.
    pub fn next(&mut self, src: &Source, pos: f64, step: f64, grain: f64) -> (f32, f32) {
        if self.until_next == 0 {
            self.start_grain(src, pos, step, grain);
            self.until_next = self.hop;
        }
        self.until_next -= 1;

        let (mut l, mut r) = (0.0, 0.0);
        for g in &mut self.grains {
            if g.phase >= self.window.len() {
                continue;
            }
            let w = self.window[g.phase];
            let (gl, gr) = read(src, g.src);
            l += gl * w;
            r += gr * w;
            g.src += grain;
            g.phase += 1;
        }
        (l, r)
    }

    fn start_grain(&mut self, src: &Source, pos: f64, step: f64, grain: f64) {
        let n = self.window.len();
        let (old, new) = if self.grains[0].phase >= n {
            (1, 0)
        } else {
            (0, 1)
        };
        // Place the grain so its middle, where it's loudest, lands on the
        // play head: half a grain from now the play head is at
        // pos + hop * step, and the grain at start + hop * grain.
        let target = pos + self.hop as f64 * (step - grain);
        let reference = self.grains[old].src;
        let search = (SEARCH_SECS * self.out_rate * grain).round() as i64;
        let len = (MATCH_SECS * self.out_rate * grain).round().max(8.0) as i64;
        let offset = best_offset(src, reference, target, search, len);
        self.grains[new] = Grain {
            // Keep the reference's sub-frame position, so a perfect match
            // (playing at normal speed) continues the old grain exactly.
            src: target.round() + offset as f64 + reference.fract(),
            phase: 0,
        };
    }
}

/// Mono sample at integer frame `i`, silent outside the track.
fn mono(src: &Source, i: i64) -> f32 {
    let (l, r) = src.frame(i);
    l + r
}

/// The offset from `target` (within ±`search`) where the source best
/// matches the source at `reference`, by normalized cross-correlation.
fn best_offset(src: &Source, reference: f64, target: f64, search: i64, len: i64) -> i64 {
    let r0 = reference.floor() as i64;
    let t0 = target.round() as i64;
    let score = |k: i64| {
        let (mut xy, mut yy) = (0f32, 0f32);
        let c0 = t0 + k;
        let mut j = 0;
        while j < len {
            let x = mono(src, r0 + j);
            let y = mono(src, c0 + j);
            xy += x * y;
            yy += y * y;
            j += 2;
        }
        xy / (yy + 1e-6).sqrt()
    };
    // Coarse search in steps of 4 frames, then refine around the best.
    let mut best = (f32::MIN, 0i64);
    let mut k = -search;
    while k <= search {
        let s = score(k);
        if s > best.0 {
            best = (s, k);
        }
        k += 4;
    }
    let coarse = best.1;
    for k in (coarse - 3).max(-search)..=(coarse + 3).min(search) {
        let s = score(k);
        if s > best.0 {
            best = (s, k);
        }
    }
    best.1
}

/// Stereo sample at fractional frame `pos`, silent outside the track.
pub(crate) fn read(src: &Source, pos: f64) -> (f32, f32) {
    let i = pos.floor() as i64;
    let t = (pos - i as f64) as f32;
    let (a, b, c, d) = (
        src.frame(i - 1),
        src.frame(i),
        src.frame(i + 1),
        src.frame(i + 2),
    );
    (
        hermite(t, a.0, b.0, c.0, d.0),
        hermite(t, a.1, b.1, c.1, d.1),
    )
}
