//! Pioneer DDJ-FLX4.
//!
//! Message numbers follow Pioneer's published MIDI message list for the
//! DDJ-FLX4 (shared with the DDJ-400). Decks 1 and 2 send on MIDI channels
//! 1 and 2; the browser, crossfader and load buttons on channel 7. Knobs
//! and faders are 14-bit: the MSB arrives on CC `n`, then the LSB on
//! CC `n + 0x20`.
//!
//! The performance pads send on their own channels: 8 and 9 (plain and
//! with SHIFT) for deck 1, 10 and 11 for deck 2, with a different note
//! range for each pad mode. The controller switches pad modes itself;
//! hot cue, beat loop, beat jump, sampler and stems (PAD FX1) modes are
//! mapped. Both decks' sampler pads play the same eight slots. In PAD FX1
//! mode the top pads mute and unmute vocals, melody, bass and drums, and
//! the bottom pads play one of them alone. SHIFT + a beat jump pad jumps
//! 16 times as far (4 to 32 bars), and SHIFT + PLAY turns slip mode on and
//! off; the FLX4 has no slip button of its own. The pad mode buttons light
//! for the mode each deck is in (the controller doesn't light them itself)
//! and tell the app, which shows the matching controls.
//!
//! The CFX knobs drive each channel's filter. The beat FX section drives the
//! beat FX unit of the deck the channel select lever points at, as rekordbox
//! does: SELECT changes the effect (SHIFT goes back), BEAT ◀ ▶ the beat
//! length, LEVEL/DEPTH the level, and ON/OFF switches it (SHIFT + ON/OFF
//! turns both decks' effects off). Moving the lever moves the effect to the
//! new channel; MASTER (1&2) runs it on both decks together. Not mapped yet:
//! the other pad modes. The headphone level and master level knobs work in
//! the controller's own sound card and send no MIDI.

use dj_engine::dsp::{EQ_KILL_DB, EQ_MAX_DB};
use dj_engine::fx::FX_BEATS;
use dj_engine::{Command, DeckId, EqBand, FxKind, ALL_STEMS, HOT_CUES, NUM_DECKS, STEMS};

use std::time::{Duration, Instant};

use crate::{Action, Mapping, PadMode, State};

const NOTE_ON: u8 = 0x90;
const CC: u8 = 0xB0;
/// MIDI channel (0-based) of the browser, crossfader and load buttons.
const GLOBAL_CH: u8 = 6;

// Deck notes (channel = deck).
const PLAY: u8 = 0x0B;
/// SHIFT + PLAY/PAUSE: slip mode on / off.
const PLAY_SHIFT: u8 = 0x47;
const CUE: u8 = 0x0C;
const SHIFT: u8 = 0x3F;
const JOG_TOUCH: u8 = 0x36;
const JOG_TOUCH_SHIFT: u8 = 0x67;
const SYNC: u8 = 0x58;
const SYNC_SHIFT: u8 = 0x5C;
const HEADPHONE_CUE: u8 = 0x54;
const LOOP_IN: u8 = 0x10;
const LOOP_OUT: u8 = 0x11;
/// SHIFT + LOOP IN: the "4BEAT" printed under the button.
const LOOP_4_BEAT: u8 = 0x4C;
const RELOOP_EXIT: u8 = 0x4D;
/// CUE/LOOP CALL ◀ and ▶: halve and double the loop.
const LOOP_HALVE: u8 = 0x51;
const LOOP_DOUBLE: u8 = 0x53;
/// SHIFT + CUE/LOOP CALL ◀ and ▶: beat jump by the loop size.
const JUMP_BACK: u8 = 0x3E;
const JUMP_FORWARD: u8 = 0x3D;

/// MIDI channel (0-based) of deck 1's pads; SHIFT adds 1, deck 2 adds 2.
const PAD_CH: u8 = 7;
// First note of each pad mode; pads 1 to 8 follow.
const PAD_HOT_CUE: u8 = 0x00;
const PAD_STEMS: u8 = 0x10;
const PAD_BEAT_JUMP: u8 = 0x20;
const PAD_SAMPLER: u8 = 0x30;
const PAD_BEAT_LOOP: u8 = 0x60;
/// Pad mode buttons (deck notes), as (button, SHIFT + button): HOT CUE /
/// KEYBOARD, PAD FX1 / PAD FX2, BEAT JUMP / BEAT LOOP, SAMPLER / KEY SHIFT.
/// Each pair shares one LED.
const PAD_MODE_BUTTONS: [((u8, PadMode), (u8, PadMode)); 4] = [
    ((0x1B, PadMode::HotCue), (0x69, PadMode::Keyboard)),
    ((0x1E, PadMode::PadFx1), (0x6B, PadMode::PadFx2)),
    ((0x20, PadMode::BeatJump), (0x6D, PadMode::BeatLoop)),
    ((0x22, PadMode::Sampler), (0x6F, PadMode::KeyShift)),
];
/// Loop length of each pad in beat loop mode, in beats.
const PAD_LOOP_BEATS: [f64; 8] = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0];
/// Jump of each pad in beat jump mode, in beats: back on the left pad of
/// each pair, forward on the right.
const PAD_JUMP_BEATS: [f64; 8] = [-1.0, 1.0, -2.0, 2.0, -4.0, 4.0, -8.0, 8.0];
/// SHIFT + a beat jump pad jumps this many times as far: 4, 8, 16 and 32
/// bars, for skipping whole phrases.
const PAD_JUMP_SHIFT: f64 = 16.0;

// Deck CCs (MSB; LSB is +0x20).
const TEMPO: u8 = 0x00;
const TRIM: u8 = 0x04;
const EQ_HI: u8 = 0x07;
const EQ_MID: u8 = 0x0B;
const EQ_LOW: u8 = 0x0F;
const FADER: u8 = 0x13;

// Jog wheel CCs: relative, 0x40 = no movement.
const JOG_SIDE: u8 = 0x21;
const JOG_TOP: u8 = 0x22;
const JOG_TOP_VINYL_OFF: u8 = 0x23;
const JOG_SHIFT: u8 = 0x26;
const JOG_SHIFT_TOP: u8 = 0x29;

// Global channel.
const CROSSFADER: u8 = 0x1F;
/// CFX knobs for decks 1 and 2 (14-bit, on the global channel).
const CFX: [u8; NUM_DECKS] = [0x17, 0x18];
const BROWSE: u8 = 0x40;
const LOAD_A: u8 = 0x46;
const LOAD_B: u8 = 0x47;

/// MIDI channel (0-based) of the beat FX section. Some messages arrive on
/// the next channel while the lever is at CH2; both are accepted.
const FX_CH: u8 = 4;
const FX_SELECT: u8 = 0x63;
const FX_SELECT_SHIFT: u8 = 0x64;
/// BEAT ◀ and ▶: shorter and longer beat length.
const FX_BEAT_LEFT: u8 = 0x4A;
const FX_BEAT_RIGHT: u8 = 0x4B;
const FX_ON: u8 = 0x47;
const FX_ON_SHIFT: u8 = 0x43;
/// Channel select lever positions: on while the lever is there.
const FX_LEVER_CH1: u8 = 0x10;
const FX_LEVER_CH2: u8 = 0x11;
const FX_LEVER_MASTER: u8 = 0x14;
/// LEVEL/DEPTH knob (14-bit CC on the FX channel).
const FX_LEVEL: u8 = 0x02;

/// Jog ticks per platter revolution.
const JOG_TICKS_PER_REV: f64 = 720.0;
/// Seconds of audio per revolution, as on a 33⅓ RPM record.
const SECS_PER_REV: f64 = 60.0 / (100.0 / 3.0);
const SECS_PER_TICK: f64 = SECS_PER_REV / JOG_TICKS_PER_REV;
/// Shift + jog searches this much faster.
const SEARCH_SPEED: f64 = 20.0;

