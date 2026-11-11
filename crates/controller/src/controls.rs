//! Named controls in Mixxx's vocabulary, driving our engine.
//!
//! Mixxx mappings address everything as a `[group] key` pair such as
//! `[Channel1] play` or `[Master] crossfader`, with a value in that
//! control's own units: 0 or 1 for buttons, a gain ratio for EQs, -1..1 for
//! the pitch fader. [`Control::parse`] turns those names into a [`Control`],
//! and [`Controls`] reads their values from engine [`State`] and turns new
//! values into [`Action`]s.
//!
//! Only controls our engine can do something with are known; anything else
//! parses to `None` so a mapping can report what it couldn't use. Mixxx's
//! decks 3 and 4 aren't known, as the engine has two decks.
//!
//! Each control also has a [`Behavior`], which says how a raw MIDI value
//! becomes a control value, following Mixxx's control behaviors so mappings
//! feel the same as they do there.

use dj_engine::dsp::{EQ_KILL_DB, EQ_MAX_DB};
use dj_engine::{Command, DeckId, EqBand, FxKind, HOT_CUES, NUM_DECKS, SAMPLER_SLOTS, STEMS};

use crate::{Action, State};

/// Mixxx's default pitch fader range: ±8%.
const DEFAULT_RATE_RANGE: f64 = 0.08;
/// Mixxx's default beat jump size, in beats.
const DEFAULT_BEATJUMP: f64 = 4.0;
/// Seconds one unit of `jog` moves the track. Mixxx treats `jog` as a
/// short tempo nudge; a jump this size feels about the same.
const JOG_SECS: f64 = 1.0 / 120.0;
/// Mixxx's default temporary pitch bends, held by `rate_temp_up` and
/// `rate_temp_down` (and their `_small` versions).
const TEMP_BEND: f64 = 0.04;
const TEMP_BEND_SMALL: f64 = 0.01;
/// Gain range of the trim knob in dB, as Mixxx's `pregain` (±12 dB).
const PREGAIN_DB: f64 = 12.0;
/// Master gain range in dB, as Mixxx's `[Master] gain`.
const MASTER_DB: f64 = 14.0;
/// Our filter knob reads off near the centre so a knob left at 12 o'clock
/// is really off.
const FILTER_DETENT: f32 = 0.01;

/// Beat lengths, in 1/32 beats so they can be compared and hashed. Mixxx's
/// fixed beat loop and beat jump sizes are the powers of two from 1/32 to
/// 512 beats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Beats(u32);

impl Beats {
    fn parse(s: &str) -> Option<Beats> {
        let v: f64 = s.parse().ok()?;
        let n = (v * 32.0).round();
        let ok = (1.0..=512.0 * 32.0).contains(&n)
            && (n / 32.0 - v).abs() < 1e-9
            && (n as u32).is_power_of_two();
        ok.then_some(Beats(n as u32))
    }

    pub fn get(self) -> f64 {
        f64::from(self.0) / 32.0
    }
}

/// What a hot cue control does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HotCueKey {
    /// Held like the pad: sets the cue if empty, else jumps (and previews
    /// while held on a paused deck).
    Activate,
    Clear,
    Set,
    Goto,
    GotoAndPlay,
    GotoAndStop,
    /// Read only: 1 if the cue is set.
    Enabled,
}

/// What a fixed-size beat loop control does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BeatLoopKey {
    Activate,
    Toggle,
    /// Read only: 1 while a loop of this size plays.
    Enabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeckKey {
    Play,
    PlayIndicator,
    Stop,
    Start,
    Cue,
    CueIndicator,
    CueGotoAndPlay,
    CueGotoAndStop,
    CueSet,
    /// Press to sync once.
    Sync,
    Pfl,
    Keylock,
    Slip,
    Quantize,
    /// Channel fader.
    Volume,
    /// Trim, as a gain ratio.
    Pregain,
    /// Pitch fader, -1..1 across the range.
    Rate,
    RateRange,
    /// Relative: nudges the track.
    Jog,
    /// Bends the tempo while held: up if true, small if the second is.
    TempBend(bool, bool),
    LoopIn,
    LoopOut,
    Reloop,
    LoopEnabled,
    LoopHalve,
    LoopDouble,
    BeatLoopActivate,
    BeatLoopToggle,
    BeatLoopSize,
    BeatLoop(Beats, BeatLoopKey),
    BeatJumpForward,
    BeatJumpBackward,
    BeatJumpSize,
    /// A fixed beat jump: forward if true.
    BeatJumpBy(Beats, bool),
    HotCue(usize, HotCueKey),
    LoadSelected,
    Eject,
    TrackLoaded,
    Duration,
    PlayPosition,
    Bpm,
    FileBpm,
    VuMeter,
    PeakIndicator,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SamplerKey {
    Play,
    Start,
    Stop,
    LoadSelected,
    Eject,
    TrackLoaded,
    PlayIndicator,
    Volume,
}

/// Effect unit controls. Mixxx's effect units 1 and 2 drive our decks'
/// beat FX units.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FxKey {
    Enabled,
    /// Level (Mixxx's dry/wet mix, super knob, or effect meta knob).
    Level,
    Next,
    Prev,
    /// Relative: steps through the effects.
    Selector,
    /// Whether the unit is assigned to this deck: each unit always drives
    /// its own deck here.
    AssignedTo(usize),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Control {
    Deck(usize, DeckKey),
    /// An EQ band's gain ratio, 0..4 with 1 flat.
    Eq(usize, EqBand),
    EqKill(usize, EqBand),
    /// The quick effect super knob, which is our filter: 0..1, 0.5 off.
    Filter(usize),
    /// A stem's mute button. The index is our stem's bit.
    StemMute(usize, usize),
    Crossfader,
    /// Headphones: -1 cue only ..= 1 master only.
    HeadMix,
    /// Master gain ratio.
    MasterGain,
    NumDecks,
    NumSamplers,
    /// Relative: moves the library selection.
    Browse,
    /// Moves the library selection one row when pressed.
    BrowseStep(i8),
    /// Loads the selected track into the first stopped deck.
    LoadIntoStopped,
    Sampler(usize, SamplerKey),
    Fx(usize, FxKey),
}

/// How a raw MIDI value (0..127) becomes a control value. These follow
/// Mixxx's control behaviors.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Behavior {
    /// 1 while held, 0 when released.
    Push,
    /// Flips between 0 and 1 on each press.
    Toggle,
    /// Linear from `min` to `max`.
    Pot { min: f64, max: f64 },
    /// Mixxx's audio taper: a gain ratio, `neutral` of the way along the
    /// travel giving 1.0.
    Taper(Taper),
    /// A relative control: the value is a step, not a position.
    Encoder,
}

