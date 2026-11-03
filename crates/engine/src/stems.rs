//! Stems: a track split into vocals, melody, bass and drums.
//!
//! A separator (outside the engine) fills a [`Stems`] buffer piece by piece
//! while the track plays, starting near the play head. The audio thread reads
//! it lock-free: each block of frames has a ready flag, and until a block is
//! ready the deck plays the original audio there.
//!
//! Only vocals, bass and drums are stored. Melody is whatever is left: the
//! original minus those three. So with every stem on, a deck plays the
//! original file sample for sample, and turning a stem off and on again
//! never changes the sound.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};

/// The four stems, in the order the deck shows them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stem {
    Vocals = 0,
    Melody = 1,
    Bass = 2,
    Drums = 3,
}

impl Stem {
    pub const ALL: [Stem; STEMS] = [Stem::Vocals, Stem::Melody, Stem::Bass, Stem::Drums];
}

/// Number of stems a deck can mute.
pub const STEMS: usize = 4;
/// Every stem audible.
pub const ALL_STEMS: u8 = (1 << STEMS) - 1;

/// The stems stored per frame: vocals, bass, drums. Melody is derived.
pub const STORED: usize = 3;
/// Index of each stored stem within a frame.
pub const STORED_VOCALS: usize = 0;
pub const STORED_BASS: usize = 1;
pub const STORED_DRUMS: usize = 2;

/// Frames per ready flag: about 0.37 s at 44.1 kHz.
pub const BLOCK_FRAMES: usize = 1 << 14;

/// Samples are stored as 16-bit with 6 dB of headroom: a stem can peak a
/// little above the mix it came from.
const SCALE: f32 = 16384.0;

/// The separated stems of one track, at the track's own sample rate.
///
/// Each stored stem frame is one `AtomicU32` holding left and right as two
/// 16-bit samples, so the audio thread reads a frame with a single load.
/// 6 minutes of stems take about 190 MB.
pub struct Stems {
    frames: usize,
    data: Box<[AtomicU32]>,
    ready: Box<[AtomicBool]>,
    ready_count: AtomicUsize,
}

impl std::fmt::Debug for Stems {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Stems")
            .field("frames", &self.frames)
            .field("ready", &self.ready_fraction())
            .finish()
    }
}

#[inline]
fn pack(l: f32, r: f32) -> u32 {
    let q = |x: f32| ((x * SCALE).round().clamp(-32768.0, 32767.0) as i16) as u16 as u32;
    q(l) | (q(r) << 16)
}

#[inline]
fn unpack(v: u32) -> (f32, f32) {
    (
        (v as u16 as i16) as f32 / SCALE,
        ((v >> 16) as u16 as i16) as f32 / SCALE,
    )
}

impl Stems {
    /// Empty stems for a track of `frames` frames: nothing ready yet.
    pub fn new(frames: usize) -> Self {
        let blocks = frames.div_ceil(BLOCK_FRAMES);
        Self {
            frames,
            data: (0..frames * STORED).map(|_| AtomicU32::new(0)).collect(),
            ready: (0..blocks).map(|_| AtomicBool::new(false)).collect(),
            ready_count: AtomicUsize::new(0),
        }
    }

    pub fn frames(&self) -> usize {
        self.frames
    }

    pub fn blocks(&self) -> usize {
        self.ready.len()
    }

    /// Writes stored stem `stem` (see [`STORED`]) at `frame`. Becomes audible
    /// once its block is marked ready.
    #[inline]
    pub fn write(&self, frame: usize, stem: usize, l: f32, r: f32) {
        if frame < self.frames {
            self.data[frame * STORED + stem].store(pack(l, r), Ordering::Relaxed);
        }
    }

    /// Stored stem `stem` at `frame`, whether or not it's ready.
    pub fn get(&self, frame: usize, stem: usize) -> (f32, f32) {
        unpack(self.data[frame * STORED + stem].load(Ordering::Relaxed))
    }