/// Pitch ranges cycled by SHIFT + SYNC, matching the app's range button.
const PITCH_RANGES: [f64; 3] = [0.08, 0.16, 0.5];
/// How close the pitch fader must come to the deck's real rate to take it
/// over after the rate changed elsewhere (SYNC, the app's own fader).
const PICKUP_TOLERANCE: f64 = 0.002;
/// How long the engine may take to report a rate the fader sent.
const TAKEOVER_LAG: Duration = Duration::from_millis(250);
/// How many sent rates count as the fader's own (see `DeckState::sent_rates`).
const SENT_HISTORY: usize = 32;

#[derive(Debug, Clone, Copy)]
struct DeckState {
    shift: bool,
    range_index: usize,
    /// Where the hardware fader last sat (0.0 top ..= 1.0 bottom), and the
    /// rate that meant in the range it was in.
    fader_value: Option<f64>,
    fader_rate: Option<f64>,
    /// Rates this mapping sent lately, newest first. The engine reports
    /// a rate a moment after it's sent, so while the fader moves quickly the
    /// deck shows one of these rather than the newest. A rate that isn't
    /// among them was set elsewhere (SYNC, the app's own fader), and the
    /// fader has to pick it up again before it takes control.
    sent_rates: [Option<f64>; SENT_HISTORY],
    /// When the fader last took the tempo over, and the deck's rate then.
    /// The engine reports the new rate a moment later; until it does, the
    /// old one doesn't mean the tempo was changed elsewhere.
    took_over: Option<(f64, Instant)>,
    /// Where the fader sits, as last told to the app while it doesn't
    /// control the tempo (see `Action::TempoPickup`).
    shown_pickup: Option<f64>,
    /// The pad mode the controller is in. It starts in hot cue mode, and
    /// pad presses correct this if it was left in another.
    pad_mode: PadMode,
}

impl DeckState {
    /// Whether the deck's tempo is one this fader set, or the one it just
    /// took over from and the engine hasn't caught up yet.
    fn owns(&self, rate: f64) -> bool {
        let same = |r: f64| (r - rate).abs() < 1e-9;
        self.sent_rates.iter().flatten().any(|&r| same(r))
            || self
                .took_over
                .is_some_and(|(r, at)| same(r) && at.elapsed() < TAKEOVER_LAG)
    }
}

impl Default for DeckState {
    fn default() -> Self {
        Self {
            shift: false,
            range_index: 0,
            fader_value: None,
            fader_rate: None,
            sent_rates: [None; SENT_HISTORY],
            took_over: None,
            shown_pickup: None,
            pad_mode: PadMode::HotCue,
        }
    }
}

/// The beat FX section: where the channel select lever points.
#[derive(Debug, Clone, Copy)]
struct FxSection {
    /// Lever positions reported on: CH1, CH2, MASTER.
    lever: [bool; 3],
    /// Decks the section drives.
    target: [bool; NUM_DECKS],
    /// Whether the lever has reported yet. Its first report only tells us
    /// where it already is, so it doesn't move any effect.
    known: bool,
}

impl Default for FxSection {
    fn default() -> Self {
        Self {
            lever: [false; 3],
            target: [true, false],
            known: false,
        }
    }
}

impl FxSection {
    fn decks(&self) -> impl Iterator<Item = usize> + '_ {
        (0..NUM_DECKS).filter(|&d| self.target[d])
    }

    /// The deck whose settings the section shows and steps from.
    fn primary(&self) -> usize {
        self.decks().next().unwrap_or(0)
    }
}

/// One LED: status byte (note on + channel), note, lit.
type Led = (u8, u8, bool);

pub struct Flx4 {
    decks: [DeckState; NUM_DECKS],
    /// MSBs waiting for their LSB, by (channel, CC).
    msb: [[u8; 0x20]; 16],
    /// LED state last sent, to send only changes.
    leds: Option<Vec<Led>>,
    fx: FxSection,
}

impl Default for Flx4 {
    fn default() -> Self {
        Self::new()
    }
}

impl Flx4 {
    pub fn new() -> Self {
        Self {
            decks: [DeckState::default(); NUM_DECKS],
            msb: [[0; 0x20]; 16],
            leds: None,
            fx: FxSection::default(),
        }
    }

    fn range(&self, d: usize) -> f64 {
        PITCH_RANGES[self.decks[d].range_index]
    }

    /// Widens deck `d`'s range until the deck's `rate` fits, so the fader
    /// can always reach a tempo set elsewhere (SYNC, the app's fader, which
    /// widens its own range the same way) and take it over. Only while the
    /// fader doesn't control the tempo: its position then means nothing yet.
    fn fit_range(&mut self, d: usize, rate: f64) {
        let s = &mut self.decks[d];
        if s.owns(rate) {
            return;
        }
        let before = s.range_index;
        while (rate - 1.0).abs() > PITCH_RANGES[s.range_index] + 1e-9
            && s.range_index + 1 < PITCH_RANGES.len()
        {
            s.range_index += 1;
        }
        if s.range_index != before {
            let range = PITCH_RANGES[s.range_index];
            s.fader_rate = s.fader_value.map(|v| 1.0 - range + v * 2.0 * range);
        }
    }

    /// Handles a pitch fader move to `value` (0.0 top ..= 1.0 bottom).
    /// Top is slower, like a turntable.
    fn tempo(&mut self, d: usize, value: f64, state: &State, out: &mut Vec<Action>) {
        if state.decks[d].loaded {
            self.fit_range(d, state.decks[d].rate);
        }
        let range = self.range(d);
        let rate = 1.0 - range + value * 2.0 * range;
        let deck = &state.decks[d];
        let s = &mut self.decks[d];
        let in_control = s.owns(deck.rate);
        let crossed = s
            .fader_rate
            .is_some_and(|prev| (prev - deck.rate) * (rate - deck.rate) <= 0.0);
        let close = (rate - deck.rate).abs() < PICKUP_TOLERANCE;
        s.fader_value = Some(value);
        s.fader_rate = Some(rate);
        // A stopped deck can jump; a playing one would lurch audibly.
        if in_control || crossed || close || !deck.playing {
            if !in_control {
                s.took_over = Some((deck.rate, Instant::now()));
            }
            s.sent_rates.rotate_right(1);
            s.sent_rates[0] = Some(rate);
            out.push(engine(Command::SetRate {
                deck: deck_id(d),
                rate,
            }));
        }
    }

    fn cycle_range(&mut self, d: usize) {
        let s = &mut self.decks[d];
        s.range_index = (s.range_index + 1) % PITCH_RANGES.len();
        // The fader's position now means a different rate: make it pick up
        // the current one again rather than jump.
        s.sent_rates = [None; SENT_HISTORY];
        s.took_over = None;
        s.fader_value = None;
        s.fader_rate = None;
    }