/// Mixxx's `ControlAudioTaperPotBehavior`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Taper {
    pub min_db: f64,
    pub max_db: f64,
    pub neutral: f64,
}

fn db_to_ratio(db: f64) -> f64 {
    10f64.powf(db / 20.0)
}

fn ratio_to_db(r: f64) -> f64 {
    20.0 * r.max(1e-12).log10()
}

impl Taper {
    const FADER: Taper = Taper {
        min_db: -20.0,
        max_db: 0.0,
        neutral: 1.0,
    };
    const PREGAIN: Taper = Taper {
        min_db: -12.0,
        max_db: PREGAIN_DB,
        neutral: 0.5,
    };
    /// EQ gains: kill at the bottom, +12 dB (ratio 4) at the top.
    const EQ: Taper = Taper {
        min_db: -12.0,
        max_db: 12.041_199_826_559_248,
        neutral: 0.5,
    };
    const MASTER: Taper = Taper {
        min_db: -MASTER_DB,
        max_db: MASTER_DB,
        neutral: 0.5,
    };

    fn max(&self) -> f64 {
        db_to_ratio(self.max_db)
    }

    fn offset(&self) -> f64 {
        db_to_ratio(self.min_db)
    }

    fn midi_correction(&self) -> f64 {
        (self.neutral * 127.0).ceil() - self.neutral * 127.0
    }

    pub fn value_to_parameter(&self, v: f64) -> f64 {
        if v <= 0.0 {
            0.0
        } else if v < 1.0 {
            let overlay = self.offset() * (1.0 - v);
            if self.min_db != 0.0 {
                -((ratio_to_db(v + overlay) - self.min_db) / self.min_db * self.neutral)
            } else {
                v * self.neutral
            }
        } else if v == 1.0 {
            self.neutral
        } else if v < self.max() {
            ratio_to_db(v) / self.max_db * (1.0 - self.neutral) + self.neutral
        } else {
            1.0
        }
    }

    pub fn parameter_to_value(&self, p: f64) -> f64 {
        if p <= 0.0 {
            0.0
        } else if p < self.neutral {
            if self.min_db != 0.0 {
                let db = p * self.min_db / -self.neutral + self.min_db;
                (db_to_ratio(db) - self.offset()) / (1.0 - self.offset())
            } else {
                p / self.neutral
            }
        } else if p == self.neutral {
            1.0
        } else if p < 1.0 {
            db_to_ratio((p - self.neutral) * self.max_db / (1.0 - self.neutral))
        } else {
            self.max()
        }
    }

    fn midi_to_parameter(&self, m: f64) -> f64 {
        let c = self.midi_correction();
        if self.neutral != 0.0 && self.neutral != 1.0 {
            if (m - c) / 127.0 < self.neutral {
                m / (127.0 + c / self.neutral)
            } else {
                (m - c / self.neutral) / (127.0 - c / self.neutral)
            }
        } else {
            m / 127.0
        }
    }

    fn parameter_to_midi(&self, p: f64) -> f64 {
        let c = self.midi_correction();
        let mut m = p * 127.0;
        if self.neutral != 0.0 && self.neutral != 1.0 {
            if p < self.neutral {
                m += c * p / self.neutral;
            } else {
                m += c * (1.0 - p) / self.neutral;
            }
        }
        m
    }
}

impl Behavior {
    /// Control value to a 0..1 knob position.
    pub fn value_to_parameter(&self, v: f64) -> f64 {
        match *self {
            Behavior::Pot { min, max } => ((v.clamp(min, max) - min) / (max - min)).clamp(0.0, 1.0),
            Behavior::Taper(t) => t.value_to_parameter(v),
            Behavior::Push | Behavior::Toggle | Behavior::Encoder => v,
        }
    }

    /// 0..1 knob position to a control value.
    pub fn parameter_to_value(&self, p: f64) -> f64 {
        match *self {
            Behavior::Pot { min, max } => min + p * (max - min),
            Behavior::Taper(t) => t.parameter_to_value(p),
            Behavior::Push | Behavior::Toggle | Behavior::Encoder => p,
        }
    }

    /// Raw MIDI value to a 0..1 knob position. Potentiometers put MIDI 64
    /// exactly at the centre, as Mixxx does.
    pub fn midi_to_parameter(&self, m: f64) -> f64 {
        match *self {
            Behavior::Pot { .. } => {
                if m > 64.0 {
                    (m - 1.0) / 126.0
                } else {
                    m / 128.0
                }
            }
            Behavior::Taper(t) => t.midi_to_parameter(m),
            Behavior::Encoder => m,
            Behavior::Push | Behavior::Toggle => m / 127.0,
        }
    }

    /// Control value to the MIDI value a control at that position sends,
    /// for relative MIDI options that add to the current position.
    pub fn value_to_midi(&self, v: f64) -> f64 {
        match *self {
            Behavior::Pot { .. } => {
                let p = self.value_to_parameter(v);
                if p > 0.5 {
                    p * 126.0 + 1.0
                } else {
                    p * 128.0
                }
            }
            Behavior::Taper(t) => t.parameter_to_midi(t.value_to_parameter(v)),
            Behavior::Encoder => v,
            Behavior::Push | Behavior::Toggle => v * 127.0,
        }
    }

    /// Whether this is a continuous control soft takeover applies to.
    pub fn is_pot(&self) -> bool {
        matches!(self, Behavior::Pot { .. } | Behavior::Taper(_))
    }
}

/// `[ChannelN]` → deck index, for our decks only.
fn channel(group: &str) -> Option<usize> {
    let n: usize = group
        .strip_prefix("[Channel")?
        .strip_suffix(']')?
        .parse()
        .ok()?;
    (1..=NUM_DECKS).contains(&n).then(|| n - 1)
}

/// Parses `prefix<N>suffix` with N in 1..=max, returning N - 1.
fn numbered(s: &str, prefix: &str, suffix: &str, max: usize) -> Option<usize> {
    let n: usize = s.strip_prefix(prefix)?.strip_suffix(suffix)?.parse().ok()?;
    (1..=max).contains(&n).then(|| n - 1)
}

fn band(n: &str) -> Option<EqBand> {
    match n {
        "1" => Some(EqBand::Low),
        "2" => Some(EqBand::Mid),
        "3" => Some(EqBand::High),
        _ => None,
    }
}

