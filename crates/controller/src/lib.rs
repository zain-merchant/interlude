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

use dj_engine::{
    Command, DeckId, DeckSnapshot, MixerSnapshot, SamplerSnapshot, HOT_CUES, NUM_DECKS,
};

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

/// Remembers which controls are held down: a hand on a jog wheel, CUE or
/// a hot cue pad. Each of those changes what a deck does until it's let go,
/// so if the controller goes away mid-press (a cable pulled), the deck would
/// stay that way: stopped under a hand that isn't there, or previewing from
/// a cue. [`HeldControls::release`] lets go of them all.
///
/// It watches the commands any mapping sends, so it works for every
/// controller without the mapping having to track anything.
#[derive(Debug, Default, Clone)]
pub struct HeldControls {
    scratching: [bool; NUM_DECKS],
    cue: [bool; NUM_DECKS],
    hot_cues: [[bool; HOT_CUES]; NUM_DECKS],
}

impl HeldControls {
    /// Notes what `action` presses or lets go.
    pub fn observe(&mut self, action: &Action) {
        let Action::Engine(cmd) = action else {
            return;
        };
        match *cmd {
            Command::ScratchStart { deck } => self.scratching[deck.index()] = true,
            Command::ScratchEnd { deck } => self.scratching[deck.index()] = false,
            Command::CuePress { deck } => self.cue[deck.index()] = true,
            Command::CueRelease { deck } => self.cue[deck.index()] = false,
            Command::HotCuePress { deck, index } if index < HOT_CUES => {
                self.hot_cues[deck.index()][index] = true
            }
            Command::HotCueRelease { deck, index } if index < HOT_CUES => {
                self.hot_cues[deck.index()][index] = false
            }
            _ => {}
        }
    }

    /// Commands that let go of everything still held, and forgets it.
    pub fn release(&mut self) -> Vec<Action> {
        let mut out = vec![];
        for deck in DeckId::ALL {
            let d = deck.index();
            for index in 0..HOT_CUES {
                if self.hot_cues[d][index] {
                    out.push(Action::Engine(Command::HotCueRelease { deck, index }));
                }
            }
            if self.cue[d] {
                out.push(Action::Engine(Command::CueRelease { deck }));
            }
            if self.scratching[d] {
                out.push(Action::Engine(Command::ScratchEnd { deck }));
            }
        }
        *self = Self::default();
        out
    }
}

/// All mappings this build knows about.
pub fn mappings() -> Vec<Box<dyn Mapping>> {
    vec![Box::new(flx4::Flx4::new())]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine(cmd: Command) -> Action {
        Action::Engine(cmd)
    }

    fn names(actions: &[Action]) -> Vec<String> {
        actions.iter().map(|a| format!("{a:?}")).collect()
    }

    #[test]
    fn releases_what_is_still_held() {
        let mut held = HeldControls::default();
        let (a, b) = (DeckId::A, DeckId::B);
        for cmd in [
            Command::ScratchStart { deck: a },
            Command::CuePress { deck: b },
            Command::HotCuePress { deck: a, index: 2 },
            Command::HotCuePress { deck: a, index: 5 },
            Command::HotCueRelease { deck: a, index: 5 },
            Command::ScratchStart { deck: b },
            Command::ScratchEnd { deck: b },
            Command::TogglePlay { deck: a },
        ] {
            held.observe(&engine(cmd));
        }
        assert_eq!(
            names(&held.release()),
            names(&[
                engine(Command::HotCueRelease { deck: a, index: 2 }),
                engine(Command::ScratchEnd { deck: a }),
                engine(Command::CueRelease { deck: b }),
            ])
        );
        // Released once: nothing is held any more.
        assert!(held.release().is_empty());
    }

    #[test]
    fn ignores_out_of_range_hot_cues() {
        let mut held = HeldControls::default();
        held.observe(&engine(Command::HotCuePress {
            deck: DeckId::A,
            index: HOT_CUES + 3,
        }));
        held.observe(&Action::Browse(1));
        assert!(held.release().is_empty());
    }
}