    fn deck_note(&mut self, d: usize, note: u8, pressed: bool, state: &State) -> Vec<Action> {
        let deck = deck_id(d);
        if let Some(mode) = PAD_MODE_BUTTONS
            .iter()
            .flat_map(|&(a, b)| [a, b])
            .find_map(|(n, m)| (n == note).then_some(m))
        {
            if !pressed {
                return vec![];
            }
            self.decks[d].pad_mode = mode;
            return vec![Action::PadMode { deck, mode }];
        }
        let cmd = match (note, pressed) {
            (SHIFT, p) => {
                self.decks[d].shift = p;
                return vec![];
            }
            (PLAY, true) => Command::TogglePlay { deck },
            (PLAY_SHIFT, true) => Command::SetSlip {
                deck,
                on: !state.decks[d].slip,
            },
            (CUE, true) => Command::CuePress { deck },
            (CUE, false) => Command::CueRelease { deck },
            (SYNC, true) => Command::Sync { deck },
            (SYNC_SHIFT, true) => {
                self.cycle_range(d);
                return vec![];
            }
            (HEADPHONE_CUE, true) => Command::SetPfl {
                deck,
                on: !state.decks[d].pfl,
            },
            (LOOP_IN, true) => Command::LoopIn { deck },
            (LOOP_OUT, true) => Command::LoopOut { deck },
            (LOOP_4_BEAT, true) => Command::BeatLoop { deck, beats: 4.0 },
            (RELOOP_EXIT, true) => Command::ReloopExit { deck },
            (LOOP_HALVE, true) => Command::LoopScale { deck, factor: 0.5 },
            (LOOP_DOUBLE, true) => Command::LoopScale { deck, factor: 2.0 },
            (JUMP_BACK, true) => Command::BeatJump {
                deck,
                beats: -state.decks[d].loop_beats,
            },
            (JUMP_FORWARD, true) => Command::BeatJump {
                deck,
                beats: state.decks[d].loop_beats,
            },
            (JOG_TOUCH | JOG_TOUCH_SHIFT, true) => Command::ScratchStart { deck },
            (JOG_TOUCH | JOG_TOUCH_SHIFT, false) => Command::ScratchEnd { deck },
            _ => return vec![],
        };
        vec![engine(cmd)]
    }

    /// A performance pad, in whichever mode the controller is in.
    fn pad(d: usize, shift: bool, note: u8, pressed: bool, state: &State) -> Vec<Action> {
        let deck = deck_id(d);
        let (mode, i) = (note & !0x07, (note & 0x07) as usize);
        let cmd = match (mode, shift, pressed) {
            (PAD_SAMPLER, false, true) => Command::SamplePlay { slot: i },
            // SHIFT stops a playing slot, and loads the selected track
            // into an empty one.
            (PAD_SAMPLER, true, true) => {
                let slot = state.sampler.slots[i];
                if !slot.loaded {
                    return vec![Action::LoadSample(i)];
                }
                Command::SampleStop { slot: i }
            }
            // Stems: pads 1-4 mute or unmute a stem, 5-8 play one alone
            // (again: all back on). Same with SHIFT held.
            (PAD_STEMS, _, true) => {
                let mask = state.decks[d].stems;
                let mask = if i < STEMS {
                    mask ^ (1 << i)
                } else if mask == 1 << (i - STEMS) {
                    ALL_STEMS
                } else {
                    1 << (i - STEMS)
                };
                Command::SetStems { deck, mask }
            }
            (PAD_HOT_CUE, false, true) => Command::HotCuePress { deck, index: i },
            (PAD_HOT_CUE, false, false) => Command::HotCueRelease { deck, index: i },
            (PAD_HOT_CUE, true, true) => Command::HotCueClear { deck, index: i },
            (PAD_BEAT_LOOP, _, true) => Command::BeatLoop {
                deck,
                beats: PAD_LOOP_BEATS[i],
            },
            (PAD_BEAT_JUMP, _, true) => Command::BeatJump {
                deck,
                beats: PAD_JUMP_BEATS[i] * if shift { PAD_JUMP_SHIFT } else { 1.0 },
            },
            _ => return vec![],
        };
        vec![engine(cmd)]
    }

    fn deck_cc(&mut self, d: usize, cc: u8, value: u8, state: &State) -> Vec<Action> {
        let deck = deck_id(d);
        let ticks = value as f64 - 64.0;
        match cc {
            JOG_SIDE | JOG_TOP | JOG_TOP_VINYL_OFF => {
                return vec![engine(Command::Jog {
                    deck,
                    seconds: ticks * SECS_PER_TICK,
                })]
            }
            JOG_SHIFT | JOG_SHIFT_TOP => {
                let deck_state = &state.decks[d];
                let seconds = (deck_state.position + ticks * SECS_PER_TICK * SEARCH_SPEED)
                    .clamp(0.0, deck_state.duration);
                return vec![engine(Command::Seek { deck, seconds })];
            }
            _ => {}
        }
        let Some(v) = self.fourteen_bit(d as u8, cc, value) else {
            return vec![];
        };
        let cmd = match cc - 0x20 {
            TEMPO => {
                let mut out = vec![];
                self.tempo(d, v, state, &mut out);
                return out;
            }
            TRIM => Command::SetGain {
                deck,
                db: trim_db(v),
            },
            EQ_HI => Command::SetEq {
                deck,
                band: EqBand::High,
                db: eq_db(v),
            },
            EQ_MID => Command::SetEq {
                deck,
                band: EqBand::Mid,
                db: eq_db(v),
            },
            EQ_LOW => Command::SetEq {
                deck,
                band: EqBand::Low,
                db: eq_db(v),
            },
            FADER => Command::SetFader {
                deck,
                value: v as f32,
            },
            _ => return vec![],
        };
        vec![engine(cmd)]
    }

    fn global(&mut self, status: u8, num: u8, value: u8) -> Vec<Action> {
        match (status, num) {
            (CC, BROWSE) => {
                // Relative: 1..=63 clockwise, 65..=127 counter-clockwise.
                let delta = if value < 64 {
                    value as i32
                } else {
                    value as i32 - 128
                };
                vec![Action::Browse(delta)]
            }
            (NOTE_ON, LOAD_A) if value > 0 => vec![Action::LoadSelected(DeckId::A)],
            (NOTE_ON, LOAD_B) if value > 0 => vec![Action::LoadSelected(DeckId::B)],
            (CC, _) => match self.fourteen_bit(GLOBAL_CH, num, value) {
                Some(v) if num - 0x20 == CROSSFADER => vec![engine(Command::SetCrossfader {
                    value: (v * 2.0 - 1.0) as f32,
                })],
                Some(v) => match CFX.iter().position(|&c| c == num - 0x20) {
                    Some(d) => vec![engine(Command::SetFilter {
                        deck: deck_id(d),
                        value: cfx_filter(v),
                    })],
                    None => vec![],
                },
                None => vec![],
            },
            _ => vec![],
        }
    }

    /// The beat FX section.
    fn fx(&mut self, kind: u8, num: u8, value: u8, state: &State) -> Vec<Action> {
        let pressed = value > 0;
        let p = state.decks[self.fx.primary()].fx;
        let target = self.fx.target;
        let each = |f: &dyn Fn(DeckId) -> Command| -> Vec<Action> {
            (0..NUM_DECKS)
                .filter(|&d| target[d])
                .map(|d| engine(f(deck_id(d))))
                .collect()
        };
        match (kind, num) {
            (NOTE_ON, FX_SELECT | FX_SELECT_SHIFT) if pressed => {
                let n = FxKind::ALL.len();
                let step = if num == FX_SELECT { 1 } else { n - 1 };
                let kind = FxKind::ALL[(p.kind as usize + step) % n];
                each(&|deck| Command::SetFxKind { deck, kind })
            }
            (NOTE_ON, FX_BEAT_LEFT | FX_BEAT_RIGHT) if pressed => {
                let i = nearest_beat(p.beats);
                let i = if num == FX_BEAT_LEFT {
                    i.saturating_sub(1)
                } else {
                    (i + 1).min(FX_BEATS.len() - 1)
                };
                let beats = FX_BEATS[i];
                each(&|deck| Command::SetFxBeats { deck, beats })
            }
            (NOTE_ON, FX_ON) if pressed => {
                let on = !p.on;
                each(&|deck| Command::SetFxOn { deck, on })
            }
            (NOTE_ON, FX_ON_SHIFT) if pressed => (0..NUM_DECKS)
                .map(|d| {
                    engine(Command::SetFxOn {
                        deck: deck_id(d),
                        on: false,
                    })
                })
                .collect(),
            (NOTE_ON, FX_LEVER_CH1 | FX_LEVER_CH2 | FX_LEVER_MASTER) => {
                let i = match num {
                    FX_LEVER_CH1 => 0,
                    FX_LEVER_CH2 => 1,
                    _ => 2,
                };
                self.fx.lever[i] = pressed;
                self.move_fx(state)
            }
            (CC, _) => match self.fourteen_bit(FX_CH, num, value) {
                Some(v) if num - 0x20 == FX_LEVEL => {
                    let value = v as f32;
                    each(&|deck| Command::SetFxLevel { deck, value })
                }
                _ => vec![],
            },
            _ => vec![],
        }
    }