/// Mixxx numbers stems as stem files store them: drums, bass, other
/// (our melody), vocals. Returns our stem's bit.
fn stem_bit(n: usize) -> Option<usize> {
    use dj_engine::Stem;
    let stem = match n {
        1 => Stem::Drums,
        2 => Stem::Bass,
        3 => Stem::Melody,
        4 => Stem::Vocals,
        _ => return None,
    };
    Some(stem as usize)
}

fn deck_key(key: &str) -> Option<DeckKey> {
    use DeckKey::*;
    Some(match key {
        "play" => Play,
        "play_indicator" | "play_latched" => PlayIndicator,
        "stop" => Stop,
        "start" => Start,
        "cue_default" | "cue_cdj" => Cue,
        "cue_indicator" => CueIndicator,
        "cue_gotoandplay" => CueGotoAndPlay,
        "cue_gotoandstop" => CueGotoAndStop,
        "cue_set" => CueSet,
        "beatsync" | "beatsync_tempo" | "sync_enabled" | "beatsync_phase" => Sync,
        "pfl" => Pfl,
        "keylock" => Keylock,
        "slip_enabled" => Slip,
        "quantize" => Quantize,
        "volume" => Volume,
        "pregain" => Pregain,
        "rate" => Rate,
        "rateRange" => RateRange,
        "jog" => Jog,
        "rate_temp_up" => TempBend(true, false),
        "rate_temp_down" => TempBend(false, false),
        "rate_temp_up_small" => TempBend(true, true),
        "rate_temp_down_small" => TempBend(false, true),
        "loop_in" => LoopIn,
        "loop_out" => LoopOut,
        "reloop_toggle" | "reloop_exit" => Reloop,
        "loop_enabled" => LoopEnabled,
        "loop_halve" => LoopHalve,
        "loop_double" => LoopDouble,
        "beatloop_activate" => BeatLoopActivate,
        "beatloop_toggle" => BeatLoopToggle,
        "beatloop_size" => BeatLoopSize,
        "beatjump_forward" => BeatJumpForward,
        "beatjump_backward" => BeatJumpBackward,
        "beatjump_size" => BeatJumpSize,
        "LoadSelectedTrack" => LoadSelected,
        "eject" => Eject,
        "track_loaded" => TrackLoaded,
        "duration" => Duration,
        "playposition" => PlayPosition,
        "bpm" | "visual_bpm" => Bpm,
        "file_bpm" => FileBpm,
        "VuMeter" => VuMeter,
        "PeakIndicator" => PeakIndicator,
        _ => {
            if let Some(rest) = key.strip_prefix("hotcue_") {
                let (n, what) = rest.split_once('_')?;
                let i: usize = n.parse().ok()?;
                if !(1..=HOT_CUES).contains(&i) {
                    return None;
                }
                let what = match what {
                    "activate" => HotCueKey::Activate,
                    "clear" => HotCueKey::Clear,
                    "set" => HotCueKey::Set,
                    "goto" => HotCueKey::Goto,
                    "gotoandplay" => HotCueKey::GotoAndPlay,
                    "gotoandstop" => HotCueKey::GotoAndStop,
                    "enabled" | "status" => HotCueKey::Enabled,
                    _ => return None,
                };
                return Some(HotCue(i - 1, what));
            }
            if let Some(rest) = key.strip_prefix("beatloop_") {
                let (n, what) = rest.split_once('_')?;
                let what = match what {
                    "activate" => BeatLoopKey::Activate,
                    "toggle" => BeatLoopKey::Toggle,
                    "enabled" => BeatLoopKey::Enabled,
                    _ => return None,
                };
                return Some(BeatLoop(Beats::parse(n)?, what));
            }
            if let Some(rest) = key.strip_prefix("beatjump_") {
                let (n, dir) = rest.split_once('_')?;
                let forward = match dir {
                    "forward" => true,
                    "backward" => false,
                    _ => return None,
                };
                return Some(BeatJumpBy(Beats::parse(n)?, forward));
            }
            return None;
        }
    })
}

fn fx_key(key: &str, effect: bool) -> Option<FxKey> {
    if let Some(ch) = key
        .strip_prefix("group_")
        .and_then(|k| k.strip_suffix("_enable"))
        .filter(|_| !effect)
    {
        return channel(ch).map(FxKey::AssignedTo);
    }
    Some(match (key, effect) {
        ("enabled", _) => FxKey::Enabled,
        ("mix" | "super1", false) | ("meta", true) => FxKey::Level,
        ("next_chain", false) | ("next_effect", true) => FxKey::Next,
        ("prev_chain", false) | ("prev_effect", true) => FxKey::Prev,
        ("chain_selector", false) | ("effect_selector", true) => FxKey::Selector,
        _ => return None,
    })
}