    /// Marks block `block` ready: everything written to it so far is
    /// published to the audio thread.
    pub fn mark_ready(&self, block: usize) {
        if let Some(r) = self.ready.get(block) {
            if !r.swap(true, Ordering::Release) {
                self.ready_count.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    pub fn is_block_ready(&self, block: usize) -> bool {
        self.ready
            .get(block)
            .is_some_and(|r| r.load(Ordering::Acquire))
    }

    /// Share of the track that's ready, 0.0 to 1.0.
    pub fn ready_fraction(&self) -> f32 {
        if self.ready.is_empty() {
            return 1.0;
        }
        self.ready_count.load(Ordering::Relaxed) as f32 / self.ready.len() as f32
    }

    pub fn is_complete(&self) -> bool {
        self.ready_count.load(Ordering::Relaxed) == self.ready.len()
    }

    /// Vocals, bass and drums at `frame`, or `None` if its block isn't
    /// ready yet. Real-time safe.
    #[inline]
    pub fn frame(&self, frame: usize) -> Option<[(f32, f32); STORED]> {
        if frame >= self.frames || !self.ready[frame / BLOCK_FRAMES].load(Ordering::Acquire) {
            return None;
        }
        let i = frame * STORED;
        Some([
            unpack(self.data[i].load(Ordering::Relaxed)),
            unpack(self.data[i + 1].load(Ordering::Relaxed)),
            unpack(self.data[i + 2].load(Ordering::Relaxed)),
        ])
    }
}

/// How much of each stem a deck plays, folded into the weights the mix
/// formula needs: `out = m·orig + v·vocals + b·bass + d·drums`, where melody
/// is `orig - vocals - bass - drums`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct StemMix {
    orig: f32,
    vocals: f32,
    bass: f32,
    drums: f32,
}

impl StemMix {
    pub const FULL: StemMix = StemMix {
        orig: 1.0,
        vocals: 0.0,
        bass: 0.0,
        drums: 0.0,
    };

    /// From per-stem gains in [`Stem`] order.
    pub fn from_gains(g: [f32; STEMS]) -> Self {
        let melody = g[Stem::Melody as usize];
        Self {
            orig: melody,
            vocals: g[Stem::Vocals as usize] - melody,
            bass: g[Stem::Bass as usize] - melody,
            drums: g[Stem::Drums as usize] - melody,
        }
    }

    pub fn is_full(&self) -> bool {
        *self == Self::FULL
    }
}

/// What a deck reads its audio from: the track's samples, and its stems
/// mixed in as the stem buttons say. Cheap to copy; the deck makes a fresh
/// one each frame as stem fades move.
#[derive(Clone, Copy)]
pub(crate) struct Source<'a> {
    pub samples: &'a [f32],
    pub stems: Option<&'a Stems>,
    pub mix: StemMix,
}

impl<'a> Source<'a> {
    pub fn frames(&self) -> i64 {
        (self.samples.len() / 2) as i64
    }

