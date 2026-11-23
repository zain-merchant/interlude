//! Hooks a hardware DJ controller up to the engine and the UI.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use dj_controller::learn::{Binding, Kind, Learned};
use dj_controller::midi::{ControllerService, Host};
use dj_controller::{Action, PadMode, State};
use dj_engine::{Command, EngineHandle, SharedState, NUM_DECKS};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

struct AppHost {
    engine: Arc<Mutex<EngineHandle>>,
    shared: Arc<SharedState>,
    app: AppHandle,
}

/// Library actions from the controller, sent to the UI as `controller`
/// events.
#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
enum UiEvent {
    /// Move the library selection by `delta` rows.
    Browse { delta: i32 },
    /// Load the selected library track into `deck`.
    Load { deck: usize },
    /// Load the selected library track into sampler slot `slot`.
    LoadSample { slot: usize },
    /// A pad mode button was pressed on `deck`.
    PadMode { deck: usize, mode: &'static str },
    /// A stem pad was pressed on a deck whose stems can't be used yet. The
    /// press was for `mask`.
    StemsUnavailable { deck: usize, mask: u8 },
    /// The deck's hardware tempo fader waits at `rate` to pick up the
    /// tempo, or (`null`) controls it again.
    TempoPickup { deck: usize, rate: Option<f64> },
}

impl Host for AppHost {
    fn state(&self) -> State {
        State {
            decks: std::array::from_fn::<_, NUM_DECKS, _>(|i| self.shared.deck(i)),
            mixer: self.shared.mixer(),
            sampler: self.shared.sampler(),
        }
    }

    fn act(&self, action: Action) {
        match action {
            // Without stems the deck plays the original whatever the mask
            // says, so a stem pad would light up and change nothing. Where
            // they're only a moment away it lights at once, and is heard
            // when they're there.
            Action::Engine(Command::SetStems { deck, mask }) => {
                let d = deck.index();
                let stems = self.app.try_state::<crate::stems::Stems>();
                let Some(stems) = stems.filter(|s| s.usable(d)) else {
                    let _ = self
                        .app
                        .emit("controller", UiEvent::StemsUnavailable { deck: d, mask });
                    return;
                };
                if mask != dj_engine::ALL_STEMS {
                    stems.used(d);
                }
                if let Ok(mut e) = self.engine.lock() {
                    let _ = e.send(Command::SetStems { deck, mask });
                }
            }
            Action::Engine(cmd) => {
                if let Ok(mut e) = self.engine.lock() {
                    let _ = e.send(cmd);
                }
            }
            Action::Browse(delta) => {
                let _ = self.app.emit("controller", UiEvent::Browse { delta });
            }
            Action::LoadSelected(deck) => {
                let _ = self
                    .app
                    .emit("controller", UiEvent::Load { deck: deck.index() });
            }
            Action::LoadSample(slot) => {
                let _ = self.app.emit("controller", UiEvent::LoadSample { slot });
            }
            Action::TempoPickup { deck, fader } => {
                let _ = self.app.emit(
                    "controller",
                    UiEvent::TempoPickup {
                        deck: deck.index(),
                        rate: fader,
                    },
                );
            }
            Action::PadMode { deck, mode } => {
                // Choosing the stems pads is the earliest a controller says
                // they're wanted. The screen hears of it next and opens the
                // Stems tab, but there's no need to wait for that.
                if mode == PadMode::Keyboard {
                    if let Some(stems) = self.app.try_state::<crate::stems::Stems>() {
                        stems.used(deck.index());
                    }
                }
                let mode = match mode {
                    PadMode::HotCue => "hotCue",
                    PadMode::BeatLoop => "beatLoop",
                    PadMode::BeatJump => "beatJump",
                    PadMode::Sampler => "sampler",
                    PadMode::PadFx1 => "padFx1",
                    PadMode::PadFx2 => "padFx2",
                    PadMode::Keyboard => "keyboard",
                    PadMode::KeyShift => "keyShift",
                };
                let _ = self.app.emit(
                    "controller",
                    UiEvent::PadMode {
                        deck: deck.index(),
                        mode,
                    },
                );
            }
        }
    }
}

pub fn start(app: &AppHandle, engine: Arc<Mutex<EngineHandle>>, shared: Arc<SharedState>) {
    let host = Arc::new(AppHost {
        engine,
        shared,
        app: app.clone(),
    });
    // Mixxx mapping files dropped in here, and mappings made with MIDI
    // learn, come first; then the Mixxx mappings the app ships with.
    let dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("controllers"));
    if let Some(d) = &dir {
        let _ = std::fs::create_dir_all(d);
    }
    app.manage(MappingDir(dir.clone()));
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|d| d.join("controllers"))
        .filter(|d| d.is_dir())
        .or_else(dj_controller::Catalog::source_mappings_dir);
    let mut dirs: Vec<PathBuf> = dir.into_iter().collect();
    dirs.extend(dj_controller::Catalog::default_dirs_with(bundled));
    app.manage(MappingDirs(dirs.clone()));
    app.manage(ControllerService::start_with(host, dirs));
}