impl Control {
    /// The control Mixxx calls `[group] key`, if our engine has it.
    pub fn parse(group: &str, key: &str) -> Option<Control> {
        if let Some(d) = channel(group) {
            // Mixxx's old per-channel EQ names.
            let eq = match key {
                "filterLow" => Some(Control::Eq(d, EqBand::Low)),
                "filterMid" => Some(Control::Eq(d, EqBand::Mid)),
                "filterHigh" => Some(Control::Eq(d, EqBand::High)),
                "filterLowKill" => Some(Control::EqKill(d, EqBand::Low)),
                "filterMidKill" => Some(Control::EqKill(d, EqBand::Mid)),
                "filterHighKill" => Some(Control::EqKill(d, EqBand::High)),
                _ => None,
            };
            return eq.or_else(|| deck_key(key).map(|k| Control::Deck(d, k)));
        }
        if let Some(inner) = group
            .strip_prefix("[EqualizerRack1_")
            .and_then(|g| g.strip_suffix("_Effect1]"))
        {
            let d = channel(inner)?;
            if let Some(n) = key.strip_prefix("button_parameter") {
                return Some(Control::EqKill(d, band(n)?));
            }
            return Some(Control::Eq(d, band(key.strip_prefix("parameter")?)?));
        }
        if let Some(inner) = group
            .strip_prefix("[QuickEffectRack1_")
            .and_then(|g| g.strip_suffix(']'))
        {
            let d = channel(inner)?;
            return (key == "super1").then_some(Control::Filter(d));
        }
        if let Some(rest) = group.strip_prefix("[Channel") {
            // [ChannelN_StemM]
            let (n, m) = rest.strip_suffix(']')?.split_once("_Stem")?;
            let d: usize = n.parse().ok()?;
            let m: usize = m.parse().ok()?;
            if !(1..=NUM_DECKS).contains(&d) || m > STEMS {
                return None;
            }
            return (key == "mute").then_some(Control::StemMute(d - 1, stem_bit(m)?));
        }
        if let Some(s) = numbered(group, "[Sampler", "]", SAMPLER_SLOTS) {
            use SamplerKey::*;
            let k = match key {
                "play" => Play,
                "cue_gotoandplay" | "start_play" | "start_stop" => Start,
                "stop" => Stop,
                "LoadSelectedTrack" => LoadSelected,
                "eject" => Eject,
                "track_loaded" => TrackLoaded,
                "play_indicator" | "play_latched" => PlayIndicator,
                "volume" | "pregain" => Volume,
                _ => return None,
            };
            return Some(Control::Sampler(s, k));
        }
        if let Some(u) = numbered(group, "[EffectRack1_EffectUnit", "]", NUM_DECKS) {
            return fx_key(key, false).map(|k| Control::Fx(u, k));
        }
        if let Some(u) = numbered(group, "[EffectRack1_EffectUnit", "_Effect1]", NUM_DECKS) {
            return fx_key(key, true).map(|k| Control::Fx(u, k));
        }
        match (group, key) {
            ("[Master]" | "[Main]" | "[Mixer]", "crossfader") => Some(Control::Crossfader),
            ("[Master]" | "[Main]" | "[Mixer]", "headMix") => Some(Control::HeadMix),
            ("[Master]" | "[Main]" | "[Mixer]", "gain" | "volume") => Some(Control::MasterGain),
            ("[Master]" | "[App]", "num_decks") => Some(Control::NumDecks),
            ("[Master]" | "[App]", "num_samplers") => Some(Control::NumSamplers),
            ("[Library]", "MoveVertical") | ("[Playlist]", "SelectTrackKnob") => {
                Some(Control::Browse)
            }
            ("[Library]", "MoveUp") | ("[Playlist]", "SelectPrevTrack") => {
                Some(Control::BrowseStep(-1))
            }
            ("[Library]", "MoveDown") | ("[Playlist]", "SelectNextTrack") => {
                Some(Control::BrowseStep(1))
            }
            ("[Playlist]", "LoadSelectedIntoFirstStopped")
            | ("[Library]", "GoToItem" | "LoadSelectedIntoFirstStopped") => {
                Some(Control::LoadIntoStopped)
            }
            _ => None,
        }
    }

    pub fn behavior(&self) -> Behavior {
        use DeckKey as K;
        match *self {
            Control::Deck(_, k) => match k {
                K::Play | K::Pfl | K::Keylock | K::Slip | K::Quantize | K::LoopEnabled => {
                    Behavior::Toggle
                }
                K::Volume => Behavior::Taper(Taper::FADER),
                K::Pregain => Behavior::Taper(Taper::PREGAIN),
                K::Rate => Behavior::Pot {
                    min: -1.0,
                    max: 1.0,
                },
                K::RateRange => Behavior::Pot {
                    min: 0.01,
                    max: 4.0,
                },
                K::PlayPosition => Behavior::Pot { min: 0.0, max: 1.0 },
                K::VuMeter => Behavior::Pot { min: 0.0, max: 1.0 },
                K::Jog => Behavior::Encoder,
                K::BeatLoopSize | K::BeatJumpSize | K::Duration | K::Bpm | K::FileBpm => {
                    Behavior::Pot {
                        min: 0.0,
                        max: 512.0,
                    }
                }
                _ => Behavior::Push,
            },
            Control::Eq(..) => Behavior::Taper(Taper::EQ),
            Control::EqKill(..) | Control::StemMute(..) => Behavior::Toggle,
            Control::Filter(_) => Behavior::Pot { min: 0.0, max: 1.0 },
            Control::Crossfader | Control::HeadMix => Behavior::Pot {
                min: -1.0,
                max: 1.0,
            },
            Control::MasterGain => Behavior::Taper(Taper::MASTER),
            Control::NumDecks | Control::NumSamplers => Behavior::Pot {
                min: 0.0,
                max: 64.0,
            },
            Control::Browse => Behavior::Encoder,
            Control::BrowseStep(_) | Control::LoadIntoStopped => Behavior::Push,
            Control::Sampler(_, k) => match k {
                SamplerKey::Play => Behavior::Toggle,
                SamplerKey::Volume => Behavior::Taper(Taper::FADER),
                _ => Behavior::Push,
            },
            Control::Fx(_, k) => match k {
                FxKey::Enabled => Behavior::Toggle,
                FxKey::Level => Behavior::Pot { min: 0.0, max: 1.0 },
                FxKey::Selector => Behavior::Encoder,
                FxKey::Next | FxKey::Prev => Behavior::Push,
                FxKey::AssignedTo(_) => Behavior::Toggle,
            },
        }
    }
}

/// Per-deck settings Mixxx keeps that our engine doesn't.
#[derive(Debug, Clone, Copy)]
struct DeckExtra {
    rate_range: f64,
    beatjump: f64,
    /// EQ gains before each band was killed, to bring back on unkill.
    before_kill: [Option<f32>; 3],
}

impl Default for DeckExtra {
    fn default() -> Self {
        Self {
            rate_range: DEFAULT_RATE_RANGE,
            beatjump: DEFAULT_BEATJUMP,
            before_kill: [None; 3],
        }
    }
}

/// Reads and sets [`Control`]s against engine state.
#[derive(Debug, Clone, Default)]
pub struct Controls {
    decks: [DeckExtra; NUM_DECKS],
}

fn deck_id(d: usize) -> DeckId {
    DeckId::from_index(d).expect("deck index")
}

fn engine(cmd: Command) -> Vec<Action> {
    vec![Action::Engine(cmd)]
}

fn flag(b: bool) -> f64 {
    if b {
        1.0
    } else {
        0.0
    }
}

fn step_fx(kind: FxKind, by: i64) -> FxKind {
    let n = FxKind::ALL.len() as i64;
    let i = (kind as i64 + by).rem_euclid(n);
    FxKind::ALL[i as usize]
}

impl Controls {
    pub fn new() -> Self {
        Self::default()
    }

