//! Hardware DJ controller support.
//!
//! A [`Mapping`] turns raw MIDI from one controller model into engine
//! [`Command`]s and app [`Action`]s, and computes the LED messages to send
//! back. Mappings are plain state machines with no I/O, so they're tested
//! without hardware. [`midi::ControllerService`] connects them to real
//! devices, including hot-plugging.
//!
//! Mappings come from two places: hand-written ones built in (the
//! DDJ-FLX4), and Mixxx mapping files ([`mixxx`]) found on disk. A
//! [`Catalog`] holds both; built-in mappings win for their own devices.

pub mod controls;
pub mod flx4;
#[cfg(feature = "hid")]
pub mod hid;
pub mod learn;
#[cfg(feature = "midi")]
pub mod midi;
pub mod mixxx;
pub mod script;

use std::path::{Path, PathBuf};
use std::sync::Arc;

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
    /// Called about every 30 ms: what the mapping does on its own, such as
    /// a script's timers and connection callbacks.
    fn poll(&mut self, _state: &State) -> Vec<Action> {
        vec![]
    }
    /// The controller is being let go: the mapping's last chance to send
    /// MIDI (through [`Self::leds`]) before it's dropped.
    fn shutdown(&mut self, _state: &State) {}
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

/// The mappings built into this build.
pub fn mappings() -> Vec<Box<dyn Mapping>> {
    vec![Box::new(flx4::Flx4::new())]
}

/// Where a mapping came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    BuiltIn,
    /// A Mixxx mapping file.
    Mixxx(PathBuf),
}

enum Kind {
    Flx4,
    Mixxx(Arc<mixxx::Preset>),
}

/// One mapping a [`Catalog`] can create.
pub struct Entry {
    pub name: String,
    pub source: Source,
    kind: Kind,
}

impl Entry {
    pub fn matches(&self, port_name: &str) -> bool {
        match &self.kind {
            Kind::Flx4 => flx4::Flx4::new().matches(port_name),
            Kind::Mixxx(p) => p.matches(port_name),
        }
    }

    /// A fresh instance of the mapping, for one connection.
    pub fn create(&self) -> Box<dyn Mapping> {
        match &self.kind {
            Kind::Flx4 => Box::new(flx4::Flx4::new()),
            Kind::Mixxx(p) => Box::new(mixxx::MixxxMidi::new(p.clone())),
        }
    }

    /// A fresh instance of a Mixxx mapping, which a HID connection drives
    /// directly.
    pub fn create_mixxx(&self) -> Option<mixxx::MixxxMidi> {
        match &self.kind {
            Kind::Mixxx(p) => Some(mixxx::MixxxMidi::new(p.clone())),
            Kind::Flx4 => None,
        }
    }

    /// The Mixxx mapping file's contents, for Mixxx mappings.
    pub fn preset(&self) -> Option<&mixxx::Preset> {
        match &self.kind {
            Kind::Flx4 => None,
            Kind::Mixxx(p) => Some(p),
        }
    }
}

/// Every mapping available: the built-in ones first, then Mixxx mapping
/// files in the order their folders were given.
pub struct Catalog {
    entries: Vec<Entry>,
}

impl Catalog {
    /// Only the built-in mappings.
    pub fn built_in() -> Self {
        Self {
            entries: vec![Entry {
                name: "Pioneer DDJ-FLX4".into(),
                source: Source::BuiltIn,
                kind: Kind::Flx4,
            }],
        }
    }