/// Where the app keeps its own controller mappings.
pub struct MappingDir(Option<PathBuf>);

/// Every folder mappings are loaded from, in order.
pub struct MappingDirs(Vec<PathBuf>);

/// The MIDI controllers there's a mapping for, by name, for picking your
/// model when setting one up step by step. Read once, then remembered.
#[tauri::command]
pub async fn controller_models(dirs: tauri::State<'_, MappingDirs>) -> Result<Vec<String>, ()> {
    static MODELS: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    Ok(MODELS
        .get_or_init(|| {
            let catalog = dj_controller::Catalog::load(&dirs.0);
            let mut names: Vec<String> = catalog
                .entries()
                .iter()
                .filter(|e| e.preset().is_none_or(|p| !p.is_hid() && !p.is_exact()))
                .map(|e| e.name.trim().to_owned())
                .filter(|n| !n.is_empty())
                .collect();
            names.sort_by_key(|n| n.to_lowercase());
            names.dedup();
            names
        })
        .clone())
}

/// Pauses every connected controller while one is set up step by step, so
/// pressing PLAY to teach it doesn't start a deck.
#[tauri::command]
pub fn controllers_pause(service: tauri::State<'_, ControllerService>, paused: bool) {
    service.set_paused(paused);
}

/// The connected controllers' names, or null if there are none.
#[tauri::command]
pub fn controller_name(service: tauri::State<'_, ControllerService>) -> Option<String> {
    let names: Vec<String> = service.connected().into_iter().map(|c| c.port).collect();
    (!names.is_empty()).then(|| names.join(", "))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectedInfo {
    port: String,
    mapping: String,
    /// Made with MIDI learn here.
    learned: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllersInfo {
    connected: Vec<ConnectedInfo>,
    /// Every MIDI input, mapped or not.
    ports: Vec<String>,
    /// Ports with a learned mapping saved.
    learned: Vec<String>,
}

/// The file a learned mapping for `port` is saved in.
fn learned_file(dir: &Path, port: &str) -> PathBuf {
    let safe: String = port
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " -_".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    dir.join(format!("{} (learned).midi.xml", safe.trim()))
}

fn is_learned(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.ends_with(" (learned).midi.xml"))
}

/// Controllers for the Controllers settings page.
#[tauri::command]
pub fn controllers(
    service: tauri::State<'_, ControllerService>,
    dir: tauri::State<'_, MappingDir>,
) -> ControllersInfo {
    let ports = dj_controller::midi::input_port_names();
    let learned = match &dir.0 {
        Some(d) => ports
            .iter()
            .filter(|p| learned_file(d, p).is_file())
            .cloned()
            .collect(),
        None => vec![],
    };
    ControllersInfo {
        connected: service
            .connected()
            .into_iter()
            .map(|c| ConnectedInfo {
                learned: c.file.as_deref().is_some_and(is_learned),
                port: c.port,
                mapping: c.mapping,
            })
            .collect(),
        ports,
        learned,
    }
}

/// One learned binding, as the UI sees it.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BindingInfo {
    group: String,
    key: String,
    /// "button", "knob", "knob14", "encoder", "encoder64" or "pitchbend".
    kind: String,
    status: u8,
    number: u8,
    /// e.g. "note 0x0B, channel 1".
    #[serde(default)]
    description: String,
}