    /// The control's current value, in Mixxx's units.
    pub fn get(&self, c: Control, state: &State) -> f64 {
        use DeckKey as K;
        match c {
            Control::Deck(d, k) => {
                let deck = &state.decks[d];
                let x = &self.decks[d];
                match k {
                    K::Play | K::PlayIndicator => flag(deck.playing),
                    K::CueIndicator => flag(
                        deck.loaded && !deck.playing && (deck.position - deck.cue).abs() < 0.01,
                    ),
                    K::Pfl => flag(deck.pfl),
                    K::Keylock => flag(deck.keylock),
                    K::Slip => flag(deck.slip),
                    K::Quantize => flag(state.mixer.quantize),
                    K::Volume => Taper::FADER.parameter_to_value(f64::from(deck.fader)),
                    K::Pregain => db_to_ratio(f64::from(deck.gain_db)),
                    K::Rate => (deck.rate - 1.0) / x.rate_range,
                    K::RateRange => x.rate_range,
                    K::LoopEnabled => flag(deck.looping),
                    K::BeatLoopSize => deck.loop_beats,
                    K::BeatLoop(b, BeatLoopKey::Enabled) => {
                        flag(deck.looping && (deck.loop_beats - b.get()).abs() < 1e-6)
                    }
                    K::BeatJumpSize => x.beatjump,
                    K::HotCue(i, HotCueKey::Enabled) => flag(deck.hot_cues[i].is_some()),
                    K::TrackLoaded => flag(deck.loaded),
                    K::Duration => deck.duration,
                    K::PlayPosition => {
                        if deck.duration > 0.0 {
                            deck.position / deck.duration
                        } else {
                            0.0
                        }
                    }
                    K::Bpm => deck.bpm * deck.speed,
                    K::FileBpm => deck.bpm,
                    K::VuMeter => f64::from(deck.peak).clamp(0.0, 1.0),
                    K::PeakIndicator => flag(deck.peak >= 1.0),
                    _ => 0.0,
                }
            }
            Control::Eq(d, b) => {
                let db = state.decks[d].eq_db[b as usize];
                if db <= EQ_KILL_DB {
                    0.0
                } else {
                    db_to_ratio(f64::from(db))
                }
            }
            Control::EqKill(d, b) => flag(state.decks[d].eq_db[b as usize] <= EQ_KILL_DB),
            Control::Filter(d) => f64::from(state.decks[d].filter) / 2.0 + 0.5,
            Control::StemMute(d, bit) => flag(state.decks[d].stems & (1 << bit) == 0),
            Control::Crossfader => f64::from(state.mixer.crossfader),
            Control::HeadMix => f64::from(state.mixer.cue_mix) * 2.0 - 1.0,
            Control::MasterGain => db_to_ratio(f64::from(state.mixer.master_db)),
            Control::NumDecks => NUM_DECKS as f64,
            Control::NumSamplers => SAMPLER_SLOTS as f64,
            Control::Sampler(s, k) => {
                let slot = &state.sampler.slots[s];
                match k {
                    SamplerKey::Play | SamplerKey::PlayIndicator => flag(slot.playing),
                    SamplerKey::TrackLoaded => flag(slot.loaded),
                    SamplerKey::Volume => {
                        Taper::FADER.parameter_to_value(f64::from(state.sampler.level))
                    }
                    _ => 0.0,
                }
            }
            Control::Fx(u, k) => {
                let fx = &state.decks[u].fx;
                match k {
                    FxKey::Enabled => flag(fx.on),
                    FxKey::Level => f64::from(fx.level),
                    FxKey::AssignedTo(d) => flag(d == u),
                    _ => 0.0,
                }
            }
            Control::Browse | Control::BrowseStep(_) | Control::LoadIntoStopped => 0.0,
        }
    }

