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
    Beatgrid, Command, DeckId, DeckSnapshot, EngineHandle, EqBand, FxKind, MixerSnapshot,
    RecordingStatus, Track, Waveform,
};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{Manager, State};

/// Keeps whichever output is running alive for the app's lifetime.
enum Output {
    Device(dj_engine::output::AudioOutput),
    #[allow(dead_code)]
    Null(dj_engine::NullOutput),
}

/// The audio output as the UI shows it: playing, waiting for a device that
/// went away, or running silently because there was never one.
#[derive(Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
enum AudioStatus {
    Connected {
        device: String,
        #[serde(rename = "sampleRate")]
        sample_rate: u32,
    },
    Lost {
        device: String,
        fallback: Option<String>,
    },
    None,
}

impl Output {
    fn status(&self) -> AudioStatus {
        use dj_engine::output::OutputStatus as S;
        match self {
            Output::Device(out) => match out.status() {
                S::Connected {
                    device,
                    sample_rate,
                } => AudioStatus::Connected {
                    device,
                    sample_rate,
                },
                S::Lost { device, fallback } => AudioStatus::Lost { device, fallback },
            },
            Output::Null(_) => AudioStatus::None,
        }
    }
}

struct AppState {
    engine: Arc<Mutex<EngineHandle>>,
    tracks: Mutex<[Option<Arc<Track>>; dj_engine::NUM_DECKS]>,
    output: Output,
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
    recording: RecordingStatus,
    audio: AudioStatus,
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
    SetCue {
        deck: usize,
        seconds: f64,
    },
    Eject {
        deck: usize,
    },
    SetRate {
        deck: usize,
        rate: f64,
    },
    SetBend {
        deck: usize,
        bend: f64,
    },
    SetKeylock {
        deck: usize,
        on: bool,
    },
    SetQuantize {
        on: bool,
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
    SetFilter {
        deck: usize,
        value: f32,
    },
    SetFxKind {
        deck: usize,
        kind: FxKind,
    },
    SetFxOn {
        deck: usize,
        on: bool,
    },
    SetFxLevel {
        deck: usize,
        value: f32,
    },
    SetFxBeats {
        deck: usize,
        beats: f32,
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
            C::SetCue { deck, seconds } => Command::SetCue {
                deck: deck_id(deck)?,
                seconds,
            },
            C::Eject { deck } => Command::Eject {
                deck: deck_id(deck)?,
            },
            C::SetRate { deck, rate } => Command::SetRate {
                deck: deck_id(deck)?,
                rate,
            },
            C::SetBend { deck, bend } => Command::SetBend {
                deck: deck_id(deck)?,
                bend,
            },
            C::SetKeylock { deck, on } => Command::SetKeylock {
                deck: deck_id(deck)?,
                on,
            },
            C::SetQuantize { on } => Command::SetQuantize { on },
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
            C::SetFilter { deck, value } => Command::SetFilter {
                deck: deck_id(deck)?,
                value,
            },
            C::SetFxKind { deck, kind } => Command::SetFxKind {
                deck: deck_id(deck)?,
                kind,
            },
            C::SetFxOn { deck, on } => Command::SetFxOn {
                deck: deck_id(deck)?,
                on,
            },
            C::SetFxLevel { deck, value } => Command::SetFxLevel {
                deck: deck_id(deck)?,
                value,
            },
            C::SetFxBeats { deck, beats } => Command::SetFxBeats {
                deck: deck_id(deck)?,
                beats,
            },
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
    let eject = match cmd {
        Control::Eject { deck } => Some(deck),
        _ => None,
    };
    send(&state, cmd.into_command()?)?;
    if let Some(deck) = eject {
        // The engine hands the track back to be freed; drop our copy too.
        if let Some(t) = state
            .tracks
            .lock()
            .map_err(|_| "lock poisoned")?
            .get_mut(deck)
        {
            *t = None;
        }
    }
    Ok(())
}

#[tauri::command]
fn state(state: State<'_, AppState>) -> EngineState {
    let mut engine = state.engine.lock().expect("engine lock");
    let (deck_peaks, master_peak) = engine.take_peaks();
    let recording = engine.recording();
    let shared = engine.shared();
    EngineState {
        decks: std::array::from_fn(|i| shared.deck(i)),
        mixer: shared.mixer(),
        deck_peaks,
        master_peak,
        recording,
        audio: state.output.status(),
    }
}

/// Where a new set recording goes: `Music/oss-dj recordings/Set <date> <time>.wav`.
fn recording_path() -> Result<std::path::PathBuf, String> {
    let dir = dirs::audio_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Music")))
        .ok_or("no music folder to record into")?
        .join("oss-dj recordings");
    let stem = format!("Set {}", chrono::Local::now().format("%Y-%m-%d %H.%M"));
    let mut path = dir.join(format!("{stem}.wav"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).wav"));
        n += 1;
    }
    Ok(path)
}

/// Starts recording the master output. Returns the file's path.
#[tauri::command]
fn start_recording(state: State<'_, AppState>) -> Result<String, String> {
    let path = recording_path()?;
    state
        .engine
        .lock()
        .map_err(|_| "engine lock poisoned")?
        .start_recording(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn stop_recording(state: State<'_, AppState>) -> Result<RecordingStatus, String> {
    state
        .engine
        .lock()
        .map_err(|_| "engine lock poisoned")?
        .stop_recording()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn output_name(state: State<'_, AppState>) -> String {
    match state.output.status() {
        AudioStatus::Connected {
            device,
            sample_rate,
        } => format!("{device} · {sample_rate} Hz"),
        AudioStatus::Lost { device, .. } => format!("{device} (disconnected)"),
        AudioStatus::None => "No audio device".into(),
    }
}

/// The audio stream's timing (buffer size, output latency, slowest render,
/// late callbacks), or null when running silently.
#[tauri::command]
fn audio_stats(state: State<'_, AppState>) -> Option<dj_engine::output::OutputStats> {
    match &state.output {
        Output::Device(out) => Some(out.stats()),
        Output::Null(_) => None,
    }
}

/// Stops waiting for a disconnected audio device and plays through the
/// system default output instead.
#[tauri::command]
fn use_default_output(state: State<'_, AppState>) {
    if let Output::Device(out) = &state.output {
        out.use_default();
    }
}

/// Decodes a file on a worker thread (keeping the UI responsive), then loads
/// it into the deck.
#[tauri::command]
async fn load_track(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    library: State<'_, library::Library>,
    deck: usize,
    path: String,
) -> Result<TrackInfo, String> {
    let id = deck_id(deck)?;
    let track = tauri::async_runtime::spawn_blocking(move || Track::load(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let track = Arc::new(track);
    library.loaded(&app, &track);
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

/// Prints the audio stream's timing once it has settled, and every few
/// seconds with `OSS_DJ_AUDIO_LOG=1`.
fn log_audio_stats(app: tauri::AppHandle) {
    use tauri::Manager;
    let every = std::env::var_os("OSS_DJ_AUDIO_LOG").is_some();
    let _ = std::thread::Builder::new()
        .name("audio-stats".into())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(3));
            let Output::Device(out) = &app.state::<AppState>().output else {
                return;
            };
            let s = out.stats();
            eprintln!(
                "audio: {} frames per buffer ({:.1} ms), output latency {:.1} ms, slowest render {} µs, late callbacks {}",
                s.buffer_frames,
                s.buffer_frames as f64 / out.sample_rate as f64 * 1000.0,
                s.output_latency_ms,
                s.max_render_us,
                s.late_callbacks
            );
            if !every {
                return;
            }
        });
}

pub fn run() {
    // Play through the controller's own sound card when it's plugged in, so
    // its headphone output works.
    let preferred = ["DDJ-FLX4"];
    let (output, handle) = match dj_engine::output::start_preferring(&preferred) {
        Ok((out, handle)) => (Output::Device(out), handle),
        Err(e) => {
            eprintln!("no audio output ({e}); running silently");
            let (out, handle) = dj_engine::start_null(48_000);
            (Output::Null(out), handle)
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
                log_audio_stats(app.handle().clone());
                app.state::<library::Library>()
                    .start_analyzer(app.handle().clone());
                Ok(())
            }
        })
        .manage(AppState {
            engine,
            tracks: Mutex::new(Default::default()),
            output,
        })
        .manage(library::Library::load())
        .invoke_handler(tauri::generate_handler![
            control,
            state,
            output_name,
            audio_stats,
            use_default_output,
            load_track,
            waveform,
            start_recording,
            stop_recording,
            controller::controller_name,
            library::library_folders,
            library::add_folder,
            library::remove_folder,
            library::library_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running oss-dj");
}
