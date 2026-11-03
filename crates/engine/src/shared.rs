use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::Relaxed};

use crate::{FxKind, NUM_DECKS};

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
    pub speed: AtomicF64,
    pub bpm: AtomicF64,
    pub playing: AtomicBool,
    pub loaded: AtomicBool,
    /// Bumped on every load so the UI knows to fetch the new waveform.
    pub generation: AtomicU64,
    pub peak: AtomicF32,
    pub gain_db: AtomicF32,
    pub eq_db: [AtomicF32; 3],
    pub fader: AtomicF32,
    pub pfl: AtomicBool,
    pub filter: AtomicF32,
    pub fx_kind: AtomicU8,
    pub fx_on: AtomicBool,
    pub fx_level: AtomicF32,
    pub fx_beats: AtomicF32,
}

/// State the audio thread publishes for the UI, written once per block.
/// Reads are lock-free and never disturb playback.
#[derive(Debug, Default)]
pub struct SharedState {
    pub(crate) decks: [DeckShared; NUM_DECKS],
    pub(crate) master_peak: [AtomicF32; 2],
    pub(crate) sample_rate: AtomicU32,
    pub(crate) crossfader: AtomicF32,
    pub(crate) cue_mix: AtomicF32,
    pub(crate) master_db: AtomicF32,
}

/// Mixer settings shared by both decks, so a UI can follow changes made on
/// a hardware controller.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct MixerSnapshot {
    /// -1.0 (deck A) ..= 1.0 (deck B).
    pub crossfader: f32,
    /// Headphones: 0.0 cue only ..= 1.0 master only.
    pub cue_mix: f32,
    pub master_db: f32,
}

/// A deck's beat FX unit.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct FxSnapshot {
    pub kind: FxKind,
    pub on: bool,
    /// Level/depth, 0.0..=1.0.
    pub level: f32,
    pub beats: f32,
}

/// A point-in-time copy of one deck's state.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct DeckSnapshot {
    pub loaded: bool,
    pub playing: bool,
    /// Seconds from the start of the track.
    pub position: f64,
    pub duration: f64,
    pub cue: f64,
    /// Pitch fader rate: 1.0 is normal speed.
    pub rate: f64,
    /// Actual playback speed right now: `rate` plus any nudge.
    pub speed: f64,
    /// The track's detected tempo at normal speed, 0.0 if unknown.
    /// Multiply by `speed` for the tempo being played.
    pub bpm: f64,
    pub generation: u64,
    /// Peak level since the last block, 0.0..=1.0+.
    pub peak: f32,
    /// Trim in dB.
    pub gain_db: f32,
    /// EQ low, mid, high in dB.
    pub eq_db: [f32; 3],
    /// Channel fader, 0.0..=1.0.
    pub fader: f32,
    /// Headphone cue on.
    pub pfl: bool,
    /// Filter knob: -1.0 low-pass ..= 0.0 off ..= 1.0 high-pass.
    pub filter: f32,
    pub fx: FxSnapshot,
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
            speed: d.speed.load(),
            bpm: d.bpm.load(),
            generation: d.generation.load(Relaxed),
            peak: d.peak.load(),
            gain_db: d.gain_db.load(),
            eq_db: std::array::from_fn(|b| d.eq_db[b].load()),
            fader: d.fader.load(),
            pfl: d.pfl.load(Relaxed),
            filter: d.filter.load(),
            fx: FxSnapshot {
                kind: FxKind::from_index(d.fx_kind.load(Relaxed)),
                on: d.fx_on.load(Relaxed),
                level: d.fx_level.load(),
                beats: d.fx_beats.load(),
            },
        }
    }

    pub fn mixer(&self) -> MixerSnapshot {
        MixerSnapshot {
            crossfader: self.crossfader.load(),
            cue_mix: self.cue_mix.load(),
            master_db: self.master_db.load(),
        }
    }

    pub fn master_peak(&self) -> [f32; 2] {
        [self.master_peak[0].load(), self.master_peak[1].load()]
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Relaxed)
    }
}