    /// Sets the control to `v`, in Mixxx's units. For buttons, 1 is a press
    /// and 0 a release.
    pub fn set(&mut self, c: Control, v: f64, state: &State) -> Vec<Action> {
        use DeckKey as K;
        let on = v > 0.0;
        match c {
            Control::Deck(d, k) => {
                let deck_state = &state.decks[d];
                let deck = deck_id(d);
                let x = &mut self.decks[d];
                match k {
                    K::Play => {
                        if on == deck_state.playing {
                            vec![]
                        } else if on {
                            engine(Command::Play { deck })
                        } else {
                            engine(Command::Pause { deck })
                        }
                    }
                    K::Stop if on => engine(Command::Pause { deck }),
                    K::Start if on => engine(Command::Seek { deck, seconds: 0.0 }),
                    K::Cue if on => engine(Command::CuePress { deck }),
                    K::Cue => engine(Command::CueRelease { deck }),
                    K::CueGotoAndPlay if on => vec![
                        Action::Engine(Command::Seek {
                            deck,
                            seconds: deck_state.cue,
                        }),
                        Action::Engine(Command::Play { deck }),
                    ],
                    K::CueGotoAndStop if on => vec![
                        Action::Engine(Command::Pause { deck }),
                        Action::Engine(Command::Seek {
                            deck,
                            seconds: deck_state.cue,
                        }),
                    ],
                    K::CueSet if on => engine(Command::SetCue {
                        deck,
                        seconds: deck_state.position,
                    }),
                    K::Sync if on => engine(Command::Sync { deck }),
                    K::Pfl if on != deck_state.pfl => engine(Command::SetPfl { deck, on }),
                    K::Keylock if on != deck_state.keylock => {
                        engine(Command::SetKeylock { deck, on })
                    }
                    K::Slip if on != deck_state.slip => engine(Command::SetSlip { deck, on }),
                    K::Quantize if on != state.mixer.quantize => {
                        engine(Command::SetQuantize { on })
                    }
                    K::Volume => engine(Command::SetFader {
                        deck,
                        value: Taper::FADER.value_to_parameter(v).clamp(0.0, 1.0) as f32,
                    }),
                    K::Pregain => engine(Command::SetGain {
                        deck,
                        db: ratio_to_db(v).clamp(-PREGAIN_DB, PREGAIN_DB) as f32,
                    }),
                    K::Rate => engine(Command::SetRate {
                        deck,
                        rate: 1.0 + v.clamp(-1.0, 1.0) * x.rate_range,
                    }),
                    K::RateRange => {
                        x.rate_range = v.clamp(0.01, 4.0);
                        vec![]
                    }
                    K::Jog if v != 0.0 => engine(Command::Jog {
                        deck,
                        seconds: v * JOG_SECS,
                    }),
                    K::TempBend(up, small) => {
                        let size = if small { TEMP_BEND_SMALL } else { TEMP_BEND };
                        let bend = match (on, up) {
                            (false, _) => 0.0,
                            (true, true) => size,
                            (true, false) => -size,
                        };
                        engine(Command::SetBend { deck, bend })
                    }
                    K::LoopIn if on => engine(Command::LoopIn { deck }),
                    K::LoopOut if on => engine(Command::LoopOut { deck }),
                    K::Reloop if on => engine(Command::ReloopExit { deck }),
                    K::LoopEnabled if on != deck_state.looping => {
                        engine(Command::LoopToggle { deck })
                    }
                    K::LoopHalve if on => engine(Command::LoopScale { deck, factor: 0.5 }),
                    K::LoopDouble if on => engine(Command::LoopScale { deck, factor: 2.0 }),
                    K::BeatLoopActivate if on => beat_loop(deck, deck_state.loop_beats, deck_state),
                    K::BeatLoopToggle if on => engine(Command::LoopToggle { deck }),
                    K::BeatLoopSize if v > 0.0 && deck_state.loop_beats > 0.0 => {
                        engine(Command::LoopScale {
                            deck,
                            factor: v / deck_state.loop_beats,
                        })
                    }
                    K::BeatLoop(b, BeatLoopKey::Activate) if on => {
                        beat_loop(deck, b.get(), deck_state)
                    }
                    K::BeatLoop(b, BeatLoopKey::Toggle) if on => engine(Command::BeatLoop {
                        deck,
                        beats: b.get(),
                    }),
                    K::BeatJumpForward if on => engine(Command::BeatJump {
                        deck,
                        beats: x.beatjump,
                    }),
                    K::BeatJumpBackward if on => engine(Command::BeatJump {
                        deck,
                        beats: -x.beatjump,
                    }),
                    K::BeatJumpSize => {
                        if v > 0.0 {
                            x.beatjump = v.min(512.0);
                        }
                        vec![]
                    }
                    K::BeatJumpBy(b, forward) if on => engine(Command::BeatJump {
                        deck,
                        beats: if forward { b.get() } else { -b.get() },
                    }),
                    K::HotCue(index, what) => hot_cue(deck, index, what, on, deck_state),
                    K::LoadSelected if on => vec![Action::LoadSelected(deck)],
                    K::Eject if on => engine(Command::Eject { deck }),
                    K::PlayPosition if deck_state.duration > 0.0 => engine(Command::Seek {
                        deck,
                        seconds: v.clamp(0.0, 1.0) * deck_state.duration,
                    }),
                    _ => vec![],
                }
            }
            Control::Eq(d, band) => {
                let db = if v <= 0.0 {
                    EQ_KILL_DB
                } else {
                    (ratio_to_db(v) as f32).clamp(EQ_KILL_DB, EQ_MAX_DB)
                };
                self.decks[d].before_kill[band as usize] = None;
                engine(Command::SetEq {
                    deck: deck_id(d),
                    band,
                    db,
                })
            }
            Control::EqKill(d, band) => {
                let now = state.decks[d].eq_db[band as usize];
                let killed = now <= EQ_KILL_DB;
                let saved = &mut self.decks[d].before_kill[band as usize];
                let db = match (on, killed) {
                    (true, false) => {
                        *saved = Some(now);
                        EQ_KILL_DB
                    }
                    (false, true) => saved.take().unwrap_or(0.0),
                    _ => return vec![],
                };
                engine(Command::SetEq {
                    deck: deck_id(d),
                    band,
                    db,
                })
            }
            Control::Filter(d) => {
                let x = ((v - 0.5) * 2.0) as f32;
                let value = if x.abs() < FILTER_DETENT {
                    0.0
                } else {
                    x.clamp(-1.0, 1.0)
                };
                engine(Command::SetFilter {
                    deck: deck_id(d),
                    value,
                })
            }
            Control::StemMute(d, bit) => {
                let stems = state.decks[d].stems;
                let mask = if on {
                    stems & !(1 << bit)
                } else {
                    stems | (1 << bit)
                };
                if mask == stems {
                    vec![]
                } else {
                    engine(Command::SetStems {
                        deck: deck_id(d),
                        mask,
                    })
                }
            }
            Control::Crossfader => engine(Command::SetCrossfader {
                value: v.clamp(-1.0, 1.0) as f32,
            }),
            Control::HeadMix => engine(Command::SetCueMix {
                value: ((v.clamp(-1.0, 1.0) + 1.0) / 2.0) as f32,
            }),
            Control::MasterGain => engine(Command::SetMasterGain {
                db: ratio_to_db(v).clamp(-MASTER_DB * 3.0, MASTER_DB) as f32,
            }),
            Control::NumDecks | Control::NumSamplers => vec![],
            Control::Browse => {
                let rows = v.round() as i32;
                if rows == 0 {
                    vec![]
                } else {
                    vec![Action::Browse(rows)]
                }
            }
            Control::BrowseStep(by) if on => vec![Action::Browse(i32::from(by))],
            Control::BrowseStep(_) => vec![],
            Control::LoadIntoStopped if on => {
                match (0..NUM_DECKS).find(|&d| !state.decks[d].playing) {
                    Some(d) => vec![Action::LoadSelected(deck_id(d))],
                    None => vec![],
                }
            }
            Control::LoadIntoStopped => vec![],
            Control::Sampler(slot, k) => {
                let playing = state.sampler.slots[slot].playing;
                match k {
                    SamplerKey::Play if on && !playing => engine(Command::SamplePlay { slot }),
                    SamplerKey::Play if !on && playing => engine(Command::SampleStop { slot }),
                    SamplerKey::Start if on => engine(Command::SamplePlay { slot }),
                    SamplerKey::Stop if on => engine(Command::SampleStop { slot }),
                    SamplerKey::LoadSelected if on => vec![Action::LoadSample(slot)],
                    SamplerKey::Eject if on => engine(Command::ClearSample { slot }),
                    SamplerKey::Volume => engine(Command::SetSamplerLevel {
                        value: Taper::FADER.value_to_parameter(v).clamp(0.0, 1.0) as f32,
                    }),
                    _ => vec![],
                }
            }
            Control::Fx(u, k) => {
                let deck = deck_id(u);
                let fx = &state.decks[u].fx;
                match k {
                    FxKey::Enabled if on != fx.on => engine(Command::SetFxOn { deck, on }),
                    FxKey::Level => engine(Command::SetFxLevel {
                        deck,
                        value: v.clamp(0.0, 1.0) as f32,
                    }),
                    FxKey::Next if on => engine(Command::SetFxKind {
                        deck,
                        kind: step_fx(fx.kind, 1),
                    }),
                    FxKey::Prev if on => engine(Command::SetFxKind {
                        deck,
                        kind: step_fx(fx.kind, -1),
                    }),
                    FxKey::Selector if v.round() != 0.0 => engine(Command::SetFxKind {
                        deck,
                        kind: step_fx(fx.kind, v.round() as i64),
                    }),
                    _ => vec![],
                }
            }
        }
    }

