//! Hooks a hardware DJ controller up to the engine and the UI.

use std::sync::{Arc, Mutex};

use dj_controller::midi::{ControllerService, Host};
use dj_controller::{Action, PadMode, State};
use dj_engine::{Command, EngineHandle, SharedState, NUM_DECKS};
use serde::Serialize;
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
    /// A stem pad was pressed on a deck whose stems can't be used yet.
    StemsUnavailable { deck: usize },
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
            // says, so a stem pad would light up and change nothing.
            Action::Engine(Command::SetStems { deck, .. })
                if !self
                    .app
                    .try_state::<crate::stems::Stems>()
                    .is_some_and(|s| s.usable(deck.index())) =>
            {
                let _ = self.app.emit(
                    "controller",
                    UiEvent::StemsUnavailable { deck: deck.index() },
                );
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
            Action::PadMode { deck, mode } => {
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
    // Mixxx mapping files dropped in here are picked up at launch, ahead
    // of any from a Mixxx install.
    let dirs = app
        .path()
        .app_data_dir()
        .map(|d| d.join("controllers"))
        .into_iter()
        .inspect(|d| {
            let _ = std::fs::create_dir_all(d);
        })
        .collect();
    app.manage(ControllerService::start_with(host, dirs));
}

/// The connected controllers' names, or null if there are none.
#[tauri::command]
pub fn controller_name(service: tauri::State<'_, ControllerService>) -> Option<String> {
    let names = service.connected();
    (!names.is_empty()).then(|| names.join(", "))
}