    /// The built-in mappings plus every `*.midi.xml` and `*.hid.xml` in
    /// `dirs`. A file
    /// name seen in an earlier folder hides the same name in later ones,
    /// so a user's copy of a Mixxx mapping wins over Mixxx's own. Files
    /// that fail to parse are reported to stderr and skipped.
    pub fn load(dirs: &[PathBuf]) -> Self {
        let mut c = Self::built_in();
        let mut seen = std::collections::HashSet::new();
        for dir in dirs {
            for path in mapping_files(dir) {
                let Some(file) = path.file_name().map(|f| f.to_owned()) else {
                    continue;
                };
                if !seen.insert(file) {
                    continue;
                }
                match mixxx::Preset::load(&path) {
                    Ok(mut p) => c.entries.push(Entry {
                        name: p.name.clone(),
                        source: Source::Mixxx(path),
                        kind: Kind::Mixxx(Arc::new({
                            // Shared script libraries live with Mixxx's
                            // mappings, so look in every folder for them.
                            p.script_dirs = dirs.to_vec();
                            p
                        })),
                    }),
                    Err(e) => eprintln!("skipping controller mapping {e}"),
                }
            }
        }
        c
    }

    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    /// The mapping for a MIDI port with this name: one learned for exactly
    /// this port, then a built-in one, otherwise the Mixxx mapping whose name matches the port
    /// most closely (the first such file on a tie).
    pub fn find(&self, port_name: &str) -> Option<&Entry> {
        // A mapping learned for this exact port is what the user asked for,
        // so it comes ahead of even the built-in one.
        if let Some(e) = self.entries.iter().find(|e| {
            matches!(&e.kind, Kind::Mixxx(p) if p.is_exact() && p.match_len(port_name).is_some())
        }) {
            return Some(e);
        }
        if let Some(e) = self
            .entries
            .iter()
            .find(|e| matches!(e.kind, Kind::Flx4) && e.matches(port_name))
        {
            return Some(e);
        }
        let mut best: Option<(&Entry, usize)> = None;
        for e in &self.entries {
            if let Kind::Mixxx(p) = &e.kind {
                if let Some(n) = p.match_len(port_name) {
                    if best.is_none_or(|(_, b)| n > b) {
                        best = Some((e, n));
                    }
                }
            }
        }
        best.map(|(e, _)| e)
    }

    /// The Mixxx HID mapping for this USB device, if any: the first that
    /// names it. Joysticks and gamepads (Mixxx has mappings for a Wii
    /// remote and a PS3 pad) are left to the games they're for.
    pub fn find_hid(&self, device: &mixxx::HidDevice) -> Option<&Entry> {
        const GENERIC_DESKTOP: u16 = 0x01;
        if device.usage_page == GENERIC_DESKTOP && matches!(device.usage, 0x04 | 0x05) {
            return None;
        }
        self.entries.iter().find(|e| {
            matches!(&e.kind, Kind::Mixxx(p)
                if p.matches_hid(device) && p.scripts.iter().any(|s| s.filename.ends_with(".js")))
        })
    }

    /// The Mixxx mappings that come with oss-dj, in this source tree. A
    /// built app ships its own copy and passes it to
    /// [`Self::default_dirs_with`] instead.
    pub fn source_mappings_dir() -> Option<PathBuf> {
        let d = Path::new(env!("CARGO_MANIFEST_DIR")).join("mappings");
        d.is_dir().then_some(d)
    }

    /// Folders searched for Mixxx mappings, besides any the app adds, with
    /// the mappings in this source tree as the bundled ones.
    pub fn default_dirs() -> Vec<PathBuf> {
        Self::default_dirs_with(Self::source_mappings_dir())
    }

    /// Folders searched for Mixxx mappings, in order: `$OSS_DJ_MAPPINGS`
    /// (a path list), Mixxx's user folder (mappings someone made or
    /// changed in Mixxx), the `bundled` mappings that come with oss-dj,
    /// then an installed Mixxx's own. Mixxx itself isn't needed: the
    /// bundled mappings cover every controller Mixxx supports.
    pub fn default_dirs_with(bundled: Option<PathBuf>) -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = std::env::var_os("OSS_DJ_MAPPINGS")
            .map(|v| std::env::split_paths(&v).collect())
            .unwrap_or_default();
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let mut system: Vec<PathBuf> = vec![];
        if cfg!(target_os = "macos") {
            if let Some(h) = &home {
                dirs.push(h.join("Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/controllers"));
                dirs.push(h.join("Library/Application Support/Mixxx/controllers"));
            }
            system.push("/Applications/Mixxx.app/Contents/Resources/controllers".into());
        } else if cfg!(windows) {
            if let Some(l) = std::env::var_os("LOCALAPPDATA") {
                dirs.push(PathBuf::from(l).join("Mixxx/controllers"));
            }
            if let Some(p) = std::env::var_os("ProgramFiles") {
                system.push(PathBuf::from(p).join("Mixxx/controllers"));
            }
        } else {
            if let Some(h) = &home {
                dirs.push(h.join(".mixxx/controllers"));
                dirs.push(h.join(".local/share/mixxx/controllers"));
            }
            system.push("/usr/share/mixxx/controllers".into());
            system.push("/usr/local/share/mixxx/controllers".into());
        }
        dirs.extend(bundled);
        dirs.extend(system);
        dirs
    }
}