    /// Stereo frame `i` as the deck should hear it; silent outside the track.
    #[inline]
    pub fn frame(&self, i: i64) -> (f32, f32) {
        if i < 0 || i >= self.frames() {
            return (0.0, 0.0);
        }
        let i = i as usize;
        let (l, r) = (self.samples[i * 2], self.samples[i * 2 + 1]);
        if self.mix.is_full() {
            return (l, r);
        }
        let Some(s) = self.stems.and_then(|s| s.frame(i)) else {
            return (l, r);
        };
        let m = &self.mix;
        let [v, b, d] = s;
        (
            m.orig * l + m.vocals * v.0 + m.bass * b.0 + m.drums * d.0,
            m.orig * r + m.vocals * v.1 + m.bass * b.1 + m.drums * d.1,
        )
    }
}

/// The waveform of what a deck plays with the stems in `mask` on (bit `n`
/// is [`Stem`] `n`), so muted stems drop out of the picture. Parts not
/// split yet show the original.
pub fn waveform_for(track: &crate::Track, mask: u8) -> crate::Waveform {
    let gains = std::array::from_fn(|i| if mask & (1 << i) != 0 { 1.0 } else { 0.0 });
    let src = Source {
        samples: &track.samples,
        stems: track.stems.get().map(|s| &**s),
        mix: StemMix::from_gains(gains),
    };
    if src.mix.is_full() || src.stems.is_none() {
        return track.waveform.clone();
    }
    let mut builder = crate::waveform::WaveformBuilder::new(track.sample_rate);
    let mut chunk = Vec::with_capacity(2 * 8192);
    let frames = track.frames() as i64;
    let mut f = 0;
    while f < frames {
        chunk.clear();
        for i in f..(f + 8192).min(frames) {
            let (l, r) = src.frame(i);
            chunk.push(l);
            chunk.push(r);
        }
        builder.push(&chunk);
        f += 8192;
    }
    builder.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_round_trips_within_16_bits() {
        for &(l, r) in &[(0.0, 0.0), (0.5, -0.25), (-1.9, 1.9), (0.123, -0.987)] {
            let (a, b) = unpack(pack(l, r));
            assert!(
                (a - l).abs() < 1e-4 && (b - r).abs() < 1e-4,
                "{l} {r} -> {a} {b}"
            );
        }
        // Clipped, not wrapped.
        assert_eq!(unpack(pack(5.0, -5.0)).0, 32767.0 / SCALE);
    }

    fn filled(frames: usize) -> (Vec<f32>, Stems) {
        let samples: Vec<f32> = (0..frames * 2)
            .map(|i| ((i % 97) as f32 - 48.0) / 100.0)
            .collect();
        let stems = Stems::new(frames);
        for f in 0..frames {
            let (l, r) = (samples[f * 2], samples[f * 2 + 1]);
            // Vocals a quarter, bass a fifth, drums a tenth of the mix.
            stems.write(f, STORED_VOCALS, l * 0.25, r * 0.25);
            stems.write(f, STORED_BASS, l * 0.2, r * 0.2);
            stems.write(f, STORED_DRUMS, l * 0.1, r * 0.1);
        }
        (samples, stems)
    }

    #[test]
    fn not_ready_plays_the_original() {
        let (samples, stems) = filled(100);
        let src = Source {
            samples: &samples,
            stems: Some(&stems),
            mix: StemMix::from_gains([0.0, 1.0, 1.0, 1.0]),
        };
        assert_eq!(src.frame(10), (samples[20], samples[21]));
    }

    #[test]
    fn muting_removes_exactly_that_stem() {
        let (samples, stems) = filled(BLOCK_FRAMES + 10);
        for b in 0..stems.blocks() {
            stems.mark_ready(b);
        }
        assert!(stems.is_complete());
        let at = |g: [f32; 4], i: i64| {
            Source {
                samples: &samples,
                stems: Some(&stems),
                mix: StemMix::from_gains(g),
            }
            .frame(i)
        };
        for i in [0i64, 5, 1000, BLOCK_FRAMES as i64 + 3] {
            let o = samples[i as usize * 2];
            // All on: the original, bit for bit.
            assert_eq!(at([1.0; 4], i).0, o);
            // Vocals off.
            assert!((at([0.0, 1.0, 1.0, 1.0], i).0 - o * 0.75).abs() < 2e-4);
            // Melody alone: 1 - 0.25 - 0.2 - 0.1.
            assert!((at([0.0, 1.0, 0.0, 0.0], i).0 - o * 0.45).abs() < 2e-4);
            // Drums alone.
            assert!((at([0.0, 0.0, 0.0, 1.0], i).0 - o * 0.1).abs() < 2e-4);
            // Everything off.
            assert!(at([0.0; 4], i).0.abs() < 1e-6);
        }
        assert_eq!(at([0.0; 4], -1), (0.0, 0.0));
    }
}
