//! Pioneer DDJ-FLX4.
//!
//! Message numbers follow Pioneer's published MIDI message list for the
//! DDJ-FLX4 (shared with the DDJ-400). Decks 1 and 2 send on MIDI channels
//! 1 and 2; the browser, crossfader and load buttons on channel 7. Knobs
//! and faders are 14-bit: the MSB arrives on CC `n`, then the LSB on
//! CC `n + 0x20`.
//!
//! The CFX knobs drive each channel's filter. Not mapped yet: performance
//! pads, loops and the beat FX section. The headphone level and master
//! level knobs work in the controller's own sound card and send no MIDI.

use dj_engine::dsp::{EQ_KILL_DB, EQ_MAX_DB};
use dj_engine::{Command, DeckId, EqBand, NUM_DECKS};

use crate::{Action, Mapping, State};

const NOTE_ON: u8 = 0x90;
const CC: u8 = 0xB0;
/// MIDI channel (0-based) of the browser, crossfader and load buttons.
const GLOBAL_CH: u8 = 6;

// Deck notes (channel = deck).
const PLAY: u8 = 0x0B;
const CUE: u8 = 0x0C;
const SHIFT: u8 = 0x3F;
const JOG_TOUCH: u8 = 0x36;
const JOG_TOUCH_SHIFT: u8 = 0x67;
const SYNC: u8 = 0x58;
const SYNC_SHIFT: u8 = 0x5C;
const HEADPHONE_CUE: u8 = 0x54;

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

#[derive(Debug, Default, Clone, Copy)]
struct DeckState {
    shift: bool,
    range_index: usize,
    /// Rate the hardware fader last asked for.
    fader_rate: Option<f64>,
    /// Rate this mapping last sent; if the engine's differs, the fader
    /// has to pick it up again before it takes control.
    sent_rate: Option<f64>,
}

/// LED state last sent, to send only changes.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
struct DeckLeds {
    play: bool,
    cue: bool,
    headphone_cue: bool,
}

pub struct Flx4 {
    decks: [DeckState; NUM_DECKS],
    /// MSBs waiting for their LSB, by (channel, CC).
    msb: [[u8; 0x20]; 16],
    leds: Option<[DeckLeds; NUM_DECKS]>,
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
        }
    }

    fn range(&self, d: usize) -> f64 {
        PITCH_RANGES[self.decks[d].range_index]
    }

    /// Handles a pitch fader move to `value` (0.0 top ..= 1.0 bottom).
    /// Top is slower, like a turntable.
    fn tempo(&mut self, d: usize, value: f64, state: &State, out: &mut Vec<Action>) {
        let range = self.range(d);
        let rate = 1.0 - range + value * 2.0 * range;
        let deck = &state.decks[d];
        let s = &mut self.decks[d];
        let in_control = s.sent_rate.is_some_and(|r| (r - deck.rate).abs() < 1e-6);
        let crossed = s
            .fader_rate
            .is_some_and(|prev| (prev - deck.rate) * (rate - deck.rate) <= 0.0);
        let close = (rate - deck.rate).abs() < PICKUP_TOLERANCE;
        s.fader_rate = Some(rate);
        // A stopped deck can jump; a playing one would lurch audibly.
        if in_control || crossed || close || !deck.playing {
            s.sent_rate = Some(rate);
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
        s.sent_rate = None;
        s.fader_rate = None;
    }

    fn deck_note(&mut self, d: usize, note: u8, pressed: bool, state: &State) -> Vec<Action> {
        let deck = deck_id(d);
        let cmd = match (note, pressed) {
            (SHIFT, p) => {
                self.decks[d].shift = p;
                return vec![];
            }
            (PLAY, true) => Command::TogglePlay { deck },
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
            (JOG_TOUCH | JOG_TOUCH_SHIFT, true) => Command::ScratchStart { deck },
            (JOG_TOUCH | JOG_TOUCH_SHIFT, false) => Command::ScratchEnd { deck },
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
            _ if ch == GLOBAL_CH => self.global(kind, num, value),
            _ => vec![],
        }
    }

    fn leds(&mut self, state: &State) -> Vec<Vec<u8>> {
        let now: [DeckLeds; NUM_DECKS] = std::array::from_fn(|d| {
            let deck = &state.decks[d];
            DeckLeds {
                play: deck.playing,
                cue: deck.loaded && !deck.playing && (deck.position - deck.cue).abs() < 0.01,
                headphone_cue: deck.pfl,
            }
        });
        let before = self.leds.replace(now);
        let mut out = vec![];
        for d in 0..NUM_DECKS {
            let was = before.map(|b| b[d]);
            let led = |note: u8, on: bool| vec![NOTE_ON | d as u8, note, if on { 0x7F } else { 0 }];
            let n = now[d];
            if was.map(|w| w.play) != Some(n.play) {
                out.push(led(PLAY, n.play));
            }
            if was.map(|w| w.cue) != Some(n.cue) {
                out.push(led(CUE, n.cue));
            }
            if was.map(|w| w.headphone_cue) != Some(n.headphone_cue) {
                out.push(led(HEADPHONE_CUE, n.headphone_cue));
            }
        }
        out
    }

    fn reset_leds(&mut self) {
        self.leds = None;
    }
}

fn engine(cmd: Command) -> Action {
    Action::Engine(cmd)
}

fn deck_id(d: usize) -> DeckId {
    DeckId::from_index(d).expect("deck index")
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

/// Trim knob: -12 dB ..= +12 dB, 0 dB at the centre detent.
fn trim_db(v: f64) -> f32 {
    ((v - 0.5) * 24.0) as f32
}

/// EQ knob: kill at the far left, 0 dB at centre, +6 dB at the far right.
/// The left half is linear in gain so the cut sweeps smoothly to silence.
fn eq_db(v: f64) -> f32 {
    if v >= 0.5 {
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
        assert_eq!(m.leds(&s).len(), 6);
        assert!(m.leds(&s).is_empty());
        s.decks[1].playing = true;
        // Play on, cue off (no longer paused at the cue point).
        assert_eq!(m.leds(&s), vec![vec![0x91, PLAY, 0x7F], vec![0x91, CUE, 0]]);
        m.reset_leds();
        assert_eq!(m.leds(&s).len(), 6);
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
}