    /// Handles a MIDI value already through the mapping's options, as
    /// Mixxx's `setValueFromMidi`: buttons press on non-zero and release on
    /// zero or note off, toggles flip on press, knobs go through their
    /// behavior's curve.
    pub fn set_from_midi(
        &mut self,
        c: Control,
        midi: f64,
        note_off: bool,
        state: &State,
    ) -> Vec<Action> {
        let b = c.behavior();
        let pressed = !note_off && midi != 0.0;
        match b {
            Behavior::Push => self.set(c, flag(pressed), state),
            Behavior::Toggle if pressed => {
                let now = self.get(c, state) > 0.0;
                self.set(c, flag(!now), state)
            }
            Behavior::Toggle => vec![],
            Behavior::Encoder => self.set(c, midi, state),
            Behavior::Pot { .. } | Behavior::Taper(_) => {
                let v = b.parameter_to_value(b.midi_to_parameter(midi));
                self.set(c, v, state)
            }
        }
    }

    /// The control's position as a MIDI value, for relative MIDI options.
    pub fn get_midi(&self, c: Control, state: &State) -> f64 {
        c.behavior().value_to_midi(self.get(c, state))
    }
}

/// A beat loop of `beats` that doesn't turn off an identical loop already
/// playing, as Mixxx's `beatloop_X_activate`.
fn beat_loop(deck: DeckId, beats: f64, state: &dj_engine::DeckSnapshot) -> Vec<Action> {
    if state.looping && (state.loop_beats - beats).abs() < 1e-6 {
        vec![]
    } else {
        engine(Command::BeatLoop { deck, beats })
    }
}

