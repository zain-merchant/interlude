//! Hardware DJ controller support.
//!
//! A [`Mapping`] turns raw MIDI from one controller model into engine
//! [`Command`]s and app [`Action`]s, and computes the LED messages to send
//! back. Mappings are plain state machines with no I/O, so they're tested
//! without hardware. [`midi::ControllerService`] connects them to real
//! devices, including hot-plugging.

pub mod flx4;
#[cfg(feature = "midi")]
pub mod midi;

use dj_engine::{Command, DeckId, DeckSnapshot, MixerSnapshot, SamplerSnapshot, NUM_DECKS};

/// What a controller asks the app to do.
#[derive(Debug)]
pub enum Action {
    /// Send this to the audio engine.
    Engine(Command),
    /// Move the library selection by this many rows.
    Browse(i32),
    /// Load the selected library track into a deck.
    LoadSelected(DeckId),
    /// Load the selected library track into this sampler slot.
    LoadSample(usize),
    /// A pad mode button was pressed: the deck's pads now work in `mode`.
    PadMode { deck: DeckId, mode: PadMode },
}

/// What a deck's performance pads do, chosen with the controller's pad mode
/// buttons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PadMode {
    HotCue,
    BeatLoop,
    BeatJump,
    Sampler,
    /// The FLX4's PAD FX1, which plays stems here.
    PadFx1,
    PadFx2,
    Keyboard,
    KeyShift,
}

/// The engine state a mapping needs to decide what a control does and what
/// its LEDs show.
#[derive(Debug, Clone, Copy, Default)]
pub struct State {
    pub decks: [DeckSnapshot; NUM_DECKS],
    pub mixer: MixerSnapshot,
    pub sampler: SamplerSnapshot,
}

/// One controller model's mapping.
pub trait Mapping: Send {
    /// Whether a MIDI port with this name belongs to the controller.
    fn matches(&self, port_name: &str) -> bool;
    /// Handles one incoming MIDI message.
    fn handle(&mut self, msg: &[u8], state: &State) -> Vec<Action>;
    /// MIDI messages that bring the controller's LEDs up to date with
    /// `state`. Only returns what changed since the last call.
    fn leds(&mut self, state: &State) -> Vec<Vec<u8>>;
    /// Forgets which LEDs were sent, e.g. after a reconnect.
    fn reset_leds(&mut self);
}

/// All mappings this build knows about.
pub fn mappings() -> Vec<Box<dyn Mapping>> {
    vec![Box::new(flx4::Flx4::new())]
}
