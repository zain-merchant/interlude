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
#[cfg(feature = "midi")]
pub mod midi;
pub mod mixxx;

use std::path::{Path, PathBuf};
use std::sync::Arc;

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

    /// The built-in mappings plus every `*.midi.xml` in `dirs`. A file
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
                    Ok(p) => c.entries.push(Entry {
                        name: p.name.clone(),
                        source: Source::Mixxx(path),
                        kind: Kind::Mixxx(Arc::new(p)),
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

    /// The mapping for a MIDI port with this name: a built-in one if any
    /// matches, otherwise the Mixxx mapping whose name matches the port
    /// most closely (the first such file on a tie).
    pub fn find(&self, port_name: &str) -> Option<&Entry> {
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

    /// Folders searched for Mixxx mappings, besides any the app adds:
    /// `$OSS_DJ_MAPPINGS` (a path list), then Mixxx's user folder, then
    /// Mixxx's installed mappings, so a Mixxx install's mappings work
    /// without copying anything.
    pub fn default_dirs() -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = std::env::var_os("OSS_DJ_MAPPINGS")
            .map(|v| std::env::split_paths(&v).collect())
            .unwrap_or_default();
        let home = std::env::var_os("HOME").map(PathBuf::from);
        if cfg!(target_os = "macos") {
            if let Some(h) = &home {
                dirs.push(h.join("Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/controllers"));
                dirs.push(h.join("Library/Application Support/Mixxx/controllers"));
            }
            dirs.push("/Applications/Mixxx.app/Contents/Resources/controllers".into());
        } else if cfg!(windows) {
            if let Some(l) = std::env::var_os("LOCALAPPDATA") {
                dirs.push(PathBuf::from(l).join("Mixxx/controllers"));
            }
            if let Some(p) = std::env::var_os("ProgramFiles") {
                dirs.push(PathBuf::from(p).join("Mixxx/controllers"));
            }
        } else {
            if let Some(h) = &home {
                dirs.push(h.join(".mixxx/controllers"));
                dirs.push(h.join(".local/share/mixxx/controllers"));
            }
            dirs.push("/usr/share/mixxx/controllers".into());
            dirs.push("/usr/local/share/mixxx/controllers".into());
        }
        dirs
    }
}

/// `*.midi.xml` files in `dir`, sorted by name. A missing folder has none.
fn mapping_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut files: Vec<PathBuf> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.to_ascii_lowercase().ends_with(".midi.xml"))
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
}