/// Mixxx mapping files in `dir`, sorted by name. A missing folder has none.
fn mapping_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut files: Vec<PathBuf> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
                let n = n.to_ascii_lowercase();
                n.ends_with(".midi.xml") || n.ends_with(".hid.xml")
            })
        })
        .collect();
    files.sort();
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preset(name: &str) -> String {
        format!(
            r#"<MixxxMIDIPreset><info><name>{name}</name></info><controller id="x"><controls/></controller></MixxxMIDIPreset>"#
        )
    }

    #[test]
    fn hid_mappings_match_their_device_only() {
        let dir = std::env::temp_dir().join(format!("ossdj-hid-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let xml = |name: &str, product: &str, script: &str| {
            format!(
                r#"<MixxxControllerPreset><info><name>{name}</name><devices>{product}</devices></info>
                <controller id="x"><scriptfiles><file filename="{script}" functionprefix="X"/></scriptfiles></controller>
                </MixxxControllerPreset>"#
            )
        };
        let s3 = r#"<product protocol="hid" vendor_id="0x17cc" product_id="0x1900" usage_page="0xff01" usage="0x1" interface_number="0x3"/>"#;
        let pad = r#"<product protocol="hid" vendor_id="0x54c" product_id="0x268" usage_page="0x1" usage="0x4"/>"#;
        std::fs::write(dir.join("S3.hid.xml"), xml("Kontrol S3", s3, "s3.js")).unwrap();
        std::fs::write(dir.join("Pad.hid.xml"), xml("Pad", pad, "pad.js")).unwrap();
        std::fs::write(dir.join("Plain.hid.xml"), xml("Plain", "", "plain.js")).unwrap();
        let c = Catalog::load(std::slice::from_ref(&dir));
        let s3_dev = mixxx::HidDevice {
            vendor_id: 0x17cc,
            product_id: 0x1900,
            usage_page: 0xff01,
            usage: 1,
            interface_number: 3,
        };
        assert_eq!(c.find_hid(&s3_dev).unwrap().name, "Kontrol S3");
        // macOS and Windows often don't say which interface.
        let unknown_if = mixxx::HidDevice {
            interface_number: -1,
            ..s3_dev
        };
        assert!(c.find_hid(&unknown_if).is_some());
        assert!(c
            .find_hid(&mixxx::HidDevice {
                interface_number: 0,
                ..s3_dev
            })
            .is_none());
        let pad_dev = mixxx::HidDevice {
            vendor_id: 0x54c,
            product_id: 0x268,
            usage_page: 1,
            usage: 4,
            interface_number: -1,
        };
        assert!(c.find_hid(&pad_dev).is_none(), "gamepads are left alone");
        // HID mappings never take a MIDI port, even one named like them.
        assert!(c.find("Kontrol S3 MIDI").is_none());
        assert!(c.find("Plain MIDI 1").is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn catalog_prefers_built_in_then_the_closest_name() {
        let dir = std::env::temp_dir().join(format!("oss-dj-catalog-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for (file, name) in [
            ("a.midi.xml", "Numark Mixtrack"),
            ("b.midi.xml", "Numark Mixtrack Platinum FX"),
            ("c.midi.xml", "Pioneer DDJ-FLX4"),
            ("broken.midi.xml", "<not xml"),
            ("ignored.xml", "Numark Other"),
        ] {
            let body = if name.starts_with('<') {
                name.to_owned()
            } else {
                preset(name)
            };
            std::fs::write(dir.join(file), body).unwrap();
        }
        let c = Catalog::load(std::slice::from_ref(&dir));
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(c.entries().len(), 4, "built-in + 3 good mapping files");
        assert_eq!(c.find("DDJ-FLX4").unwrap().source, Source::BuiltIn);
        assert_eq!(
            c.find("Mixtrack Platinum FX MIDI 1").unwrap().name,
            "Numark Mixtrack Platinum FX"
        );
        assert_eq!(c.find("Mixtrack MIDI 1").unwrap().name, "Numark Mixtrack");
        assert!(c.find("IAC Driver Bus 1").is_none());
    }

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
