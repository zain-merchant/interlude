//! MIDI learn: map a controller by moving its controls.
//!
//! [`Detector`] watches raw MIDI while the user presses a button or moves a
//! knob and works out what kind of control it is: a button (note on/off),
//! an absolute knob or fader (7-bit, 14-bit or pitch bend) or a relative
//! encoder. [`Binding`]s pair those with Mixxx control names, and
//! [`write_mapping`] saves them as a Mixxx mapping file, so a learned
//! mapping is loaded like any other and can be shared with Mixxx users.

use std::time::{Duration, Instant};

use crate::controls::{Behavior, Control};
use crate::mixxx::Preset;

/// The author written into learned mappings, which marks them as made for
/// one port.
pub const AUTHOR: &str = "MIDI learn";

/// Quiet time after the last message before a moving control counts as
/// learned.
const SETTLE: Duration = Duration::from_millis(350);

/// What kind of control was moved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// Note on when pressed, note off (or velocity 0) when let go.
    Button,
    /// An absolute 7-bit control change.
    Knob,
    /// A 14-bit control change: MSB on `number`, LSB on `number + 32`.
    Knob14,
    /// A relative control change: small steps either side of 0 (two's
    /// complement) or of 64.
    Encoder { offset64: bool },
    /// Pitch bend: 14 bits across the data bytes.
    PitchBend,
}

/// A control the user moved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Learned {
    pub port: String,
    pub kind: Kind,
    /// Status byte with the channel, e.g. 0x91 or 0xB0.
    pub status: u8,
    pub number: u8,
}

impl Learned {
    /// A short description such as "note 0x0B, channel 1".
    pub fn describe(&self) -> String {
        let ch = (self.status & 0x0F) + 1;
        match self.kind {
            Kind::Button => format!("note 0x{:02X}, channel {ch}", self.number),
            Kind::Knob => format!("CC 0x{:02X}, channel {ch}", self.number),
            Kind::Knob14 => format!("CC 0x{:02X} (14-bit), channel {ch}", self.number),
            Kind::Encoder { .. } => format!("CC 0x{:02X} (relative), channel {ch}", self.number),
            Kind::PitchBend => format!("pitch bend, channel {ch}"),
        }
    }
}

/// Watches MIDI for the next control the user moves.
#[derive(Debug, Default)]
pub struct Detector {
    /// Port and messages since the first one of this control.
    seen: Option<(String, Vec<[u8; 3]>)>,
    last: Option<Instant>,
    done: Option<Learned>,
}

impl Detector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts over, forgetting anything half seen.
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// Feeds one message from `port`.
    pub fn feed(&mut self, port: &str, msg: &[u8], now: Instant) {
        if self.done.is_some() || msg.len() < 2 {
            return;
        }
        let status = msg[0];
        let kind = status & 0xF0;
        if !matches!(kind, 0x90 | 0xB0 | 0xE0) {
            return;
        }
        let m = [status, msg[1], msg.get(2).copied().unwrap_or(0)];
        // A button: the first press is enough.
        if kind == 0x90 && m[2] > 0 {
            self.done = Some(Learned {
                port: port.to_owned(),
                kind: Kind::Button,
                status,
                number: m[1],
            });
            return;
        }
        if kind == 0x90 {
            return;
        }
        match &mut self.seen {
            Some((p, msgs)) if p == port && msgs[0][0] == status => msgs.push(m),
            // A different control or port: start again with this one.
            _ => self.seen = Some((port.to_owned(), vec![m])),
        }
        self.last = Some(now);
    }

    /// The control, once it's been identified.
    pub fn poll(&mut self, now: Instant) -> Option<Learned> {
        if let Some(l) = self.done.take() {
            self.clear();
            return Some(l);
        }
        let settled = self.last.is_some_and(|t| now.duration_since(t) >= SETTLE);
        if !settled {
            return None;
        }
        let (port, msgs) = self.seen.take()?;
        self.last = None;
        let learned = classify(&port, &msgs);
        self.clear();
        learned
    }
}

