//! Tauri shell: owns the audio engine and exposes it to the UI.
//!
//! The UI never touches audio. It sends small commands (`control`), polls
//! state at screen refresh rate (`state`), and fetches waveform bytes once
//! per loaded track (`waveform`).
//!
//! A supported MIDI controller is picked up automatically when plugged in.
//! Its mixer and transport controls go straight to the engine; its library
//! browse knob and load buttons arrive in the UI as `controller` events.

mod controller;
mod library;

use std::sync::{Arc, Mutex};

use dj_engine::{
    Beatgrid, Command, DeckId, DeckSnapshot, EngineHandle, EqBand, MixerSnapshot, Track, Waveform,
};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::State;

/// Keeps whichever output is running alive for the app's lifetime.
#[allow(dead_code)]
enum Output {
    Device(dj_engine::output::AudioOutput),
    Null(dj_engine::NullOutput),
}

struct AppState {
    engine: Arc<Mutex<EngineHandle>>,
    tracks: Mutex<[Option<Arc<Track>>; dj_engine::NUM_DECKS]>,
    output_name: String,
    _output: Output,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackInfo {
    title: String,
    path: String,
    duration: f64,
    sample_rate: u32,
    bins_per_sec: f64,
    bin_count: usize,
    beatgrid: Option<Beatgrid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineState {
    decks: [DeckSnapshot; dj_engine::NUM_DECKS],
    mixer: MixerSnapshot,
    deck_peaks: [f32; dj_engine::NUM_DECKS],
    master_peak: [f32; 2],
}

/// Commands the UI can send. Mirrors `dj_engine::Command` minus track loading.
#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Control {
    Play {
        deck: usize,
    },
    Pause {
        deck: usize,
    },
    TogglePlay {
        deck: usize,
    },
    CuePress {
        deck: usize,
    },
    CueRelease {
        deck: usize,
    },
    HotCuePress {
        deck: usize,
        index: usize,
    },
    HotCueRelease {
        deck: usize,
        index: usize,
    },
    HotCueClear {
        deck: usize,
        index: usize,
    },
    LoopToggle {
        deck: usize,
    },
    BeatLoop {
        deck: usize,
        beats: f64,
    },
    LoopScale {
        deck: usize,
        factor: f64,
    },
    ReloopExit {
        deck: usize,
    },
    BeatJump {
        deck: usize,
        beats: f64,
    },
    Seek {
        deck: usize,
        seconds: f64,
    },
    SetRate {
        deck: usize,
        rate: f64,
    },
    SetBend {
        deck: usize,
        bend: f64,
    },
    ScratchStart {
        deck: usize,
    },
    ScratchTo {
        deck: usize,
        seconds: f64,
        /// Seconds since the previous scratchTo by the UI's clock.
        #[serde(default, rename = "sinceLast")]
        since_last: Option<f64>,
    },
    ScratchEnd {
        deck: usize,
    },
    Sync {
        deck: usize,
    },
    SetGain {
        deck: usize,
        db: f32,
    },
    SetEq {
        deck: usize,
        band: usize,
        db: f32,
    },
    SetFader {
        deck: usize,
        value: f32,
    },
    SetPfl {
        deck: usize,
        on: bool,
    },
    SetCrossfader {
        value: f32,
    },
    SetCueMix {
        value: f32,
    },
    SetMasterGain {
        db: f32,
    },
}

fn deck_id(i: usize) -> Result<DeckId, String> {
    DeckId::from_index(i).ok_or_else(|| format!("no deck {i}"))
}

impl Control {
    fn into_command(self) -> Result<Command, String> {
        use Control as C;
        Ok(match self {
            C::Play { deck } => Command::Play {
                deck: deck_id(deck)?,
            },
            C::Pause { deck } => Command::Pause {
                deck: deck_id(deck)?,
            },
            C::TogglePlay { deck } => Command::TogglePlay {
                deck: deck_id(deck)?,
            },
            C::CuePress { deck } => Command::CuePress {
                deck: deck_id(deck)?,
            },
            C::CueRelease { deck } => Command::CueRelease {
                deck: deck_id(deck)?,
            },
            C::HotCuePress { deck, index } => Command::HotCuePress {
                deck: deck_id(deck)?,
                index,
            },
            C::HotCueRelease { deck, index } => Command::HotCueRelease {
                deck: deck_id(deck)?,
                index,
            },
            C::HotCueClear { deck, index } => Command::HotCueClear {
                deck: deck_id(deck)?,
                index,
            },
            C::LoopToggle { deck } => Command::LoopToggle {
                deck: deck_id(deck)?,
            },
            C::BeatLoop { deck, beats } => Command::BeatLoop {
                deck: deck_id(deck)?,
                beats,
            },
            C::LoopScale { deck, factor } => Command::LoopScale {
                deck: deck_id(deck)?,
                factor,
            },
            C::ReloopExit { deck } => Command::ReloopExit {
                deck: deck_id(deck)?,
            },
            C::BeatJump { deck, beats } => Command::BeatJump {
                deck: deck_id(deck)?,
                beats,
            },
            C::Seek { deck, seconds } => Command::Seek {
                deck: deck_id(deck)?,
                seconds,
            },
            C::SetRate { deck, rate } => Command::SetRate {
                deck: deck_id(deck)?,
                rate,
            },
            C::SetBend { deck, bend } => Command::SetBend {
                deck: deck_id(deck)?,
                bend,
            },
            C::ScratchStart { deck } => Command::ScratchStart {
                deck: deck_id(deck)?,
            },
            C::ScratchTo {
                deck,
                seconds,
                since_last,
            } => Command::ScratchTo {
                deck: deck_id(deck)?,
                seconds,
                since_last,
            },
            C::ScratchEnd { deck } => Command::ScratchEnd {
                deck: deck_id(deck)?,
            },
            C::Sync { deck } => Command::Sync {
                deck: deck_id(deck)?,
            },
            C::SetGain { deck, db } => Command::SetGain {
                deck: deck_id(deck)?,
                db,
            },
            C::SetEq { deck, band, db } => {
                let band = match band {
                    0 => EqBand::Low,
                    1 => EqBand::Mid,
                    2 => EqBand::High,
                    _ => return Err(format!("no EQ band {band}")),
                };
                Command::SetEq {
                    deck: deck_id(deck)?,
                    band,
                    db,
                }
            }
            C::SetFader { deck, value } => Command::SetFader {
                deck: deck_id(deck)?,
                value,
            },
            C::SetPfl { deck, on } => Command::SetPfl {
                deck: deck_id(deck)?,
                on,
            },
            C::SetCrossfader { value } => Command::SetCrossfader { value },
            C::SetCueMix { value } => Command::SetCueMix { value },
            C::SetMasterGain { db } => Command::SetMasterGain { db },
        })
    }
}

fn send(state: &AppState, cmd: Command) -> Result<(), String> {
    state
        .engine
        .lock()
        .map_err(|_| "engine lock poisoned")?
        .send(cmd)
        .map_err(|_| "audio engine is not responding".to_string())
}

#[tauri::command]
fn control(state: State<'_, AppState>, cmd: Control) -> Result<(), String> {
    send(&state, cmd.into_command()?)
}

#[tauri::command]
fn state(state: State<'_, AppState>) -> EngineState {
    let engine = state.engine.lock().expect("engine lock");
    let (deck_peaks, master_peak) = engine.take_peaks();
    let shared = engine.shared();
    EngineState {
        decks: std::array::from_fn(|i| shared.deck(i)),
        mixer: shared.mixer(),
        deck_peaks,
        master_peak,
    }
}

#[tauri::command]
fn output_name(state: State<'_, AppState>) -> String {
    state.output_name.clone()
}

/// Decodes a file on a worker thread (keeping the UI responsive), then loads
/// it into the deck.
#[tauri::command]
async fn load_track(
    state: State<'_, AppState>,
    deck: usize,
    path: String,
) -> Result<TrackInfo, String> {
    let id = deck_id(deck)?;
    let track = tauri::async_runtime::spawn_blocking(move || Track::load(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let track = Arc::new(track);
    let info = TrackInfo {
        title: track.title(),
        path: track
            .path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        duration: track.duration_secs(),
        sample_rate: track.sample_rate,
        bins_per_sec: track.waveform.bins_per_sec,
        bin_count: track.waveform.bins.len(),
        beatgrid: track.beatgrid,
    };
    send(
        &state,
        Command::Load {
            deck: id,
            track: track.clone(),
        },
    )?;
    state.tracks.lock().map_err(|_| "lock poisoned")?[deck] = Some(track);
    Ok(info)
}

/// Raw waveform bytes for a deck: 4 bytes per bin (peak, low, mid, high).
/// Returned as binary so it arrives in JS as an ArrayBuffer, not JSON.
#[tauri::command]
fn waveform(state: State<'_, AppState>, deck: usize) -> Result<Response, String> {
    let tracks = state.tracks.lock().map_err(|_| "lock poisoned")?;
    let track = tracks
        .get(deck)
        .and_then(|t| t.as_ref())
        .ok_or("deck is empty")?;
    Ok(Response::new(Waveform::to_bytes(&track.waveform.bins)))
}

pub fn run() {
    // Play through the controller's own sound card when it's plugged in, so
    // its headphone output works.
    let preferred = ["DDJ-FLX4"];
    let (output, handle, device_label) = match dj_engine::output::start_preferring(&preferred) {
        Ok((out, handle)) => {
            let name = format!("{} · {} Hz", out.device_name, out.sample_rate);
            (Output::Device(out), handle, name)
        }
        Err(e) => {
            eprintln!("no audio output ({e}); running silently");
            let (out, handle) = dj_engine::start_null(48_000);
            (Output::Null(out), handle, "No audio device".to_string())
        }
    };

    let shared = handle.shared().clone();
    let engine = Arc::new(Mutex::new(handle));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup({
            let engine = engine.clone();
            move |app| {
                controller::start(app.handle(), engine, shared);
                Ok(())
            }
        })
        .manage(AppState {
            engine,
            tracks: Mutex::new(Default::default()),
            output_name: device_label,
            _output: output,
        })
        .manage(library::Library::load())
        .invoke_handler(tauri::generate_handler![
            control,
            state,
            output_name,
            load_track,
            waveform,
            controller::controller_name,
            library::library_folders,
            library::add_folder,
            library::remove_folder,
            library::library_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running oss-dj");
}