fn kind_name(k: Kind) -> &'static str {
    match k {
        Kind::Button => "button",
        Kind::Knob => "knob",
        Kind::Knob14 => "knob14",
        Kind::Encoder { offset64: false } => "encoder",
        Kind::Encoder { offset64: true } => "encoder64",
        Kind::PitchBend => "pitchbend",
    }
}

fn kind_from(name: &str) -> Option<Kind> {
    Some(match name {
        "button" => Kind::Button,
        "knob" => Kind::Knob,
        "knob14" => Kind::Knob14,
        "encoder" => Kind::Encoder { offset64: false },
        "encoder64" => Kind::Encoder { offset64: true },
        "pitchbend" => Kind::PitchBend,
        _ => return None,
    })
}

fn describe(kind: Kind, status: u8, number: u8) -> String {
    Learned {
        port: String::new(),
        kind,
        status,
        number,
    }
    .describe()
}

/// Starts listening for MIDI learn on every input.
#[tauri::command]
pub fn midi_learn_start(service: tauri::State<'_, ControllerService>) {
    service.learn_start();
}

/// The control moved since learning started, once it's known.
#[tauri::command]
pub fn midi_learn_poll(
    service: tauri::State<'_, ControllerService>,
) -> Option<(String, BindingInfo)> {
    let l = service.learn_poll()?;
    Some((
        l.port.clone(),
        BindingInfo {
            group: String::new(),
            key: String::new(),
            kind: kind_name(l.kind).into(),
            status: l.status,
            number: l.number,
            description: l.describe(),
        },
    ))
}

#[tauri::command]
pub fn midi_learn_stop(service: tauri::State<'_, ControllerService>) {
    service.learn_stop();
}

/// The learned mapping saved for `port`, if any.
#[tauri::command]
pub fn learned_mapping(dir: tauri::State<'_, MappingDir>, port: String) -> Vec<BindingInfo> {
    let Some(d) = &dir.0 else { return vec![] };
    let Ok(preset) = dj_controller::mixxx::Preset::load(&learned_file(d, &port)) else {
        return vec![];
    };
    dj_controller::learn::read_bindings(&preset)
        .into_iter()
        .map(|b| BindingInfo {
            description: describe(b.kind, b.status, b.number),
            kind: kind_name(b.kind).into(),
            group: b.group,
            key: b.key,
            status: b.status,
            number: b.number,
        })
        .collect()
}

/// Saves a learned mapping for `port` and reconnects so it takes effect.
/// No bindings deletes it. Returns the mapping file, for sharing.
#[tauri::command]
pub fn save_learned_mapping(
    service: tauri::State<'_, ControllerService>,
    dir: tauri::State<'_, MappingDir>,
    port: String,
    bindings: Vec<BindingInfo>,
) -> Result<String, String> {
    let d = dir.0.as_ref().ok_or("no app data folder")?;
    let file = learned_file(d, &port);
    if bindings.is_empty() {
        if file.exists() {
            std::fs::remove_file(&file).map_err(|e| e.to_string())?;
        }
    } else {
        let bindings: Vec<Binding> = bindings
            .into_iter()
            .filter_map(|b| {
                Some(Binding {
                    kind: kind_from(&b.kind)?,
                    group: b.group,
                    key: b.key,
                    status: b.status,
                    number: b.number,
                })
            })
            .collect();
        let xml = dj_controller::learn::write_mapping(&port, &bindings);
        std::fs::write(&file, xml).map_err(|e| format!("{}: {e}", file.display()))?;
    }
    service.reload();
    Ok(file.display().to_string())
}