    /// Points the FX section where the lever now is, taking the effect
    /// along: decks it leaves stop (echo and reverb tails ring out), decks
    /// it reaches pick up its settings.
    fn move_fx(&mut self, state: &State) -> Vec<Action> {
        let [ch1, ch2, master] = self.fx.lever;
        let target = if master { [true, true] } else { [ch1, ch2] };
        // Between positions the lever can briefly report none.
        if target == [false, false] || target == self.fx.target {
            self.fx.known = true;
            return vec![];
        }
        let from = state.decks[self.fx.primary()].fx;
        let before = std::mem::replace(&mut self.fx.target, target);
        if !std::mem::replace(&mut self.fx.known, true) {
            return vec![];
        }
        let mut out = vec![];
        for d in 0..NUM_DECKS {
            let deck = deck_id(d);
            match (before[d], target[d]) {
                (true, false) if state.decks[d].fx.on => {
                    out.push(engine(Command::SetFxOn { deck, on: false }))
                }
                (false, true) => {
                    out.push(engine(Command::SetFxKind {
                        deck,
                        kind: from.kind,
                    }));
                    out.push(engine(Command::SetFxBeats {
                        deck,
                        beats: from.beats,
                    }));
                    out.push(engine(Command::SetFxLevel {
                        deck,
                        value: from.level,
                    }));
                    out.push(engine(Command::SetFxOn { deck, on: from.on }));
                }
                _ => {}
            }
        }
        out
    }

    /// Stores an MSB, or combines an LSB with its MSB into 0.0..=1.0.
    fn fourteen_bit(&mut self, ch: u8, cc: u8, value: u8) -> Option<f64> {
        match cc {
            0x00..=0x1F => {
                self.msb[ch as usize][cc as usize] = value;
                None
            }
            0x20..=0x3F => {
                let msb = self.msb[ch as usize][(cc - 0x20) as usize] as u16;
                Some(((msb << 7) | value as u16) as f64 / 16383.0)
            }
            _ => None,
        }
    }
}

impl Mapping for Flx4 {
    fn matches(&self, port_name: &str) -> bool {
        port_name.to_ascii_uppercase().contains("DDJ-FLX4")
    }

    fn handle(&mut self, msg: &[u8], state: &State) -> Vec<Action> {
        let [status, num, value] = *msg else {
            return vec![];
        };
        let kind = status & 0xF0;
        let ch = status & 0x0F;
        // Note-off may arrive as 0x80 or as note-on with velocity 0.
        let (kind, value) = if kind == 0x80 {
            (NOTE_ON, 0)
        } else {
            (kind, value)
        };
        match ch as usize {
            d if d < NUM_DECKS && kind == NOTE_ON => self.deck_note(d, num, value > 0, state),
            d if d < NUM_DECKS && kind == CC => self.deck_cc(d, num, value, state),
            c if kind == NOTE_ON && (PAD_CH..PAD_CH + 2 * NUM_DECKS as u8).contains(&(c as u8)) => {
                let p = c as u8 - PAD_CH;
                let d = (p / 2) as usize;
                // The note range says which mode the pads are in, which
                // keeps the mode buttons' LEDs right if the controller was
                // already in another mode when it connected.
                if let Some(mode) = pad_mode_of(num) {
                    self.decks[d].pad_mode = mode;
                }
                Self::pad(d, p % 2 == 1, num, value > 0, state)
            }
            _ if ch == GLOBAL_CH => self.global(kind, num, value),
            _ if ch == FX_CH || ch == FX_CH + 1 => self.fx(kind, num, value, state),
            _ => vec![],
        }
    }

    fn leds(&mut self, state: &State) -> Vec<Vec<u8>> {
        let mut now = all_leds(state);
        // Each pad mode button lights while its mode (or its SHIFT mode)
        // is on.
        for (d, s) in self.decks.iter().enumerate() {
            for &((note, mode), (shift_note, shift_mode)) in &PAD_MODE_BUTTONS {
                now.push(match s.pad_mode {
                    m if m == mode => (NOTE_ON | d as u8, note, true),
                    m if m == shift_mode => (NOTE_ON | d as u8, shift_note, true),
                    _ => (NOTE_ON | d as u8, note, false),
                });
            }
        }
        // The FX ON/OFF button shows the effect it switches.
        let on = state.decks[self.fx.primary()].fx.on;
        for note in [FX_ON, FX_ON_SHIFT] {
            now.push((NOTE_ON | FX_CH, note, on));
        }
        let before = self.leds.replace(now.clone());
        now.iter()
            .enumerate()
            .filter(|(i, led)| before.as_ref().map(|b| b[*i]) != Some(**led))
            .map(|(_, &(status, note, on))| vec![status, note, if on { 0x7F } else { 0 }])
            .collect()
    }

    fn reset_leds(&mut self) {
        self.leds = None;
    }

    /// Tells the app where a tempo fader sits while it doesn't control the
    /// tempo, so the screen can show where to move it to take over.
    fn poll(&mut self, state: &State) -> Vec<Action> {
        let mut out = vec![];
        for d in 0..NUM_DECKS {
            if state.decks[d].loaded {
                self.fit_range(d, state.decks[d].rate);
            }
        }
        for (d, s) in self.decks.iter_mut().enumerate() {
            let deck = &state.decks[d];
            let waiting = s.fader_rate.filter(|_| deck.loaded && !s.owns(deck.rate));
            if waiting != s.shown_pickup {
                s.shown_pickup = waiting;
                out.push(Action::TempoPickup {
                    deck: deck_id(d),
                    fader: waiting,
                });
            }
        }
        out
    }
}

/// Every LED this mapping drives, in a fixed order.
fn all_leds(state: &State) -> Vec<Led> {
    let mut out = vec![];
    for (d, deck) in state.decks.iter().enumerate() {
        let ch = NOTE_ON | d as u8;
        out.push((ch, PLAY, deck.playing));
        out.push((
            ch,
            CUE,
            deck.loaded && !deck.playing && (deck.position - deck.cue).abs() < 0.01,
        ));
        out.push((ch, HEADPHONE_CUE, deck.pfl));
        for note in [LOOP_IN, LOOP_OUT, RELOOP_EXIT] {
            out.push((ch, note, deck.looping));
        }
        let loop_beats = match (deck.looping, deck.loop_in, deck.loop_out) {
            (true, Some(i), Some(o)) if deck.bpm > 0.0 => (o - i) * deck.bpm / 60.0,
            _ => 0.0,
        };
        let gridded = deck.loaded && deck.bpm > 0.0;
        // Pads light the same with or without SHIFT held.
        let pads = PAD_CH + 2 * d as u8;
        for status in [NOTE_ON | pads, NOTE_ON | (pads + 1)] {
            for i in 0..HOT_CUES.min(8) {
                out.push((status, PAD_HOT_CUE + i as u8, deck.hot_cues[i].is_some()));
            }
            for (i, beats) in PAD_LOOP_BEATS.iter().enumerate() {
                out.push((
                    status,
                    PAD_BEAT_LOOP + i as u8,
                    (loop_beats - beats).abs() < 1e-3,
                ));
            }
            for i in 0..8 {
                out.push((status, PAD_BEAT_JUMP + i, gridded));
            }
            for i in 0..STEMS {
                let on = deck.stems & (1 << i) != 0;
                out.push((status, PAD_STEMS + i as u8, deck.loaded && on));
                out.push((
                    status,
                    PAD_STEMS + (STEMS + i) as u8,
                    deck.loaded && deck.stems == 1 << i,
                ));
            }
            for (i, slot) in state.sampler.slots.iter().enumerate().take(8) {
                out.push((status, PAD_SAMPLER + i as u8, slot.loaded));
            }
        }
    }
    out
}