fn hot_cue(
    deck: DeckId,
    index: usize,
    what: HotCueKey,
    on: bool,
    state: &dj_engine::DeckSnapshot,
) -> Vec<Action> {
    let at = state.hot_cues[index];
    match what {
        HotCueKey::Activate if on => engine(Command::HotCuePress { deck, index }),
        HotCueKey::Activate => engine(Command::HotCueRelease { deck, index }),
        HotCueKey::Clear if on => engine(Command::HotCueClear { deck, index }),
        HotCueKey::Set if on => engine(Command::SetHotCue {
            deck,
            index,
            seconds: Some(state.position),
        }),
        HotCueKey::Goto | HotCueKey::GotoAndPlay | HotCueKey::GotoAndStop if on => {
            let Some(seconds) = at else { return vec![] };
            let mut out = vec![];
            if what == HotCueKey::GotoAndStop {
                out.push(Action::Engine(Command::Pause { deck }));
            }
            out.push(Action::Engine(Command::Seek { deck, seconds }));
            if what == HotCueKey::GotoAndPlay {
                out.push(Action::Engine(Command::Play { deck }));
            }
            out
        }
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st() -> State {
        let mut s = State::default();
        for d in &mut s.decks {
            d.loaded = true;
            d.rate = 1.0;
            d.speed = 1.0;
            d.fader = 1.0;
            d.loop_beats = 4.0;
            d.stems = dj_engine::ALL_STEMS;
        }
        s
    }

    fn cmds(a: Vec<Action>) -> Vec<Command> {
        a.into_iter()
            .filter_map(|a| match a {
                Action::Engine(c) => Some(c),
                _ => None,
            })
            .collect()
    }

    fn c(group: &str, key: &str) -> Control {
        Control::parse(group, key).unwrap_or_else(|| panic!("{group} {key}"))
    }

    #[test]
    fn parses_common_names() {
        assert_eq!(c("[Channel1]", "play"), Control::Deck(0, DeckKey::Play));
        assert_eq!(
            c("[Channel2]", "hotcue_8_activate"),
            Control::Deck(1, DeckKey::HotCue(7, HotCueKey::Activate))
        );
        assert_eq!(
            c("[Channel1]", "beatloop_0.5_toggle"),
            Control::Deck(0, DeckKey::BeatLoop(Beats(16), BeatLoopKey::Toggle))
        );
        assert_eq!(
            c("[EqualizerRack1_[Channel2]_Effect1]", "parameter1"),
            Control::Eq(1, EqBand::Low)
        );
        assert_eq!(
            c("[EqualizerRack1_[Channel1]_Effect1]", "button_parameter3"),
            Control::EqKill(0, EqBand::High)
        );
        assert_eq!(
            c("[QuickEffectRack1_[Channel1]]", "super1"),
            Control::Filter(0)
        );
        assert_eq!(c("[Master]", "crossfader"), Control::Crossfader);
        assert_eq!(
            c("[Sampler8]", "cue_gotoandplay"),
            Control::Sampler(7, SamplerKey::Start)
        );
        assert_eq!(
            c("[EffectRack1_EffectUnit2]", "mix"),
            Control::Fx(1, FxKey::Level)
        );
        assert_eq!(
            c("[Channel1_Stem4]", "mute"),
            Control::StemMute(0, dj_engine::Stem::Vocals as usize)
        );
    }

    #[test]
    fn unknown_names_and_extra_decks_dont_parse() {
        assert_eq!(Control::parse("[Channel3]", "play"), None);
        assert_eq!(Control::parse("[Channel1]", "hotcue_9_activate"), None);
        assert_eq!(Control::parse("[Channel1]", "beatloop_3_toggle"), None);
        assert_eq!(Control::parse("[Sampler9]", "play"), None);
        assert_eq!(Control::parse("[Channel1]", "no_such_control"), None);
        assert_eq!(Control::parse("[Skin]", "show_mixer"), None);
    }

    #[test]
    fn play_toggles_from_midi() {
        let mut ctl = Controls::new();
        let play = c("[Channel1]", "play");
        let mut s = st();
        assert!(matches!(
            cmds(ctl.set_from_midi(play, 127.0, false, &s))[..],
            [Command::Play { deck: DeckId::A }]
        ));
        assert!(ctl.set_from_midi(play, 0.0, false, &s).is_empty());
        s.decks[0].playing = true;
        assert!(matches!(
            cmds(ctl.set_from_midi(play, 127.0, false, &s))[..],
            [Command::Pause { deck: DeckId::A }]
        ));
    }

    #[test]
    fn hot_cue_press_and_release() {
        let mut ctl = Controls::new();
        let hc = c("[Channel2]", "hotcue_3_activate");
        let s = st();
        assert!(matches!(
            cmds(ctl.set_from_midi(hc, 127.0, false, &s))[..],
            [Command::HotCuePress {
                deck: DeckId::B,
                index: 2
            }]
        ));
        assert!(matches!(
            cmds(ctl.set_from_midi(hc, 127.0, true, &s))[..],
            [Command::HotCueRelease {
                deck: DeckId::B,
                index: 2
            }]
        ));
    }

    #[test]
    fn knobs_centre_on_midi_64() {
        let mut ctl = Controls::new();
        let s = st();
        let xf = cmds(ctl.set_from_midi(c("[Master]", "crossfader"), 64.0, false, &s));
        assert!(matches!(xf[..], [Command::SetCrossfader { value }] if value == 0.0));
        let eq = cmds(ctl.set_from_midi(
            c("[EqualizerRack1_[Channel1]_Effect1]", "parameter2"),
            64.0,
            false,
            &s,
        ));
        assert!(
            matches!(eq[..], [Command::SetEq { db, .. }] if db.abs() < 0.01),
            "{eq:?}"
        );
        let filter = cmds(ctl.set_from_midi(
            c("[QuickEffectRack1_[Channel1]]", "super1"),
            64.0,
            false,
            &s,
        ));
        assert!(matches!(filter[..], [Command::SetFilter { value, .. }] if value == 0.0));
        let trim = cmds(ctl.set_from_midi(c("[Channel1]", "pregain"), 64.0, false, &s));
        assert!(
            matches!(trim[..], [Command::SetGain { db, .. }] if db.abs() < 0.01),
            "{trim:?}"
        );
    }

    #[test]
    fn eq_ends_kill_and_boost() {
        let mut ctl = Controls::new();
        let s = st();
        let eq = c("[EqualizerRack1_[Channel1]_Effect1]", "parameter1");
        let low = cmds(ctl.set_from_midi(eq, 0.0, false, &s));
        assert!(matches!(low[..], [Command::SetEq { db, .. }] if db == EQ_KILL_DB));
        let high = cmds(ctl.set_from_midi(eq, 127.0, false, &s));
        assert!(matches!(high[..], [Command::SetEq { db, .. }] if db == EQ_MAX_DB));
    }

    #[test]
    fn eq_kill_restores_the_previous_gain() {
        let mut ctl = Controls::new();
        let mut s = st();
        s.decks[0].eq_db[0] = -3.0;
        let kill = c("[EqualizerRack1_[Channel1]_Effect1]", "button_parameter1");
        let on = cmds(ctl.set_from_midi(kill, 127.0, false, &s));
        assert!(matches!(on[..], [Command::SetEq { db, .. }] if db == EQ_KILL_DB));
        s.decks[0].eq_db[0] = EQ_KILL_DB;
        let off = cmds(ctl.set_from_midi(kill, 127.0, false, &s));
        assert!(matches!(off[..], [Command::SetEq { db, .. }] if db == -3.0));
    }

    #[test]
    fn rate_uses_the_range() {
        let mut ctl = Controls::new();
        let s = st();
        let rate = c("[Channel1]", "rate");
        let top = cmds(ctl.set_from_midi(rate, 0.0, false, &s));
        assert!(matches!(top[..], [Command::SetRate { rate, .. }] if (rate - 0.92).abs() < 1e-9));
        ctl.set(c("[Channel1]", "rateRange"), 0.5, &s);
        let bottom = cmds(ctl.set_from_midi(rate, 127.0, false, &s));
        assert!(matches!(bottom[..], [Command::SetRate { rate, .. }] if (rate - 1.5).abs() < 1e-9));
    }

    #[test]
    fn taper_round_trips() {
        for t in [Taper::FADER, Taper::PREGAIN, Taper::EQ, Taper::MASTER] {
            for i in 0..=20 {
                let p = f64::from(i) / 20.0;
                let back = t.value_to_parameter(t.parameter_to_value(p));
                assert!((back - p).abs() < 1e-9, "{t:?} {p} {back}");
            }
        }
    }

    #[test]
    fn values_read_back_from_state() {
        let ctl = Controls::new();
        let mut s = st();
        s.decks[0].playing = true;
        s.decks[0].hot_cues[1] = Some(3.0);
        s.decks[1].rate = 1.04;
        s.decks[1].looping = true;
        s.decks[1].loop_beats = 8.0;
        assert_eq!(ctl.get(c("[Channel1]", "play_indicator"), &s), 1.0);
        assert_eq!(ctl.get(c("[Channel1]", "hotcue_2_enabled"), &s), 1.0);
        assert_eq!(ctl.get(c("[Channel1]", "hotcue_1_enabled"), &s), 0.0);
        assert!((ctl.get(c("[Channel2]", "rate"), &s) - 0.5).abs() < 1e-9);
        assert_eq!(ctl.get(c("[Channel2]", "beatloop_8_enabled"), &s), 1.0);
        assert_eq!(ctl.get(c("[Channel2]", "beatloop_4_enabled"), &s), 0.0);
        assert_eq!(ctl.get(c("[Channel1]", "volume"), &s), 1.0);
    }

    #[test]
    fn stem_mute_clears_its_bit() {
        let mut ctl = Controls::new();
        let s = st();
        let mute = c("[Channel1_Stem1]", "mute");
        let out = cmds(ctl.set_from_midi(mute, 127.0, false, &s));
        let drums = 1 << dj_engine::Stem::Drums as u8;
        assert!(
            matches!(out[..], [Command::SetStems { mask, .. }] if mask == dj_engine::ALL_STEMS & !drums)
        );
    }

    #[test]
    fn browse_and_load() {
        let mut ctl = Controls::new();
        let s = st();
        assert!(matches!(
            ctl.set_from_midi(c("[Library]", "MoveVertical"), -2.0, false, &s)[..],
            [Action::Browse(-2)]
        ));
        assert!(matches!(
            ctl.set_from_midi(c("[Playlist]", "SelectNextTrack"), 127.0, false, &s)[..],
            [Action::Browse(1)]
        ));
        assert!(matches!(
            ctl.set_from_midi(c("[Channel2]", "LoadSelectedTrack"), 127.0, false, &s)[..],
            [Action::LoadSelected(DeckId::B)]
        ));
    }
}