/// Works out a moved control from its messages.
fn classify(port: &str, msgs: &[[u8; 3]]) -> Option<Learned> {
    let status = msgs.first()?[0];
    let learned = |kind, number| {
        Some(Learned {
            port: port.to_owned(),
            kind,
            status,
            number,
        })
    };
    if status & 0xF0 == 0xE0 {
        return learned(Kind::PitchBend, 0);
    }
    // 14-bit: a low CC (MSB) together with the CC 32 above it (LSB).
    let numbers: Vec<u8> = msgs.iter().map(|m| m[1]).collect();
    if let Some(&msb) = numbers
        .iter()
        .find(|&&n| n < 0x20 && numbers.contains(&(n + 0x20)))
    {
        return learned(Kind::Knob14, msb);
    }
    // The CC that came most often, in case two got mixed up.
    let mut counts = [0usize; 128];
    for &n in &numbers {
        counts[(n & 0x7F) as usize] += 1;
    }
    let number = (0..128).max_by_key(|&n| counts[n]).unwrap_or(0) as u8;
    let values: Vec<u8> = msgs
        .iter()
        .filter(|m| m[1] == number)
        .map(|m| m[2])
        .collect();
    let near = |v: u8, c: i16| (i16::from(v) - c).abs() <= 12;
    let wraps =
        values.iter().all(|&v| near(v, 0) || near(v, 128)) && values.iter().all(|&v| v != 0);
    let around64 = values.iter().all(|&v| near(v, 64)) && values.iter().all(|&v| v != 64);
    // An encoder sends the same few step values over and over; a knob
    // sweeps through different ones.
    let mut distinct = values.clone();
    distinct.sort_unstable();
    distinct.dedup();
    let repeats = values.len() >= 3 && distinct.len() * 2 <= values.len();
    if repeats && wraps {
        learned(Kind::Encoder { offset64: false }, number)
    } else if repeats && around64 {
        learned(Kind::Encoder { offset64: true }, number)
    } else {
        learned(Kind::Knob, number)
    }
}

/// One learned binding: a control on the controller and what it does.
#[derive(Debug, Clone, PartialEq)]
pub struct Binding {
    pub group: String,
    pub key: String,
    pub kind: Kind,
    pub status: u8,
    pub number: u8,
}

/// The LED control that shows a learned button's state, if it has one, and
/// the values it's lit between.
fn led_for(group: &str, key: &str) -> Option<(String, &'static str)> {
    // Lit while the stem plays, as the stem pads are.
    if key == "mute" && group.contains("_Stem") {
        return Control::parse(group, key).map(|_| (key.to_owned(), "<maximum>0.5</maximum>"));
    }
    let led = match key {
        "play" => "play_indicator".to_owned(),
        "cue_default" => "cue_indicator".to_owned(),
        "pfl" | "keylock" | "slip_enabled" | "quantize" | "loop_enabled" => key.to_owned(),
        "reloop_toggle" => "loop_enabled".to_owned(),
        _ => {
            if let Some(n) = key
                .strip_prefix("hotcue_")
                .and_then(|k| k.strip_suffix("_activate"))
            {
                format!("hotcue_{n}_enabled")
            } else if let Some(n) = key
                .strip_prefix("beatloop_")
                .and_then(|k| k.strip_suffix("_toggle").or(k.strip_suffix("_activate")))
            {
                format!("beatloop_{n}_enabled")
            } else if group.starts_with("[Sampler") && key == "cue_gotoandplay" {
                "play_indicator".to_owned()
            } else {
                return None;
            }
        }
    };
    Control::parse(group, &led).map(|_| (led, "<minimum>0.5</minimum>"))
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// A Mixxx mapping file for `port` with these bindings. The mapping is
/// named after the port so it's picked for that controller.
pub fn write_mapping(port: &str, bindings: &[Binding]) -> String {
    let mut controls = String::new();
    let mut outputs = String::new();
    let mut control = |group: &str, key: &str, status: u8, number: u8, option: &str| {
        controls += &format!(
            "      <control>\n        <group>{}</group>\n        <key>{}</key>\n        <status>0x{status:02X}</status>\n        <midino>0x{number:02X}</midino>\n        <options><{option}/></options>\n      </control>\n",
            esc(group),
            esc(key)
        );
    };
    for b in bindings {
        let behavior = Control::parse(&b.group, &b.key).map(|c| c.behavior());
        let ch = b.status & 0x0F;
        match b.kind {
            Kind::Button => {
                control(&b.group, &b.key, 0x90 | ch, b.number, "normal");
                control(&b.group, &b.key, 0x80 | ch, b.number, "normal");
                if let Some((led, lit)) = led_for(&b.group, &b.key) {
                    outputs += &format!(
                        "      <output>\n        <group>{}</group>\n        <key>{}</key>\n        <status>0x{:02X}</status>\n        <midino>0x{:02X}</midino>\n        {lit}\n      </output>\n",
                        esc(&b.group),
                        esc(&led),
                        0x90 | ch,
                        b.number
                    );
                }
            }
            Kind::Knob | Kind::PitchBend => control(&b.group, &b.key, b.status, b.number, "normal"),
            Kind::Knob14 => {
                control(&b.group, &b.key, b.status, b.number, "fourteen-bit-msb");
                control(
                    &b.group,
                    &b.key,
                    b.status,
                    b.number + 0x20,
                    "fourteen-bit-lsb",
                );
            }
            Kind::Encoder { offset64 } => {
                // A relative control driving a knob adds its steps to the
                // knob's position; one driving a stepper (browse, jog)
                // passes the signed step on.
                let stepper = matches!(behavior, Some(Behavior::Encoder));
                let option = match (offset64, stepper) {
                    (false, true) => "selectknob",
                    (false, false) => "diff",
                    (true, true) => "spread64",
                    (true, false) => "rot64",
                };
                control(&b.group, &b.key, b.status, b.number, option);
            }
        }
    }
    let name = esc(port);
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Made with MIDI learn in Interlude. This is a Mixxx mapping file. -->\n<MixxxMIDIPreset schemaVersion=\"1\" mixxxVersion=\"2.4\">\n  <info>\n    <name>{name}</name>\n    <author>{AUTHOR}</author>\n    <description>Learned in Interlude</description>\n  </info>\n  <controller id=\"{name}\">\n    <controls>\n{controls}    </controls>\n    <outputs>\n{outputs}    </outputs>\n  </controller>\n</MixxxMIDIPreset>\n"
    )
}

