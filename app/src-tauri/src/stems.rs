//! Stems in the app: splits loaded tracks in the background when the user's
//! choice says to, fetches the model, and keeps the stems settings.
//!
//! Nothing is split until the user has chosen between having stems ready on
//! every track and splitting a track once its stems are used. They're asked
//! the first time they use stems. People who had the model before there was
//! a choice keep what they had, stems on every track.
//!
//! The model isn't part of the app, to keep it small. It downloads by itself
//! once the app is set up ([`stems_setup_done`]), unless stems are turned off
//! or the user cancelled or removed it, which is remembered until they ask
//! for it again.
//!
//! Settings live in `stems.json` in the app's data folder, the model in
//! `models/`, and finished stems in `stems/`.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use dj_engine::{SharedState, NUM_DECKS};
use dj_stems::download::{self, Downloader};
use dj_stems::{CacheKey, Settings, Splitter, Status, When, MODEL_BYTES};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const GB: u64 = 1024 * 1024 * 1024;

/// When tracks are split, as the user chose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Not chosen yet: asked the first time stems are used.
    Ask,
    /// Every track, as it loads.
    Fast,
    /// A track once its stems are used.
    Efficient,
    /// Never. (Saved as `enabled`, which keeps the choice for later.)
    Off,
}

/// What the user can change, as saved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    /// Stems are on.
    enabled: bool,
    /// When tracks are split, if on. Missing in settings from before there
    /// was a choice; [`Saved::settle`] fills it in.
    mode: Option<Mode>,
    /// Stems cache size in GB. 0 turns the cache off.
    cache_gb: u32,
    /// Download the model without being asked. Off once the user has
    /// cancelled or removed it, until they download it themselves.
    auto_download: bool,
}

impl Default for Saved {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: None,
            cache_gb: 5,
            auto_download: true,
        }
    }
}

impl Saved {
    /// Decides the mode the first time this version runs: whoever already
    /// has the model was splitting every track, and goes on doing so;
    /// anyone else is asked. Returns whether that changed anything, to be
    /// saved at once: later, a model that downloaded by itself would look
    /// the same.
    fn settle(&mut self, has_model: bool) -> bool {
        if self.mode.is_some() {
            return false;
        }
        self.mode = Some(if has_model { Mode::Fast } else { Mode::Ask });
        true
    }

    fn mode(&self) -> Mode {
        if self.enabled {
            self.mode.unwrap_or(Mode::Ask)
        } else {
            Mode::Off
        }
    }

    fn set_mode(&mut self, mode: Mode) {
        self.enabled = mode != Mode::Off;
        if self.enabled {
            self.mode = Some(mode);
        }
    }

    fn when(&self) -> When {
        match self.mode() {
            Mode::Ask => When::Unchosen,
            Mode::Fast => When::Always,
            Mode::Efficient => When::OnUse,
            Mode::Off => When::Never,
        }
    }
}

/// The model download as the UI shows it, and the `stems-model` event.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// missing, downloading, waiting (for a connection), ready or failed.
    state: &'static str,
    /// Bytes that are in, of `total`.
    done: u64,
    total: u64,
    seconds_left: Option<u64>,
    error: Option<String>,
    /// When tracks are split. Not about the model, but what the UI shows of
    /// stems depends on both.
    mode: Mode,
}

impl ModelInfo {
    fn new(s: download::State, mode: Mode) -> Self {
        use download::State as S;
        let (state, done, seconds_left, error) = match s {
            S::Missing { done } => ("missing", done, None, None),
            S::Downloading { done, left } => ("downloading", done, left, None),
            S::Waiting { done } => ("waiting", done, None, None),
            S::Ready => ("ready", MODEL_BYTES, None, None),
            S::Failed { done, error } => ("failed", done, None, Some(error)),
        };
        Self {
            state,
            done,
            total: MODEL_BYTES,
            seconds_left,
            error,
            mode,
        }
    }
}

pub struct Stems {
    splitter: Splitter,
    dir: Option<PathBuf>,
    saved: Mutex<Saved>,
    /// `None` without a data folder to keep the model in.
    model: Option<Downloader>,
}

/// One deck's stems as the UI shows them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStems {
    /// off, needsModel, ask, onUse, starting, splitting, ready or failed.
    state: &'static str,
    /// The stems are ready where the play head is, so muting one is heard.
    here: bool,
    /// Share of the track that's split, 0 to 1.
    ready: f32,
    error: Option<String>,
}

/// The Stems settings page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StemsInfo {
    mode: Mode,
    cache_gb: u32,
    /// Bytes the cache takes now.
    cache_bytes: u64,
    /// Bytes the model takes, with the copy that loads quickly.
    model_bytes: u64,
    model: ModelInfo,
    measured: MeasuredInfo,
}