/// The mode a pad note belongs to, for the modes this mapping knows.
fn pad_mode_of(note: u8) -> Option<PadMode> {
    match note & !0x07 {
        PAD_HOT_CUE => Some(PadMode::HotCue),
        PAD_STEMS => Some(PadMode::PadFx1),
        PAD_BEAT_JUMP => Some(PadMode::BeatJump),
        PAD_SAMPLER => Some(PadMode::Sampler),
        PAD_BEAT_LOOP => Some(PadMode::BeatLoop),
        _ => None,
    }
}

fn engine(cmd: Command) -> Action {
    Action::Engine(cmd)
}

fn deck_id(d: usize) -> DeckId {
    DeckId::from_index(d).expect("deck index")
}

/// Index of the step in [`FX_BEATS`] closest to `beats`.
fn nearest_beat(beats: f32) -> usize {
    (0..FX_BEATS.len())
        .min_by(|&a, &b| {
            (FX_BEATS[a] - beats)
                .abs()
                .total_cmp(&(FX_BEATS[b] - beats).abs())
        })
        .unwrap_or(0)
}

/// CFX knob: -1.0 (low-pass) ..= 1.0 (high-pass), snapping to off near the
/// centre detent so a knob left at 12 o'clock is really off.
fn cfx_filter(v: f64) -> f32 {
    let x = (v * 2.0 - 1.0) as f32;
    if x.abs() < 0.01 {
        0.0
    } else {
        x.clamp(-1.0, 1.0)
    }
}

/// Half-width of the centre detent, as a fraction of the knob's travel. A
/// knob resting in its detent doesn't read exactly 8192, so anything this
/// close to the centre counts as the centre.
const DETENT: f64 = 0.005;

/// Trim knob: -12 dB ..= +12 dB, 0 dB at the centre detent.
fn trim_db(v: f64) -> f32 {
    if (v - 0.5).abs() < DETENT {
        return 0.0;
    }
    ((v - 0.5) * 24.0) as f32
}