/// The bindings in a mapping written by [`write_mapping`], to edit it.
pub fn read_bindings(preset: &Preset) -> Vec<Binding> {
    let mut out: Vec<Binding> = vec![];
    let mut inputs: Vec<_> = preset.inputs_with_midi().collect();
    inputs.sort_by_key(|(status, number, _)| (*status, *number));
    for (status, number, input) in inputs {
        let kind = match (status & 0xF0, input.option_name()) {
            (0x80, _) => continue, // the release half of a button
            (0x90, _) => Kind::Button,
            (0xE0, _) => Kind::PitchBend,
            (_, "fourteen-bit-lsb") => continue,
            (_, "fourteen-bit-msb") => Kind::Knob14,
            (_, "selectknob" | "diff") => Kind::Encoder { offset64: false },
            (_, "spread64" | "rot64") => Kind::Encoder { offset64: true },
            _ => Kind::Knob,
        };
        out.push(Binding {
            group: input.group.clone(),
            key: input.key.clone(),
            kind,
            status,
            number,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mixxx::MixxxMidi;
    use crate::{Action, Mapping, State};
    use std::sync::Arc;

    fn detect(msgs: &[[u8; 3]]) -> Option<Learned> {
        let mut d = Detector::new();
        let t = Instant::now();
        for m in msgs {
            d.feed("Pad", m, t);
        }
        d.poll(t).or_else(|| d.poll(t + SETTLE))
    }

    #[test]
    fn detects_each_kind() {
        assert_eq!(detect(&[[0x91, 0x0B, 0x7F]]).unwrap().kind, Kind::Button);
        let knob = detect(&[[0xB0, 0x07, 10], [0xB0, 0x07, 20], [0xB0, 0x07, 35]]).unwrap();
        assert_eq!((knob.kind, knob.number), (Kind::Knob, 0x07));
        let fine = detect(&[[0xB0, 0x13, 10], [0xB0, 0x33, 5], [0xB0, 0x13, 11]]).unwrap();
        assert_eq!((fine.kind, fine.number), (Kind::Knob14, 0x13));
        let enc = detect(&[
            [0xB6, 0x40, 1],
            [0xB6, 0x40, 1],
            [0xB6, 0x40, 2],
            [0xB6, 0x40, 1],
        ])
        .unwrap();
        assert_eq!(enc.kind, Kind::Encoder { offset64: false });
        let enc64 = detect(&[
            [0xB1, 0x21, 65],
            [0xB1, 0x21, 65],
            [0xB1, 0x21, 66],
            [0xB1, 0x21, 65],
        ])
        .unwrap();
        assert_eq!(enc64.kind, Kind::Encoder { offset64: true });
        assert_eq!(detect(&[[0xE0, 0x00, 0x40]]).unwrap().kind, Kind::PitchBend);
    }

    #[test]
    fn waits_for_a_knob_to_settle() {
        let mut d = Detector::new();
        let t = Instant::now();
        d.feed("Pad", &[0xB0, 0x07, 10], t);
        assert!(d.poll(t + Duration::from_millis(100)).is_none());
        assert!(d.poll(t + SETTLE).is_some());
        assert!(d.poll(t + SETTLE * 2).is_none(), "learned once");
    }

    #[test]
    fn learned_mapping_beats_the_built_in_one() {
        let dir = std::env::temp_dir().join(format!("ossdj-learn-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let port = "DDJ-FLX4 MIDI 1";
        let b = Binding {
            group: "[Channel1]".into(),
            key: "play".into(),
            kind: Kind::Button,
            status: 0x90,
            number: 0x0B,
        };
        std::fs::write(dir.join("learned.midi.xml"), write_mapping(port, &[b])).unwrap();
        let c = crate::Catalog::load(std::slice::from_ref(&dir));
        assert_eq!(c.find(port).unwrap().name, port);
        assert_eq!(c.find("DDJ-FLX4 MIDI 2").unwrap().name, "Pioneer DDJ-FLX4");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn ignores_releases_and_clock() {
        assert!(detect(&[[0x80, 0x0B, 0x00], [0x90, 0x0B, 0x00], [0xF8, 0, 0]]).is_none());
    }

    #[test]
    fn a_learned_stem_button_mutes_and_lights_its_stem() {
        use dj_engine::{Command, Stem, ALL_STEMS};
        let drums = 1 << Stem::Drums as u8;
        let b = Binding {
            group: "[Channel2_Stem1]".into(),
            key: "mute".into(),
            kind: Kind::Button,
            status: 0x99,
            number: 0x24,
        };
        let p = Preset::parse(&write_mapping("Pads", std::slice::from_ref(&b))).unwrap();
        assert_eq!(read_bindings(&p), vec![b]);
        let mut m = MixxxMidi::new(Arc::new(p));
        let mut s = State::default();
        for d in &mut s.decks {
            d.loaded = true;
            d.stems = ALL_STEMS;
        }
        let mut press = |s: &State| {
            let mut out = m.handle(&[0x99, 0x24, 0x7F], s);
            out.extend(m.handle(&[0x89, 0x24, 0x00], s));
            (out, m.leds(s))
        };
        let (out, lit) = press(&s);
        assert!(
            matches!(out[..], [Action::Engine(Command::SetStems { deck, mask })]
                if deck.index() == 1 && mask == ALL_STEMS & !drums),
            "{out:?}"
        );
        assert_eq!(lit, vec![vec![0x99, 0x24, 0x7F]], "playing: lit");
        s.decks[1].stems = ALL_STEMS & !drums;
        let (out, lit) = press(&s);
        assert!(
            matches!(
                out[..],
                [Action::Engine(Command::SetStems {
                    mask: ALL_STEMS,
                    ..
                })]
            ),
            "{out:?}"
        );
        assert_eq!(lit, vec![vec![0x99, 0x24, 0x00]], "muted: dark");
    }

    #[test]
    fn written_mappings_load_and_drive_the_deck() {
        let bindings = vec![
            Binding {
                group: "[Channel1]".into(),
                key: "play".into(),
                kind: Kind::Button,
                status: 0x90,
                number: 0x0B,
            },
            Binding {
                group: "[Channel2]".into(),
                key: "volume".into(),
                kind: Kind::Knob14,
                status: 0xB1,
                number: 0x13,
            },
            Binding {
                group: "[Library]".into(),
                key: "MoveVertical".into(),
                kind: Kind::Encoder { offset64: false },
                status: 0xB6,
                number: 0x40,
            },
        ];
        let xml = write_mapping("My <Pad> MIDI 1", &bindings);
        let p = Preset::parse(&xml).unwrap();
        assert!(p.matches("My <Pad> MIDI 1"));
        assert!(
            !p.matches("Other <Pad> MIDI 1"),
            "learned for one port only"
        );
        assert_eq!(read_bindings(&p), bindings);

        let mut m = MixxxMidi::new(Arc::new(p));
        let mut s = State::default();
        s.decks[0].loaded = true;
        assert!(matches!(
            m.handle(&[0x90, 0x0B, 0x7F], &s)[..],
            [Action::Engine(dj_engine::Command::Play { .. })]
        ));
        assert!(m.handle(&[0xB1, 0x13, 0x7F], &s).is_empty());
        assert!(matches!(
            m.handle(&[0xB1, 0x33, 0x7F], &s)[..],
            [Action::Engine(dj_engine::Command::SetFader { .. })]
        ));
        assert!(matches!(
            m.handle(&[0xB6, 0x40, 0x7F], &s)[..],
            [Action::Browse(-1)]
        ));
        // The play button got an LED.
        s.decks[0].playing = true;
        assert!(m.leds(&s).contains(&vec![0x90, 0x0B, 0x7F]));
    }
}
