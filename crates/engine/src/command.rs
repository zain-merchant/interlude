use std::sync::Arc;

use crate::Track;

/// Which deck a command targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckId {
    A = 0,
    B = 1,
}

impl DeckId {
    pub const ALL: [DeckId; crate::NUM_DECKS] = [DeckId::A, DeckId::B];

    pub fn index(self) -> usize {
        self as usize
    }

    pub fn from_index(i: usize) -> Option<DeckId> {
        match i {
            0 => Some(DeckId::A),
            1 => Some(DeckId::B),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EqBand {
    Low = 0,
    Mid = 1,
    High = 2,
}

/// A message from the control side to the audio thread.
///
/// Every variant is cheap to move and dropping one never frees memory on the
/// audio thread, except `Load`, whose `Arc` the engine keeps or sends back.
#[derive(Debug, Clone)]
pub enum Command {
    Load {
        deck: DeckId,
        track: Arc<Track>,
    },
    Eject {
        deck: DeckId,
    },
    Play {
        deck: DeckId,
    },
    Pause {
        deck: DeckId,
    },
    TogglePlay {
        deck: DeckId,
    },
    /// CDJ-style cue button pressed. See [`crate::Engine`] docs for behaviour.
    CuePress {
        deck: DeckId,
    },
    CueRelease {
        deck: DeckId,
    },
    /// Jump to a position, in seconds from the start of the track.
    Seek {
        deck: DeckId,
        seconds: f64,
    },
    /// Move the cue point, in seconds from the start of the track. Used to
    /// put a deck back the way it was (undoing a load).
    SetCue {
        deck: DeckId,
        seconds: f64,
    },
    /// Playback rate as a ratio: 1.0 is normal speed, 1.08 is +8%.
    SetRate {
        deck: DeckId,
        rate: f64,
    },
    /// Temporary rate bend added on top of the rate, e.g. +0.04 while a nudge
    /// button or jog wheel is held. Set back to 0.0 on release.
    SetBend {
        deck: DeckId,
        bend: f64,
    },
    /// Hand on the platter: playback follows `Jog` movements (and stops
    /// when the hand is still) until `ScratchEnd`.
    ScratchStart {
        deck: DeckId,
    },
    ScratchEnd {
        deck: DeckId,
    },
    /// A jog wheel moved by `seconds` of audio at normal speed. While
    /// scratching, the play head follows it. While playing, it nudges the
    /// tempo briefly, like pushing a record. While paused, it scrubs.
    Jog {
        deck: DeckId,
        seconds: f64,
    },
    /// Match this deck's tempo and beat phase to the other deck. Does
    /// nothing unless both decks have a beatgrid.
    Sync {
        deck: DeckId,
    },
    /// Trim gain in dB.
    SetGain {
        deck: DeckId,
        db: f32,
    },
    /// EQ band gain in dB. Values at or below [`crate::dsp::EQ_KILL_DB`] kill the band.
    SetEq {
        deck: DeckId,
        band: EqBand,
        db: f32,
    },
    /// Channel fader, 0.0..=1.0.
    SetFader {
        deck: DeckId,
        value: f32,
    },
    /// Send this deck to the headphone cue bus.
    SetPfl {
        deck: DeckId,
        on: bool,
    },
    /// Crossfader position, -1.0 (deck A) ..= 1.0 (deck B).
    SetCrossfader {
        value: f32,
    },
    /// Headphone mix: 0.0 is cue only, 1.0 is master only.
    SetCueMix {
        value: f32,
    },
    /// Master gain in dB.
    SetMasterGain {
        db: f32,
    },
}