/// EQ knob: kill at the far left, 0 dB at the centre detent, +6 dB at the
/// far right. The left half is linear in gain so the cut sweeps smoothly to
/// silence. The app's on-screen EQ knobs use the same curve (Mixer.svelte).
fn eq_db(v: f64) -> f32 {
    if (v - 0.5).abs() < DETENT {
        0.0
    } else if v >= 0.5 {
        ((v - 0.5) * 2.0) as f32 * EQ_MAX_DB
    } else {
        let gain = (v * 2.0) as f32;
        (20.0 * gain.max(1e-6).log10()).max(EQ_KILL_DB)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st() -> State {
        let mut s = State::default();
        for d in &mut s.decks {
            d.rate = 1.0;
            d.loaded = true;
            d.duration = 300.0;
        }
        s
    }

    fn cmds(actions: Vec<Action>) -> Vec<Command> {
        actions
            .into_iter()
            .filter_map(|a| match a {
                Action::Engine(c) => Some(c),
                _ => None,
            })
            .collect()
    }

    fn one(m: &mut Flx4, msg: [u8; 3], s: &State) -> Command {
        let mut c = cmds(m.handle(&msg, s));
        assert_eq!(c.len(), 1, "{msg:02X?} gave {c:?}");
        c.remove(0)
    }

    /// Sends a 14-bit value as MSB then LSB.
    fn fourteen(m: &mut Flx4, ch: u8, cc: u8, v: u16, s: &State) -> Vec<Command> {
        assert!(cmds(m.handle(&[CC | ch, cc, (v >> 7) as u8], s)).is_empty());
        cmds(m.handle(&[CC | ch, cc + 0x20, (v & 0x7F) as u8], s))
    }

    #[test]
    fn transport_buttons() {
        let mut m = Flx4::new();
        let s = st();
        assert!(matches!(
            one(&mut m, [0x90, PLAY, 0x7F], &s),
            Command::TogglePlay { deck: DeckId::A }
        ));
        assert!(cmds(m.handle(&[0x90, PLAY, 0], &s)).is_empty());
        assert!(matches!(
            one(&mut m, [0x91, CUE, 0x7F], &s),
            Command::CuePress { deck: DeckId::B }
        ));
        assert!(matches!(
            one(&mut m, [0x81, CUE, 0x40], &s),
            Command::CueRelease { deck: DeckId::B }
        ));
        assert!(matches!(
            one(&mut m, [0x90, SYNC, 0x7F], &s),
            Command::Sync { deck: DeckId::A }
        ));
    }

    #[test]
    fn headphone_cue_toggles() {
        let mut m = Flx4::new();
        let mut s = st();
        assert!(matches!(
            one(&mut m, [0x90, HEADPHONE_CUE, 0x7F], &s),
            Command::SetPfl { on: true, .. }
        ));
        s.decks[0].pfl = true;
        assert!(matches!(
            one(&mut m, [0x90, HEADPHONE_CUE, 0x7F], &s),
            Command::SetPfl { on: false, .. }
        ));
    }

    #[test]
    fn mixer_controls_are_fourteen_bit() {
        let mut m = Flx4::new();
        let s = st();
        let c = fourteen(&mut m, 1, FADER, 16383, &s);
        assert!(matches!(c[..], [Command::SetFader { deck: DeckId::B, value }] if value == 1.0));
        let c = fourteen(&mut m, 0, EQ_LOW, 0, &s);
        assert!(
            matches!(c[..], [Command::SetEq { band: EqBand::Low, db, .. }] if db == EQ_KILL_DB)
        );
        let c = fourteen(&mut m, 0, EQ_HI, 8192, &s);
        assert!(
            matches!(c[..], [Command::SetEq { band: EqBand::High, db, .. }] if db.abs() < 0.01)
        );
        let c = fourteen(&mut m, 0, EQ_MID, 16383, &s);
        assert!(matches!(c[..], [Command::SetEq { band: EqBand::Mid, db, .. }] if db == EQ_MAX_DB));
        let c = fourteen(&mut m, 0, TRIM, 0, &s);
        assert!(matches!(c[..], [Command::SetGain { db, .. }] if db == -12.0));
        let c = fourteen(&mut m, GLOBAL_CH, CROSSFADER, 0, &s);
        assert!(matches!(c[..], [Command::SetCrossfader { value }] if value == -1.0));
    }

    #[test]
    fn knobs_resting_near_the_detent_are_flat() {
        for raw in [8150u16, 8191, 8192, 8230] {
            let v = raw as f64 / 16383.0;
            assert_eq!(eq_db(v), 0.0, "{raw}");
            assert_eq!(trim_db(v), 0.0, "{raw}");
        }
    }

    #[test]
    fn eq_curve_is_monotonic() {
        let mut prev = f32::NEG_INFINITY;
        for i in 0..=100 {
            let db = eq_db(i as f64 / 100.0);
            assert!(db >= prev);
            prev = db;
        }
    }

    #[test]
    fn pitch_fader_top_is_slower() {
        let mut m = Flx4::new();
        let s = st();
        let c = fourteen(&mut m, 0, TEMPO, 0, &s);
        assert!(matches!(c[..], [Command::SetRate { rate, .. }] if (rate - 0.92).abs() < 1e-9));
        let c = fourteen(&mut m, 0, TEMPO, 16383, &s);
        assert!(matches!(c[..], [Command::SetRate { rate, .. }] if (rate - 1.08).abs() < 1e-9));
    }

    #[test]
    fn pitch_fader_picks_up_after_sync() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].playing = true;
        // Fader near the centre takes control.
        assert_eq!(fourteen(&mut m, 0, TEMPO, 8192, &s).len(), 1);
        // SYNC moves the rate to 1.04 behind the fader's back.
        s.decks[0].rate = 1.04;
        // Moving the fader away from 1.04 does nothing...
        assert!(fourteen(&mut m, 0, TEMPO, 7000, &s).is_empty());
        // ...until it crosses it, then it takes over.
        let c = fourteen(&mut m, 0, TEMPO, 14000, &s);
        assert!(matches!(c[..], [Command::SetRate { rate, .. }] if rate > 1.04));
    }

    #[test]
    fn pitch_fader_keeps_control_when_moved_faster_than_the_engine_reports() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].playing = true;
        // The fader takes control at the centre and the engine catches up.
        let c = fourteen(&mut m, 0, TEMPO, 8192, &s);
        let [Command::SetRate { rate, .. }] = c[..] else {
            panic!("{c:?}")
        };
        s.decks[0].rate = rate;
        // A quick push sends several moves before the engine reports any of
        // them: every one must still reach the engine.
        for v in [9000, 10000, 11000, 12000] {
            let c = fourteen(&mut m, 0, TEMPO, v, &s);
            assert!(
                matches!(c[..], [Command::SetRate { .. }]),
                "move to {v} was dropped"
            );
        }
        // The engine reports one of the earlier moves: still in control.
        s.decks[0].rate = 1.0 - 0.08 + (10000.0 / 16383.0) * 0.16;
        assert_eq!(fourteen(&mut m, 0, TEMPO, 12500, &s).len(), 1);
    }

    #[test]
    fn pitch_fader_widens_its_range_to_reach_a_synced_tempo() {
        // SYNC to a pitched-up deck can ask for more than the fader's ±8%.
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].playing = true;
        assert_eq!(fourteen(&mut m, 0, TEMPO, 8192, &s).len(), 1);
        s.decks[0].rate = 1.10;
        // The app's marker already shows the fader on the wider ±16% scale,
        // still at the centre.
        let p = m.poll(&s);
        assert!(
            p.iter().any(|a| matches!(a, Action::TempoPickup { fader: Some(r), .. } if (r - 1.0).abs() < 1e-3)),
            "{p:?}"
        );
        // Pulled all the way down it passes 1.10 and takes over.
        let c = fourteen(&mut m, 0, TEMPO, 16383, &s);
        assert!(
            matches!(c[..], [Command::SetRate { rate, .. }] if (rate - 1.16).abs() < 1e-9),
            "{c:?}"
        );
    }

    #[test]
    fn pitch_fader_keeps_its_range_for_tempos_it_set() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].playing = true;
        assert_eq!(fourteen(&mut m, 0, TEMPO, 8192, &s).len(), 1);
        let c = fourteen(&mut m, 0, TEMPO, 16383, &s);
        let [Command::SetRate { rate, .. }] = c[..] else {
            panic!("{c:?}")
        };
        s.decks[0].rate = rate;
        m.poll(&s);
        let c = fourteen(&mut m, 0, TEMPO, 0, &s);
        assert!(
            matches!(c[..], [Command::SetRate { rate, .. }] if (rate - 0.92).abs() < 1e-9),
            "{c:?}"
        );
    }

    #[test]
    fn app_shows_where_the_tempo_fader_waits_after_sync() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].loaded = true;
        s.decks[0].playing = true;
        let pickup = |m: &mut Flx4, s: &State| {
            m.poll(s)
                .into_iter()
                .filter_map(|a| match a {
                    Action::TempoPickup { deck, fader } => Some((deck, fader)),
                    _ => None,
                })
                .collect::<Vec<_>>()
        };
        let c = fourteen(&mut m, 0, TEMPO, 8192, &s);
        let [Command::SetRate { rate, .. }] = c[..] else {
            panic!("{c:?}")
        };
        s.decks[0].rate = rate;
        assert!(pickup(&mut m, &s).is_empty(), "in control");
        // SYNC moves the tempo: the app hears where the fader waits, once.
        s.decks[0].rate = 1.04;
        let p = pickup(&mut m, &s);
        assert!(
            matches!(p[..], [(DeckId::A, Some(r))] if (r - rate).abs() < 1e-9),
            "{p:?}"
        );
        assert!(pickup(&mut m, &s).is_empty());
        // Moved across the new tempo, it takes over at once, before the
        // engine reports it, and the marker goes.
        assert_eq!(fourteen(&mut m, 0, TEMPO, 14000, &s).len(), 1);
        assert!(matches!(pickup(&mut m, &s)[..], [(DeckId::A, None)]));
        let c = fourteen(&mut m, 0, TEMPO, 14100, &s);
        let [Command::SetRate { rate, .. }] = c[..] else {
            panic!("{c:?}")
        };
        s.decks[0].rate = rate;
        assert!(pickup(&mut m, &s).is_empty(), "still in control");
    }

    #[test]
    fn jog_wheel() {
        let mut m = Flx4::new();
        let s = st();
        assert!(matches!(
            one(&mut m, [0x90, JOG_TOUCH, 0x7F], &s),
            Command::ScratchStart { deck: DeckId::A }
        ));
        match one(&mut m, [0xB0, JOG_TOP, 0x42], &s) {
            Command::Jog { seconds, .. } => assert!((seconds - 2.0 * SECS_PER_TICK).abs() < 1e-12),
            c => panic!("{c:?}"),
        }
        match one(&mut m, [0xB0, JOG_SIDE, 0x3F], &s) {
            Command::Jog { seconds, .. } => assert!(seconds < 0.0),
            c => panic!("{c:?}"),
        }
        assert!(matches!(
            one(&mut m, [0x90, JOG_TOUCH, 0], &s),
            Command::ScratchEnd { deck: DeckId::A }
        ));
    }

    #[test]
    fn browser_and_load() {
        let mut m = Flx4::new();
        let s = st();
        assert!(matches!(
            m.handle(&[0xB6, BROWSE, 0x01], &s)[..],
            [Action::Browse(1)]
        ));
        assert!(matches!(
            m.handle(&[0xB6, BROWSE, 0x7F], &s)[..],
            [Action::Browse(-1)]
        ));
        assert!(matches!(
            m.handle(&[0x96, LOAD_B, 0x7F], &s)[..],
            [Action::LoadSelected(DeckId::B)]
        ));
    }

    #[test]
    fn leds_send_only_changes() {
        let mut m = Flx4::new();
        let mut s = st();
        // First call sends everything.
        let all = m.leds(&s).len();
        assert!(all > 6);
        assert!(m.leds(&s).is_empty());
        s.decks[1].playing = true;
        // Play on, cue off (no longer paused at the cue point).
        assert_eq!(m.leds(&s), vec![vec![0x91, PLAY, 0x7F], vec![0x91, CUE, 0]]);
        m.reset_leds();
        assert_eq!(m.leds(&s).len(), all);
    }

    #[test]
    fn hot_cue_pads() {
        let mut m = Flx4::new();
        let s = st();
        assert!(matches!(
            one(&mut m, [0x97, 0x02, 0x7F], &s),
            Command::HotCuePress {
                deck: DeckId::A,
                index: 2
            }
        ));
        assert!(matches!(
            one(&mut m, [0x87, 0x02, 0x00], &s),
            Command::HotCueRelease {
                deck: DeckId::A,
                index: 2
            }
        ));
        // SHIFT + pad clears, on deck 2's shifted channel.
        assert!(matches!(
            one(&mut m, [0x9A, 0x07, 0x7F], &s),
            Command::HotCueClear {
                deck: DeckId::B,
                index: 7
            }
        ));
        assert!(cmds(m.handle(&[0x9A, 0x07, 0x00], &s)).is_empty());
    }

    #[test]
    fn stems_pads() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[0].loaded = true;
        s.decks[0].stems = 0b1111;
        s.decks[1].stems = 0b1111;
        // Pad 1 mutes vocals; pad 4 (deck B, with SHIFT) mutes drums.
        assert!(matches!(
            one(&mut m, [0x97, 0x10, 0x7F], &s),
            Command::SetStems {
                deck: DeckId::A,
                mask: 0b1110
            }
        ));
        assert!(matches!(
            one(&mut m, [0x9A, 0x13, 0x7F], &s),
            Command::SetStems {
                deck: DeckId::B,
                mask: 0b0111
            }
        ));
        // Pad 7 plays bass alone; pressed again, everything comes back.
        assert!(matches!(
            one(&mut m, [0x97, 0x16, 0x7F], &s),
            Command::SetStems { mask: 0b0100, .. }
        ));
        s.decks[0].stems = 0b0100;
        assert!(matches!(
            one(&mut m, [0x97, 0x16, 0x7F], &s),
            Command::SetStems { mask: 0b1111, .. }
        ));
        assert!(cmds(m.handle(&[0x97, 0x16, 0x00], &s)).is_empty());
        // LEDs: bass lit on top, its solo pad lit below.
        let leds = m.leds(&s);
        let lit = |note: u8| leds.contains(&vec![0x97, note, 0x7F]);
        assert!(lit(0x12) && lit(0x16));
        assert!(!lit(0x10) && !lit(0x14));
    }

    #[test]
    fn beat_loop_and_beat_jump_pads() {
        let mut m = Flx4::new();
        let s = st();
        assert!(matches!(
            one(&mut m, [0x99, 0x60, 0x7F], &s),
            Command::BeatLoop { deck: DeckId::B, beats } if beats == 0.25
        ));
        assert!(matches!(
            one(&mut m, [0x97, 0x67, 0x7F], &s),
            Command::BeatLoop { deck: DeckId::A, beats } if beats == 32.0
        ));
        assert!(matches!(
            one(&mut m, [0x97, 0x24, 0x7F], &s),
            Command::BeatJump { beats, .. } if beats == -4.0
        ));
        assert!(matches!(
            one(&mut m, [0x97, 0x27, 0x7F], &s),
            Command::BeatJump { beats, .. } if beats == 8.0
        ));
        // SHIFT: whole phrases, 4 to 32 bars.
        assert!(matches!(
            one(&mut m, [0x98, 0x20, 0x7F], &s),
            Command::BeatJump { deck: DeckId::A, beats } if beats == -16.0
        ));
        assert!(matches!(
            one(&mut m, [0x9A, 0x27, 0x7F], &s),
            Command::BeatJump { deck: DeckId::B, beats } if beats == 128.0
        ));
    }

    #[test]
    fn shift_play_toggles_slip() {
        let mut m = Flx4::new();
        let mut s = st();
        assert!(matches!(
            one(&mut m, [0x91, PLAY_SHIFT, 0x7F], &s),
            Command::SetSlip {
                deck: DeckId::B,
                on: true
            }
        ));
        assert!(cmds(m.handle(&[0x91, PLAY_SHIFT, 0], &s)).is_empty());
        s.decks[1].slip = true;
        assert!(matches!(
            one(&mut m, [0x91, PLAY_SHIFT, 0x7F], &s),
            Command::SetSlip { on: false, .. }
        ));
    }

    #[test]
    fn sampler_pads() {
        let mut m = Flx4::new();
        let mut s = st();
        // Deck 1 and deck 2 pads play the same slots.
        assert!(matches!(
            one(&mut m, [0x97, 0x32, 0x7F], &s),
            Command::SamplePlay { slot: 2 }
        ));
        assert!(matches!(
            one(&mut m, [0x99, 0x32, 0x7F], &s),
            Command::SamplePlay { slot: 2 }
        ));
        assert!(cmds(m.handle(&[0x97, 0x32, 0x00], &s)).is_empty());
        // SHIFT + an empty pad loads the selected track there...
        assert!(matches!(
            m.handle(&[0x98, 0x35, 0x7F], &s)[..],
            [Action::LoadSample(5)]
        ));
        // ...and stops a loaded one.
        s.sampler.slots[5].loaded = true;
        assert!(matches!(
            one(&mut m, [0x9A, 0x35, 0x7F], &s),
            Command::SampleStop { slot: 5 }
        ));
        // Loaded pads light on both decks, with and without SHIFT.
        m.reset_leds();
        m.leds(&s);
        s.sampler.slots[0].loaded = true;
        assert_eq!(
            m.leds(&s),
            vec![
                vec![0x97, 0x30, 0x7F],
                vec![0x98, 0x30, 0x7F],
                vec![0x99, 0x30, 0x7F],
                vec![0x9A, 0x30, 0x7F],
            ]
        );
    }

    #[test]
    fn loop_section() {
        let mut m = Flx4::new();
        let mut s = st();
        s.decks[1].loop_beats = 8.0;
        assert!(matches!(
            one(&mut m, [0x90, LOOP_IN, 0x7F], &s),
            Command::LoopIn { .. }
        ));
        assert!(matches!(
            one(&mut m, [0x90, LOOP_OUT, 0x7F], &s),
            Command::LoopOut { .. }
        ));
        assert!(matches!(
            one(&mut m, [0x91, RELOOP_EXIT, 0x7F], &s),
            Command::ReloopExit { deck: DeckId::B }
        ));
        assert!(matches!(
            one(&mut m, [0x90, LOOP_4_BEAT, 0x7F], &s),
            Command::BeatLoop { beats, .. } if beats == 4.0
        ));
        assert!(matches!(
            one(&mut m, [0x90, LOOP_HALVE, 0x7F], &s),
            Command::LoopScale { factor, .. } if factor == 0.5
        ));
        assert!(matches!(
            one(&mut m, [0x90, LOOP_DOUBLE, 0x7F], &s),
            Command::LoopScale { factor, .. } if factor == 2.0
        ));
        assert!(matches!(
            one(&mut m, [0x91, JUMP_BACK, 0x7F], &s),
            Command::BeatJump { deck: DeckId::B, beats } if beats == -8.0
        ));
        assert!(matches!(
            one(&mut m, [0x91, JUMP_FORWARD, 0x7F], &s),
            Command::BeatJump { deck: DeckId::B, beats } if beats == 8.0
        ));
    }

    #[test]
    fn pad_and_loop_leds() {
        let mut m = Flx4::new();
        let mut s = st();
        m.leds(&s);
        s.decks[0].hot_cues[1] = Some(12.0);
        // Hot cue 2 lights with and without SHIFT.
        assert_eq!(
            m.leds(&s),
            vec![vec![0x97, 0x01, 0x7F], vec![0x98, 0x01, 0x7F]]
        );
        s.decks[1].bpm = 120.0;
        s.decks[1].looping = true;
        s.decks[1].loop_in = Some(10.0);
        s.decks[1].loop_out = Some(12.0);
        let on: Vec<_> = m.leds(&s).into_iter().filter(|l| l[2] == 0x7F).collect();
        for led in [
            vec![0x91, LOOP_IN, 0x7F],
            vec![0x91, RELOOP_EXIT, 0x7F],
            vec![0x99, 0x64, 0x7F], // the 4-beat loop pad
            vec![0x9A, 0x64, 0x7F],
            vec![0x99, 0x20, 0x7F], // beat jump works now there's a grid
        ] {
            assert!(on.contains(&led), "{led:02X?} not in {on:02X?}");
        }
    }

    #[test]
    fn ignores_other_ports_and_junk() {
        let mut m = Flx4::new();
        assert!(m.matches("DDJ-FLX4 MIDI 1"));
        assert!(m.matches("ddj-flx4"));
        assert!(!m.matches("DDJ-400"));
        assert!(m.handle(&[0xF8], &st()).is_empty());
        assert!(m.handle(&[0x9F, 0x01, 0x7F], &st()).is_empty());
    }

    #[test]
    fn cfx_knobs_drive_the_filters() {
        let mut m = Flx4::new();
        let s = st();
        let c = fourteen(&mut m, GLOBAL_CH, CFX[1], 0, &s);
        assert!(matches!(
            c[..],
            [Command::SetFilter { deck: DeckId::B, value }] if value == -1.0
        ));
        let c = fourteen(&mut m, GLOBAL_CH, CFX[0], 8192, &s);
        assert!(matches!(
            c[..],
            [Command::SetFilter { deck: DeckId::A, value }] if value == 0.0
        ));
    }

    fn with_fx(mut s: State, d: usize, kind: FxKind, on: bool, beats: f32) -> State {
        s.decks[d].fx = dj_engine::FxSnapshot {
            kind,
            on,
            level: 0.5,
            beats,
        };
        s
    }

    #[test]
    fn beat_fx_buttons_drive_the_selected_deck() {
        let mut m = Flx4::new();
        let s = with_fx(st(), 0, FxKind::Phaser, false, 1.0);
        // Deck 1 until the lever says otherwise.
        assert!(matches!(
            one(&mut m, [0x94, FX_SELECT, 0x7F], &s),
            Command::SetFxKind {
                deck: DeckId::A,
                kind: FxKind::Echo
            }
        ));
        assert!(cmds(m.handle(&[0x94, FX_SELECT, 0], &s)).is_empty());
        assert!(matches!(
            one(&mut m, [0x94, FX_SELECT_SHIFT, 0x7F], &s),
            Command::SetFxKind {
                kind: FxKind::Flanger,
                ..
            }
        ));
        assert!(matches!(
            one(&mut m, [0x94, FX_BEAT_LEFT, 0x7F], &s),
            Command::SetFxBeats { beats, .. } if beats == 0.75
        ));
        assert!(matches!(
            one(&mut m, [0x94, FX_BEAT_RIGHT, 0x7F], &s),
            Command::SetFxBeats { beats, .. } if beats == 2.0
        ));
        assert!(matches!(
            one(&mut m, [0x94, FX_ON, 0x7F], &s),
            Command::SetFxOn {
                deck: DeckId::A,
                on: true
            }
        ));
        let c = fourteen(&mut m, FX_CH, FX_LEVEL, 16383, &s);
        assert!(matches!(c[..], [Command::SetFxLevel { deck: DeckId::A, value }] if value == 1.0));
    }

    #[test]
    fn beat_length_stops_at_the_ends() {
        let mut m = Flx4::new();
        let s = with_fx(st(), 0, FxKind::Echo, false, 8.0);
        assert!(matches!(
            one(&mut m, [0x94, FX_BEAT_RIGHT, 0x7F], &s),
            Command::SetFxBeats { beats, .. } if beats == 8.0
        ));
    }

    #[test]
    fn lever_moves_the_effect() {
        let mut m = Flx4::new();
        let s = with_fx(st(), 0, FxKind::Reverb, true, 2.0);
        // First report: just where the lever already is.
        assert!(cmds(m.handle(&[0x94, FX_LEVER_CH1, 0x7F], &s)).is_empty());
        // To CH2: deck 1 stops, deck 2 picks up the reverb, still on.
        assert!(cmds(m.handle(&[0x94, FX_LEVER_CH1, 0], &s)).is_empty());
        let c = cmds(m.handle(&[0x95, FX_LEVER_CH2, 0x7F], &s));
        assert!(matches!(
            c[0],
            Command::SetFxOn {
                deck: DeckId::A,
                on: false
            }
        ));
        assert!(c.iter().any(|c| matches!(
            c,
            Command::SetFxKind {
                deck: DeckId::B,
                kind: FxKind::Reverb
            }
        )));
        assert!(c.iter().any(|c| matches!(
            c,
            Command::SetFxBeats { deck: DeckId::B, beats } if *beats == 2.0
        )));
        assert!(c.iter().any(|c| matches!(
            c,
            Command::SetFxOn {
                deck: DeckId::B,
                on: true
            }
        )));
        // Now the buttons drive deck 2 (on either FX channel).
        let s = with_fx(st(), 1, FxKind::Reverb, true, 2.0);
        assert!(matches!(
            one(&mut m, [0x95, FX_ON, 0x7F], &s),
            Command::SetFxOn {
                deck: DeckId::B,
                on: false
            }
        ));
    }

    #[test]
    fn master_runs_the_effect_on_both_decks() {
        let mut m = Flx4::new();
        let s = with_fx(st(), 0, FxKind::Echo, false, 1.0);
        m.handle(&[0x94, FX_LEVER_CH1, 0x7F], &s);
        m.handle(&[0x94, FX_LEVER_CH1, 0], &s);
        let c = cmds(m.handle(&[0x94, FX_LEVER_MASTER, 0x7F], &s));
        assert!(c
            .iter()
            .all(|c| !matches!(c, Command::SetFxOn { on: true, .. })));
        let c = cmds(m.handle(&[0x94, FX_ON, 0x7F], &s));
        assert!(matches!(
            c[..],
            [
                Command::SetFxOn {
                    deck: DeckId::A,
                    on: true
                },
                Command::SetFxOn {
                    deck: DeckId::B,
                    on: true
                },
            ]
        ));
        // SHIFT + ON/OFF: everything off.
        let c = cmds(m.handle(&[0x94, FX_ON_SHIFT, 0x7F], &s));
        assert!(c
            .iter()
            .all(|c| matches!(c, Command::SetFxOn { on: false, .. })));
        assert_eq!(c.len(), 2);
    }

    #[test]
    fn pad_mode_buttons_light_and_tell_the_app() {
        let mut m = Flx4::new();
        let s = st();
        // Hot cue mode to start with.
        let lit = |leds: &[Vec<u8>], ch: u8, note: u8| leds.contains(&vec![0x90 | ch, note, 0x7F]);
        assert!(lit(&m.leds(&s), 0, 0x1B));
        // PAD FX on deck 2.
        let a = m.handle(&[0x91, 0x1E, 0x7F], &s);
        assert!(matches!(
            a[..],
            [Action::PadMode {
                deck: DeckId::B,
                mode: PadMode::PadFx1
            }]
        ));
        assert!(m.handle(&[0x91, 0x1E, 0], &s).is_empty());
        assert_eq!(
            m.leds(&s),
            vec![vec![0x91, 0x1B, 0], vec![0x91, 0x1E, 0x7F]]
        );
        // SHIFT + BEAT JUMP is beat loop, lit on the BEAT JUMP button.
        let a = m.handle(&[0x90, 0x6D, 0x7F], &s);
        assert!(matches!(
            a[..],
            [Action::PadMode {
                deck: DeckId::A,
                mode: PadMode::BeatLoop
            }]
        ));
        assert_eq!(
            m.leds(&s),
            vec![vec![0x90, 0x1B, 0], vec![0x90, 0x6D, 0x7F]]
        );
    }

    #[test]
    fn pads_correct_the_pad_mode() {
        let mut m = Flx4::new();
        let s = st();
        m.leds(&s);
        // A sampler pad on deck 1: the controller was in sampler mode.
        m.handle(&[0x97, 0x32, 0x7F], &s);
        assert_eq!(
            m.leds(&s),
            vec![vec![0x90, 0x1B, 0], vec![0x90, 0x22, 0x7F]]
        );
    }

    #[test]
    fn fx_on_led_follows_the_selected_deck() {
        let mut m = Flx4::new();
        let s = st();
        m.leds(&s);
        let s = with_fx(s, 0, FxKind::Echo, true, 1.0);
        assert_eq!(
            m.leds(&s),
            vec![vec![0x94, FX_ON, 0x7F], vec![0x94, FX_ON_SHIFT, 0x7F]]
        );
    }
}
