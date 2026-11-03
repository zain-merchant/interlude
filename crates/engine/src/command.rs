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
    /// Performance pad `index` (0-based, below [`crate::HOT_CUES`]) in hot
    /// cue mode. An empty hot cue is set at the play head; a set one is
    /// jumped to. A paused deck plays from it while held, like the cue button.
    HotCuePress {
        deck: DeckId,
        index: usize,
    },
    HotCueRelease {
        deck: DeckId,
        index: usize,
    },
    HotCueClear {
        deck: DeckId,
        index: usize,
    },
    /// Loop button: leaves the active loop, or starts a beat loop of the
    /// deck's loop size at the nearest beat. Needs a beatgrid.
    LoopToggle {
        deck: DeckId,
    },
    /// A loop of `beats` beats, or out of the loop if it's that long
    /// already. Sets the deck's loop size. Needs a beatgrid.
    BeatLoop {
        deck: DeckId,
        beats: f64,
    },
    /// Multiplies the loop size by `factor` (0.5 halves, 2.0 doubles),
    /// along with the active loop.
    LoopScale {
        deck: DeckId,
        factor: f64,
    },
    /// Sets the loop in point at the play head.
    LoopIn {
        deck: DeckId,
    },
    /// Sets the loop out point at the play head and starts looping.
    LoopOut {
        deck: DeckId,
    },
    /// Leaves the active loop, or jumps back into the last one.
    ReloopExit {
        deck: DeckId,
    },
    /// Moves the play head by `beats` beats, negative for back. An active
    /// loop moves with it. Needs a beatgrid.
    BeatJump {
        deck: DeckId,
        beats: f64,
    },
    /// Jump to a position, in seconds from the start of the track.
    Seek {
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
    /// Keylock: tempo changes (pitch fader, nudge, sync) keep the track's
    /// pitch instead of making it higher or lower.
    SetKeylock {
        deck: DeckId,
        on: bool,
    },
    /// Hand on the platter: playback follows `Jog` and `ScratchTo`
    /// movements, audibly and in either direction, and stops when the hand
    /// is still, until `ScratchEnd`. A playing deck slows to a halt under
    /// the hand and spins back up when released.
    ScratchStart {
        deck: DeckId,
    },
    ScratchEnd {
        deck: DeckId,
    },
    /// While scratching, move the hand to `seconds` from the start of the
    /// track, e.g. from dragging a waveform. Ignored otherwise.
    /// `since_last` is the time since the previous `ScratchTo` by the
    /// sender's clock (e.g. pointer event timestamps), which keeps the
    /// motion smooth however unevenly the messages arrive. `None` if unknown.
    ScratchTo {
        deck: DeckId,
        seconds: f64,
        since_last: Option<f64>,
    },
    /// A jog wheel moved by `seconds` of audio at normal speed. While
    /// scratching, the play head follows it. While playing, it nudges the
    /// tempo briefly, like pushing a record. While paused, it turns the
    /// record audibly, like scratching.
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
