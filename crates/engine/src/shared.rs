use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering::Relaxed};

use crate::NUM_DECKS;

/// An `f64` stored in an `AtomicU64`.
#[derive(Debug, Default)]
pub(crate) struct AtomicF64(AtomicU64);

impl AtomicF64 {
    pub fn load(&self) -> f64 {
        f64::from_bits(self.0.load(Relaxed))
    }
    pub fn store(&self, v: f64) {
        self.0.store(v.to_bits(), Relaxed)
    }
}

#[derive(Debug, Default)]
pub(crate) struct AtomicF32(AtomicU32);

impl AtomicF32 {
    pub fn load(&self) -> f32 {
        f32::from_bits(self.0.load(Relaxed))
    }
    pub fn store(&self, v: f32) {
        self.0.store(v.to_bits(), Relaxed)
    }
}

#[derive(Debug, Default)]
pub(crate) struct DeckShared {
    pub position: AtomicF64,
    pub duration: AtomicF64,
    pub cue: AtomicF64,
    pub rate: AtomicF64,
    pub playing: AtomicBool,
    pub loaded: AtomicBool,
    /// Bumped on every load so the UI knows to fetch the new waveform.
    pub generation: AtomicU64,
    pub peak: AtomicF32,
}

/// State the audio thread publishes for the UI, written once per block.
/// Reads are lock-free and never disturb playback.
#[derive(Debug, Default)]
pub struct SharedState {
    pub(crate) decks: [DeckShared; NUM_DECKS],
    pub(crate) master_peak: [AtomicF32; 2],
    pub(crate) sample_rate: AtomicU32,
}

/// A point-in-time copy of one deck's state.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct DeckSnapshot {
    pub loaded: bool,
    pub playing: bool,
    /// Seconds from the start of the track.
    pub position: f64,
    pub duration: f64,
    pub cue: f64,
    pub rate: f64,
    pub generation: u64,
    /// Peak level since the last block, 0.0..=1.0+.
    pub peak: f32,
}

impl SharedState {
    pub fn deck(&self, i: usize) -> DeckSnapshot {
        let d = &self.decks[i];
        DeckSnapshot {
            loaded: d.loaded.load(Relaxed),
            playing: d.playing.load(Relaxed),
            position: d.position.load(),
            duration: d.duration.load(),
            cue: d.cue.load(),
            rate: d.rate.load(),
            generation: d.generation.load(Relaxed),
            peak: d.peak.load(),
        }
    }

    pub fn master_peak(&self) -> [f32; 2] {
        [self.master_peak[0].load(), self.master_peak[1].load()]
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Relaxed)
    }
}