/// What making stems has taken on this computer, where that's known.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredInfo {
    /// Seconds from a press to the sound.
    heard: Option<f32>,
    /// GB, at the most.
    memory: Option<f32>,
}

impl From<dj_stems::measure::Summary> for MeasuredInfo {
    fn from(s: dj_stems::measure::Summary) -> Self {
        Self {
            heard: s.heard,
            memory: s.memory,
        }
    }
}

impl Stems {
    pub fn new(shared: Arc<SharedState>, app: AppHandle) -> Self {
        let dir = crate::paths::data_dir();
        let mut saved: Saved = dir
            .as_ref()
            .and_then(|d| std::fs::read(d.join("stems.json")).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let model = dir.as_ref().map(|d| {
            let dest = d.join("models").join(dj_stems::MODEL_FILE);
            Downloader::new(dj_stems::model_source(), dest, move |s| {
                let Some(stems) = app.try_state::<Stems>() else {
                    return;
                };
                // Splitting starts on the loaded decks once it's in, and
                // stops using it once it's removed.
                if matches!(s, download::State::Ready | download::State::Missing { .. }) {
                    stems.apply();
                }
                let _ = app.emit("stems-model", ModelInfo::new(s.clone(), stems.mode()));
            })
        });
        let has_model = model
            .as_ref()
            .is_some_and(|m: &Downloader| m.state() == download::State::Ready);
        let settled = saved.settle(has_model);
        let decks = shared.clone();
        let heads: dj_stems::PlayHeads = Box::new(move |deck| shared.deck(deck).position);
        let stems = Self {
            splitter: Splitter::new(Settings::default(), heads),
            dir,
            saved: Mutex::new(saved),
            model,
        };
        if settled {
            stems.save();
        }
        // More threads for a first region, but never while a deck plays.
        stems.splitter.set_playing(Box::new(move || {
            (0..NUM_DECKS).any(|d| decks.deck(d).playing)
        }));
        stems.apply();
        stems
    }

    fn model_path(&self) -> Option<PathBuf> {
        self.dir
            .as_ref()
            .map(|d| d.join("models").join(dj_stems::MODEL_FILE))
    }

    fn cache_dir(&self) -> Option<PathBuf> {
        self.dir.as_ref().map(|d| dj_stems::cache_dir(d))
    }

    /// Hands the current settings to the splitter.
    fn apply(&self) {
        // Held to the end, so two of these can't hand over old news.
        let saved = self.saved.lock().expect("stems settings");
        let ready = self
            .model
            .as_ref()
            .is_some_and(|m| m.state() == download::State::Ready);
        self.splitter.configure(Settings {
            when: saved.when(),
            model: self.model_path().filter(|_| ready),
            cache_dir: self.cache_dir(),
            cache_limit: saved.cache_gb as u64 * GB,
            measured: self.dir.as_ref().map(|d| d.join("stems-measured.txt")),
        });
    }

    fn save(&self) {
        let saved = self.saved.lock().expect("stems settings").clone();
        if let Some(d) = &self.dir {
            let _ = std::fs::create_dir_all(d);
            if let Ok(json) = serde_json::to_vec_pretty(&saved) {
                let _ = std::fs::write(d.join("stems.json"), json);
            }
        }
    }

    /// A track was loaded on `deck`: split it, now or when it's used.
    pub fn loaded(&self, deck: usize, track: &Arc<dj_engine::Track>) {
        let key = track
            .path
            .as_deref()
            .and_then(|p| CacheKey::for_file(p, dj_stems::MODEL_ID));
        self.splitter.split(deck, track.clone(), key);
    }

    pub fn ejected(&self, deck: usize) {
        self.splitter.stop(deck);
    }

    /// True when `deck`'s stems can be muted: split, being split, or split
    /// as soon as one is. Until it's split where it plays, the deck plays
    /// the original, and muting is heard once it is.
    pub fn usable(&self, deck: usize) -> bool {
        matches!(
            self.splitter.status(deck),
            Status::OnUse | Status::Starting | Status::Splitting(_) | Status::Ready
        )
    }

    /// `deck`'s stems are being used.
    pub fn used(&self, deck: usize) {
        self.splitter.use_stems(deck);
    }

    pub fn decks(&self) -> [DeckStems; NUM_DECKS] {
        std::array::from_fn(|deck| {
            let (state, ready, error) = match self.splitter.status(deck) {
                Status::Off => ("off", 0.0, None),
                Status::NeedsModel => ("needsModel", 0.0, None),
                Status::Unchosen => ("ask", 0.0, None),
                Status::OnUse => ("onUse", 0.0, None),
                Status::Starting => ("starting", 0.0, None),
                Status::Splitting(r) => ("splitting", r, None),
                Status::Ready => ("ready", 1.0, None),
                Status::Failed(e) => ("failed", 0.0, Some(e)),
            };
            DeckStems {
                state,
                here: self.splitter.is_here(deck),
                ready,
                error,
            }
        })
    }

    fn info(&self) -> StemsInfo {
        let saved = self.saved.lock().expect("stems settings").clone();
        StemsInfo {
            mode: saved.mode(),
            cache_gb: saved.cache_gb,
            cache_bytes: self.cache_dir().map_or(0, |d| dj_stems::cache::size(&d)),
            model_bytes: self.model_path().map_or(0, |p| {
                std::fs::metadata(&p).map_or(0, |m| m.len()) + dj_stems::quick::size(&p)
            }),
            model: self.model_info(),
            measured: self.splitter.measured().into(),
        }
    }

    fn mode(&self) -> Mode {
        self.saved.lock().expect("stems settings").mode()
    }

    fn model_info(&self) -> ModelInfo {
        let state = match &self.model {
            Some(m) => m.state(),
            None => download::State::Failed {
                done: 0,
                error: "There's no folder to keep it in.".into(),
            },
        };
        ModelInfo::new(state, self.mode())
    }

    /// Starts the download if it's missing and nobody has said no to it.
    fn auto_download(&self) {
        let saved = self.saved.lock().expect("stems settings").clone();
        if let Some(m) = &self.model {
            if saved.enabled
                && saved.auto_download
                && matches!(m.state(), download::State::Missing { .. })
            {
                m.start();
            }
        }
    }

    /// Remembers whether the model may download by itself.
    fn allow_download(&self, yes: bool) {
        self.saved.lock().expect("stems settings").auto_download = yes;
        self.save();
    }
}

#[tauri::command]
pub fn stems_info(stems: State<'_, Stems>) -> StemsInfo {
    stems.info()
}

/// Changes stems settings; leave a field out to keep it.
#[tauri::command]
pub fn set_stems(
    stems: State<'_, Stems>,
    app: State<'_, crate::AppState>,
    mode: Option<Mode>,
    cache_gb: Option<u32>,
) -> StemsInfo {
    let was = stems.mode();
    {
        let mut s = stems.saved.lock().expect("stems settings");
        if let Some(v) = mode {
            s.set_mode(v);
        }
        if let Some(v) = cache_gb {
            s.cache_gb = v.min(100);
        }
    }
    stems.save();
    stems.apply();
    match (mode, &stems.model) {
        // With stems off there's nothing to download the model for.
        (Some(Mode::Off), Some(m)) => m.cancel(),
        (Some(_), _) => {
            stems.auto_download();
            if was == Mode::Off {
                // It let go of the loaded tracks when it was turned off.
                let tracks = app.tracks.lock().unwrap_or_else(|e| e.into_inner()).clone();
                for (deck, track) in tracks.iter().enumerate() {
                    if let Some(t) = track {
                        stems.loaded(deck, t);
                    }
                }
            }
        }
        _ => {}
    }
    if let (Some(dir), Some(gb)) = (stems.cache_dir(), cache_gb) {
        let _ = dj_stems::cache::trim(&dir, gb as u64 * GB, None);
    }
    stems.info()
}

/// `deck`'s stems look about to be used (the pointer is on them), or no
/// longer do.
#[tauri::command]
pub fn prepare_stems(stems: State<'_, Stems>, deck: usize, on: bool) {
    stems.splitter.prepare(deck, on);
}

/// Whether `deck`'s Stems tab is showing.
#[tauri::command]
pub fn stems_shown(stems: State<'_, Stems>, deck: usize, shown: bool) {
    stems.splitter.shown(deck, shown);
}

/// `deck`'s stems are being used: its Stems tab was opened.
#[tauri::command]
pub fn use_stems(stems: State<'_, Stems>, deck: usize) {
    stems.used(deck);
}

/// `deck`'s Stems tab is showing, or no longer is. While it is, a track that
/// loads there is being used.
#[tauri::command]
pub fn stems_open(stems: State<'_, Stems>, deck: usize, open: bool) {
    stems.splitter.open(deck, open);
}

#[tauri::command]
pub fn clear_stems_cache(stems: State<'_, Stems>) -> Result<StemsInfo, String> {
    if let Some(dir) = stems.cache_dir() {
        dj_stems::cache::clear(&dir).map_err(|e| e.to_string())?;
    }
    Ok(stems.info())
}

#[tauri::command]
pub fn stems_model(stems: State<'_, Stems>) -> ModelInfo {
    stems.model_info()
}

/// The app is set up: whatever the first launch asks has been answered. The
/// model starts downloading, if it isn't here and nobody has said no to it.
#[tauri::command]
pub fn stems_setup_done(stems: State<'_, Stems>) -> ModelInfo {
    stems.auto_download();
    stems.model_info()
}

/// Downloads the model because the user asked, or tries again now. The
/// `stems-model` event says how it's going.
#[tauri::command]
pub fn download_stems_model(stems: State<'_, Stems>) -> ModelInfo {
    stems.allow_download(true);
    if let Some(m) = &stems.model {
        m.start();
    }
    stems.model_info()
}

/// Stops the download, and doesn't start it again until the user asks.
#[tauri::command]
pub fn cancel_stems_model(stems: State<'_, Stems>) -> ModelInfo {
    stems.allow_download(false);
    if let Some(m) = &stems.model {
        m.cancel();
    }
    stems.model_info()
}

/// Deletes the model, or what's in of it, and doesn't download it again
/// until the user asks.
#[tauri::command]
pub fn remove_stems_model(stems: State<'_, Stems>) -> Result<ModelInfo, String> {
    stems.allow_download(false);
    if let Some(m) = &stems.model {
        m.remove().map_err(|e| e.to_string())?;
    }
    if let Some(p) = stems.model_path() {
        dj_stems::quick::remove(&p).map_err(|e| e.to_string())?;
    }
    Ok(stems.model_info())
}

/// Raw waveform bytes for what a deck plays with the stems in `mask` on.
#[tauri::command]
pub async fn stems_waveform(
    state: State<'_, crate::AppState>,
    deck: usize,
    mask: u8,
) -> Result<tauri::ipc::Response, String> {
    let track = state
        .tracks
        .lock()
        .map_err(|_| "lock poisoned")?
        .get(deck)
        .cloned()
        .flatten()
        .ok_or("deck is empty")?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let w = dj_engine::stems::waveform_for(&track, mask);
        dj_engine::Waveform::to_bytes(&w.bins)
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(json: &str) -> Saved {
        serde_json::from_str(json).unwrap()
    }

    /// Settings saved before the model downloaded by itself.
    #[test]
    fn older_settings_download_the_model() {
        let s = saved(r#"{"enabled": false, "cacheGb": 20}"#);
        assert!(!s.enabled);
        assert_eq!(s.cache_gb, 20);
        assert!(s.auto_download);
    }

    #[test]
    fn whoever_has_the_model_keeps_splitting_every_track_unasked() {
        let mut s = saved(r#"{"enabled": true, "cacheGb": 5}"#);
        assert!(s.settle(true), "saved");
        assert_eq!(s.mode(), Mode::Fast);
        // With stems off they stay off, and Fast is there to go back to.
        let mut s = saved(r#"{"enabled": false}"#);
        s.settle(true);
        assert_eq!(s.mode(), Mode::Off);
        assert_eq!(s.mode, Some(Mode::Fast));
    }

    #[test]
    fn anyone_else_is_asked_even_once_the_model_is_in() {
        let mut s = Saved::default();
        assert!(s.settle(false), "saved");
        assert_eq!(s.when(), When::Unchosen);
        // Next launch, with the model downloaded meanwhile.
        let mut s = saved(&serde_json::to_string(&s).unwrap());
        assert!(!s.settle(true));
        assert_eq!(s.mode(), Mode::Ask);
    }

    #[test]
    fn a_choice_survives_turning_stems_off_and_restarting() {
        let mut s = Saved::default();
        s.settle(false);
        s.set_mode(Mode::Efficient);
        assert_eq!(s.when(), When::OnUse);
        s.set_mode(Mode::Off);
        assert_eq!(s.when(), When::Never);
        let s = saved(&serde_json::to_string(&s).unwrap());
        assert_eq!(s.mode(), Mode::Off);
        assert_eq!(s.mode, Some(Mode::Efficient));
        for (mode, name) in [(Mode::Efficient, "\"efficient\""), (Mode::Fast, "\"fast\"")] {
            assert_eq!(serde_json::to_string(&mode).unwrap(), name);
        }
    }

    #[test]
    fn the_ui_gets_the_download_as_it_is() {
        let info = ModelInfo::new(
            download::State::Downloading {
                done: 5,
                left: Some(9),
            },
            Mode::Ask,
        );
        assert_eq!(
            serde_json::to_value(info).unwrap(),
            serde_json::json!({
                "state": "downloading", "done": 5, "total": MODEL_BYTES,
                "secondsLeft": 9, "error": null, "mode": "ask",
            })
        );
    }
}
