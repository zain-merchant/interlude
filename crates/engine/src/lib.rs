//! Real-time DJ audio engine.
//!
//! The engine is split in two halves that never block each other:
//!
//! * [`Engine`] lives on the audio thread. It owns the decks and the mixer and
//!   renders audio in [`Engine::process`]. It never locks, allocates or touches
//!   the disk.
//! * [`EngineHandle`] lives anywhere else (UI, controller input, CLI). It sends
//!   [`Command`]s through a lock-free ring buffer and reads the engine's state
//!   back from atomics in [`SharedState`].
//!
//! Tracks are decoded fully into memory off the audio thread ([`Track::load`])
//! and handed to the engine as `Arc<Track>`. When a deck drops a track, the
//! engine sends the `Arc` back to the handle so the memory is freed off the
//! audio thread.

pub mod analysis;
pub mod beatthis;
mod command;
mod deck;
pub mod dsp;
mod engine;
pub mod fx;
pub mod key;
pub mod keynet;
mod limiter;
pub mod loudness;
mod mixer;
mod null_output;
#[cfg(feature = "output")]
pub mod output;
mod padfx;
mod record;
mod sampler;
mod shared;
pub mod stems;
mod stretch;
mod track;
pub mod waveform;

pub use analysis::Beatgrid;
pub use command::{Command, DeckId, EqBand, SavedCues};
pub use deck::{DEFAULT_LOOP_BEATS, HOT_CUES, MAX_LOOP_BEATS, MIN_LOOP_BEATS};
pub use engine::{
    new_engine, Engine, EngineHandle, GAIN_MAX_DB, GAIN_MIN_DB, MASTER_MAX_DB, MASTER_MIN_DB,
    MAX_BLOCK_FRAMES,
};
pub use fx::FxKind;
pub use key::Key;
pub use loudness::Loudness;
pub use null_output::{start_null, NullOutput};
pub use padfx::PadFx;
pub use record::{RecordError, RecordingStatus};
pub use sampler::{MAX_SAMPLE_SECS, SAMPLER_SLOTS};
pub use shared::{
    DeckSnapshot, FxSnapshot, MixerSnapshot, SampleSnapshot, SamplerSnapshot, SharedState,
};
pub use stems::{Stem, Stems, ALL_STEMS, STEMS};
pub use track::{LoadError, Track, TrackSummary};
pub use waveform::Waveform;

/// Number of decks. Phase 1 is a two-deck app; four decks come after the MVP.
pub const NUM_DECKS: usize = 2;
