use std::sync::Arc;

use crate::{FxKind, Track};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EqBand {
    Low = 0,
    Mid = 1,
    High = 2,
}

/// A track's cue points as the library saves them, in seconds from the
/// start of the track.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SavedCues {
    pub cue: f64,
    pub hot_cues: [Option<f64>; crate::HOT_CUES],
    /// Loop in and loop out.
    pub saved_loop: Option<(f64, f64)>,
}

impl SavedCues {
    /// The commands that put these cues on a freshly loaded deck. Send
    /// them straight after its `Load`.
    pub fn commands(&self, deck: DeckId) -> impl Iterator<Item = Command> + '_ {
        let restore = Command::RestoreCue {
            deck,
            seconds: self.cue,
            saved_loop: self.saved_loop,
        };
        std::iter::once(restore).chain(
            self.hot_cues
                .iter()
                .enumerate()
                .filter(|(_, at)| at.is_some())
                .map(move |(index, &seconds)| Command::SetHotCue {
                    deck,
                    index,
                    seconds,
                }),
        )
    }
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
    /// jumped to. A paused deck starts playing from it; see
    /// [`Command::SetHotCuePlays`].
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
    /// Move the cue point, in seconds from the start of the track. Used to
    /// put a deck back the way it was (undoing a load).
    SetCue {
        deck: DeckId,
        seconds: f64,
    },
    /// Put back a track's saved cue point and loop right after loading
    /// it: the play head moves to the cue, and the loop is stored but not
    /// playing. See [`SavedCues::commands`].
    RestoreCue {
        deck: DeckId,
        seconds: f64,
        saved_loop: Option<(f64, f64)>,
    },
    /// Replace the loaded track's beatgrid (a grid fixed by hand), or with
    /// `None`, go back to the one detected on load.
    SetBeatgrid {
        deck: DeckId,
        grid: Option<crate::Beatgrid>,
    },
    /// Set (or with `None`, clear) hot cue `index` at a position in
    /// seconds, without jumping to it.
    SetHotCue {
        deck: DeckId,
        index: usize,
        seconds: Option<f64>,
    },
    /// Quantize, for both decks: cue points and loops snap to the beat,
    /// and hot cues and reloop jumps while playing keep the beat's timing.
    /// On by default.
    SetQuantize {
        on: bool,
    },
    /// For both decks: a hot cue pressed on a paused deck starts it playing
    /// (on, the default), or plays only while the pad is held, like the cue
    /// button (off).
    SetHotCuePlays {
        on: bool,
    },
    /// A deck started from pause (play, cue or a hot cue) while the other
    /// deck plays takes its tempo and beat, as if SYNC were pressed. On by
    /// default.
    SetAutoSync {
        on: bool,
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
    /// Which stems are audible: bit `n` is [`crate::Stem`] `n`. Every bit
    /// set plays the track as it is. A freshly loaded deck has all stems on.
    SetStems {
        deck: DeckId,
        mask: u8,
    },
    /// Slip mode: while a scratch, loop, held hot cue or pause interrupts
    /// a playing deck, the track keeps time underneath, and playback picks
    /// up from there when it ends. Off mid-slip stays where playback is.
    SetSlip {
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
    /// Auto gain in dB, under the trim: what brings the loaded track to
    /// a common loudness (see [`crate::Loudness::gain_db`]). Send it
    /// straight after `Load`, which puts it back to 0 dB.
    SetAutoGain {
        deck: DeckId,
        db: f32,
    },
    /// EQ band gain in dB. Values at or below [`crate::dsp::EQ_KILL_DB`] kill the band.
    SetEq {
        deck: DeckId,
        band: EqBand,
        db: f32,
    },
    /// Channel filter knob: -1.0 full low-pass, 0.0 off, 1.0 full high-pass.
    SetFilter {
        deck: DeckId,
        value: f32,
    },
    /// Which beat effect the deck's FX unit runs.
    SetFxKind {
        deck: DeckId,
        kind: FxKind,
    },
    /// Beat FX on or off. Echo and reverb tails ring out after off.
    SetFxOn {
        deck: DeckId,
        on: bool,
    },
    /// Beat FX level/depth, 0.0..=1.0.
    SetFxLevel {
        deck: DeckId,
        value: f32,
    },
    /// Beat FX timing in beats (echo time, reverb size, sweep length).
    /// See [`crate::fx::FX_BEATS`] for the usual steps.
    SetFxBeats {
        deck: DeckId,
        beats: f32,
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
    /// Put a sample in sampler slot `slot` (below [`crate::SAMPLER_SLOTS`]),
    /// replacing what it held. Like `Load`, the engine sends the old one
    /// back to be freed.
    LoadSample {
        slot: usize,
        sample: Arc<Track>,
    },
    /// Empty a sampler slot.
    ClearSample {
        slot: usize,
    },
    /// Play a sampler slot from the top, or from the top again if it's
    /// already playing. Samples play once, straight to the master.
    SamplePlay {
        slot: usize,
    },
    /// Stop a sampler slot.
    SampleStop {
        slot: usize,
    },
    /// Sampler level, 0.0..=1.0, for every slot.
    SetSamplerLevel {
        value: f32,
    },
}

impl Command {
    /// The deck a command acts on, if it's for one deck.
    pub fn deck(&self) -> Option<DeckId> {
        use Command::*;
        match *self {
            Load { deck, .. }
            | Eject { deck, .. }
            | Play { deck, .. }
            | Pause { deck, .. }
            | TogglePlay { deck, .. }
            | CuePress { deck, .. }
            | CueRelease { deck, .. }
            | HotCuePress { deck, .. }
            | HotCueRelease { deck, .. }
            | HotCueClear { deck, .. }
            | LoopToggle { deck, .. }
            | BeatLoop { deck, .. }
            | LoopScale { deck, .. }
            | LoopIn { deck, .. }
            | LoopOut { deck, .. }
            | ReloopExit { deck, .. }
            | BeatJump { deck, .. }
            | Seek { deck, .. }
            | SetCue { deck, .. }
            | RestoreCue { deck, .. }
            | SetBeatgrid { deck, .. }
            | SetHotCue { deck, .. }
            | SetRate { deck, .. }
            | SetBend { deck, .. }
            | SetKeylock { deck, .. }
            | SetSlip { deck, .. }
            | ScratchStart { deck, .. }
            | ScratchEnd { deck, .. }
            | ScratchTo { deck, .. }
            | Jog { deck, .. }
            | Sync { deck, .. }
            | SetGain { deck, .. }
            | SetEq { deck, .. }
            | SetFilter { deck, .. }
            | SetFxKind { deck, .. }
            | SetFxOn { deck, .. }
            | SetFxLevel { deck, .. }
            | SetFxBeats { deck, .. }
            | SetFader { deck, .. }
            | SetPfl { deck, .. } => Some(deck),
            _ => None,
        }
    }
}
