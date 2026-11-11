//! Tauri shell: owns the audio engine and exposes it to the UI.
//!
//! The UI never touches audio. It sends small commands (`control`), polls
//! state at screen refresh rate (`state`), and fetches waveform bytes once
//! per loaded track (`waveform`).
//!
//! A supported MIDI controller is picked up automatically when plugged in.
//! Its mixer and transport controls go straight to the engine; its library
//! browse knob and load buttons arrive in the UI as `controller` events.

mod audio;
mod controller;
mod library;
mod stems;

use std::sync::{Arc, Mutex};

use dj_engine::{
    Beatgrid, Command, DeckId, DeckSnapshot, EngineHandle, EqBand, FxKind, MixerSnapshot,
    RecordingStatus, SamplerSnapshot, Track, Waveform, MAX_SAMPLE_SECS, SAMPLER_SLOTS,
};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{Manager, State};

/// Keeps whichever output is running alive for the app's lifetime.
pub(crate) enum Output {
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

pub(crate) struct AppState {
    engine: Arc<Mutex<EngineHandle>>,
    tracks: Mutex<[Option<Arc<Track>>; dj_engine::NUM_DECKS]>,
    output: Output,
    /// The output device picked in Settings > Audio.
    audio: Mutex<audio::Saved>,
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
    /// The beatgrid was fixed by hand, so analysis leaves it alone.
    grid_locked: bool,
}

/// A deck's beatgrid after it was changed by hand.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GridInfo {
    beatgrid: Option<Beatgrid>,
    grid_locked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineState {
    decks: [DeckSnapshot; dj_engine::NUM_DECKS],
    mixer: MixerSnapshot,
    sampler: SamplerSnapshot,
    deck_peaks: [f32; dj_engine::NUM_DECKS],
    master_peak: [f32; 2],
    recording: RecordingStatus,
    audio: AudioStatus,
    stems: [stems::DeckStems; dj_engine::NUM_DECKS],
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
    SetSlip {
        deck: usize,
        on: bool,
    },
    SetQuantize {
        on: bool,
    },
    SetHotCuePlays {
        on: bool,
    },
    SetAutoSync {
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
    SamplePlay {
        slot: usize,
    },
    SampleStop {
        slot: usize,
    },
    ClearSample {
        slot: usize,
    },
    SetSamplerLevel {
        value: f32,
    },
    /// Which stems a deck plays: bit n is vocals, melody, bass, drums.
    SetStems {
        deck: usize,
        mask: u8,
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
            C::SetSlip { deck, on } => Command::SetSlip {
                deck: deck_id(deck)?,
                on,
            },
            C::SetQuantize { on } => Command::SetQuantize { on },
            C::SetHotCuePlays { on } => Command::SetHotCuePlays { on },
            C::SetAutoSync { on } => Command::SetAutoSync { on },
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
            C::SamplePlay { slot } => Command::SamplePlay { slot },
            C::SampleStop { slot } => Command::SampleStop { slot },
            C::ClearSample { slot } => Command::ClearSample { slot },
            C::SetSamplerLevel { value } => Command::SetSamplerLevel { value },
            C::SetStems { deck, mask } => Command::SetStems {
                deck: deck_id(deck)?,
                mask,
            },
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
fn control(
    state: State<'_, AppState>,
    library: State<'_, library::Library>,
    stems: State<'_, stems::Stems>,
    cmd: Control,
) -> Result<(), String> {
    let eject = match cmd {
        Control::Eject { deck } => Some(deck),
        _ => None,
    };
    if let Some(deck) = eject {
        library.unwatch(deck);
        stems.ejected(deck);
    }
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
fn state(state: State<'_, AppState>, stems: State<'_, stems::Stems>) -> EngineState {
    // A panic elsewhere while holding the lock mustn't take the UI down
    // with it: the handle itself is still fine to read.
    let mut engine = state.engine.lock().unwrap_or_else(|e| e.into_inner());
    let (deck_peaks, master_peak) = engine.take_peaks();
    let recording = engine.recording();
    let shared = engine.shared();
    EngineState {
        decks: std::array::from_fn(|i| shared.deck(i)),
        mixer: shared.mixer(),
        sampler: shared.sampler(),
        deck_peaks,
        master_peak,
        recording,
        audio: state.output.status(),
        stems: stems.decks(),
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
/// it into the deck with its saved cue points. With `auto_gain` (the
/// default), the deck plays it at the common loudness, under the trim.
#[tauri::command]
async fn load_track(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    library: State<'_, library::Library>,
    stems: State<'_, stems::Stems>,
    deck: usize,
    path: String,
    auto_gain: Option<bool>,
) -> Result<TrackInfo, String> {
    let id = deck_id(deck)?;
    let track = tauri::async_runtime::spawn_blocking(move || Track::load(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let track = Arc::new(track);
    let (cues, locked) = library.loaded(&app, deck, &track);
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
        beatgrid: locked.or(track.beatgrid),
        grid_locked: locked.is_some(),
    };
    send(
        &state,
        Command::Load {
            deck: id,
            track: track.clone(),
        },
    )?;
    if auto_gain.unwrap_or(true) {
        send(
            &state,
            Command::SetAutoGain {
                deck: id,
                db: track.loudness.gain_db(dj_engine::loudness::TARGET_LUFS),
            },
        )?;
    }
    for cmd in cues.commands(id) {
        send(&state, cmd)?;
    }
    if locked.is_some() {
        send(
            &state,
            Command::SetBeatgrid {
                deck: id,
                grid: locked,
            },
        )?;
    }
    stems.loaded(deck, &track);
    state.tracks.lock().map_err(|_| "lock poisoned")?[deck] = Some(track);
    Ok(info)
}

/// Decodes a file on a worker thread and puts it in a sampler slot.
/// Returns the sample's length in seconds.
#[tauri::command]
async fn load_sample(state: State<'_, AppState>, slot: usize, path: String) -> Result<f64, String> {
    if slot >= SAMPLER_SLOTS {
        return Err(format!("no sampler slot {slot}"));
    }
    let track = tauri::async_runtime::spawn_blocking(move || Track::load(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let duration = track.duration_secs();
    if duration > MAX_SAMPLE_SECS {
        return Err(format!(
            "it's {}:{:02} long, and samples can be up to {} seconds",
            (duration / 60.0) as u32,
            (duration % 60.0) as u32,
            MAX_SAMPLE_SECS
        ));
    }
    send(
        &state,
        Command::LoadSample {
            slot,
            sample: Arc::new(track),
        },
    )?;
    Ok(duration)
}

/// Fixes the beatgrid of the track on a deck by hand, and saves it locked
/// so analysis leaves it alone. `None` goes back to the detected grid.
#[tauri::command]
fn set_beatgrid(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    library: State<'_, library::Library>,
    deck: usize,
    grid: Option<Beatgrid>,
) -> Result<GridInfo, String> {
    let id = deck_id(deck)?;
    let track = state.tracks.lock().map_err(|_| "lock poisoned")?[deck]
        .clone()
        .ok_or("deck is empty")?;
    if let Some(g) = grid {
        if !(g.bpm.is_finite() && (20.0..=400.0).contains(&g.bpm) && g.first_beat.is_finite()) {
            return Err(format!("{} BPM is out of range", g.bpm));
        }
    }
    send(&state, Command::SetBeatgrid { deck: id, grid })?;
    if let Some(path) = &track.path {
        library.save_grid(&app, path, grid, track.beatgrid)?;
    }
    Ok(GridInfo {
        beatgrid: grid.or(track.beatgrid),
        grid_locked: grid.is_some(),
    })
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
    // Play through the device picked in Settings > Audio, or by default the
    // controller's own sound card when it's plugged in, so its headphone
    // output works.
    let saved_audio = audio::load();
    let (output, handle) =
        match dj_engine::output::start_with(audio::target(&saved_audio), audio::PREFERRED) {
            Ok((out, handle)) => (Output::Device(out), handle),
            Err(e) => {
                eprintln!("no audio output ({e}); running silently");
                let (out, handle) = dj_engine::start_null(48_000);
                (Output::Null(out), handle)
            }
        };

    let shared = handle.shared().clone();
    let stems = stems::Stems::new(shared.clone());
    let engine = Arc::new(Mutex::new(handle));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup({
            let engine = engine.clone();
            move |app| {
                controller::start(app.handle(), engine, shared.clone());
                log_audio_stats(app.handle().clone());
                app.state::<library::Library>()
                    .start(app.handle().clone(), shared);
                let handle = app.handle().clone();
                let _ = std::thread::Builder::new()
                    .name("deck-watcher".into())
                    .spawn(move || handle.state::<library::Library>().run_deck_watcher());
                Ok(())
            }
        })
        .manage(AppState {
            engine,
            tracks: Mutex::new(Default::default()),
            output,
            audio: Mutex::new(saved_audio),
        })
        .manage(library::Library::load())
        .manage(stems)
        .invoke_handler(tauri::generate_handler![
            control,
            state,
            output_name,
            audio_stats,
            use_default_output,
            audio::audio_outputs,
            audio::set_audio_output,
            load_track,
            load_sample,
            set_beatgrid,
            waveform,
            start_recording,
            stop_recording,
            controller::controller_name,
            controller::controllers,
            controller::midi_learn_start,
            controller::midi_learn_poll,
            controller::midi_learn_stop,
            controller::learned_mapping,
            controller::save_learned_mapping,
            library::library_folders,
            library::add_folder,
            library::remove_folder,
            library::library_tracks,
            library::playlists,
            library::create_playlist,
            library::rename_playlist,
            library::delete_playlist,
            library::playlist_tracks,
            library::add_to_playlist,
            library::set_playlist_tracks,
            library::history_sessions,
            library::session_tracks,
            library::import_sources,
            library::import_preview,
            library::import_run,
            stems::stems_info,
            stems::set_stems,
            stems::clear_stems_cache,
            stems::download_stems_model,
            stems::stems_waveform,
        ])
        .build(tauri::generate_context!())
        .expect("error while running oss-dj")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                shut_down(app);
            }
        });
}

/// Finishes what's in flight before the app quits. The process exits
/// straight after this without running destructors, so anything left to
/// them would be lost: the end of a set recording, the last cue change,
/// and a controller left lit (or a deck held under a jog wheel touch).
fn shut_down(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let mut engine = state.engine.lock().unwrap_or_else(|e| e.into_inner());
        if engine.recording().active {
            match engine.stop_recording() {
                Ok(r) => eprintln!("recording saved: {:?}", r.path),
                Err(e) => eprintln!("could not finish the recording: {e}"),
            }
        }
    }
    if let Some(library) = app.try_state::<library::Library>() {
        for deck in 0..dj_engine::NUM_DECKS {
            library.unwatch(deck);
        }
    }
    if let Some(controller) = app.try_state::<dj_controller::midi::ControllerService>() {
        controller.shutdown();
    }
}
