//! Stems in the app: splits each loaded track in the background, fetches
//! the model, and keeps the stems settings.
//!
//! The model isn't part of the app, to keep it small. It downloads only once
//! the user asks for it. If the app quits before it's in, it carries on where
//! it stopped on the next launch ([`stems_setup_done`]), unless stems are
//! turned off or the user cancelled or removed it since.
//!
//! Settings live in `stems.json` in the app's data folder, the model in
//! `models/`, and finished stems in `stems/`.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use dj_engine::{SharedState, NUM_DECKS};
use dj_stems::download::{self, Downloader};
use dj_stems::{CacheKey, Settings, Splitter, Status, MODEL_BYTES};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const GB: u64 = 1024 * 1024 * 1024;

/// What the user can change, as saved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    /// Split tracks when they load.
    enabled: bool,
    /// Stems cache size in GB. 0 turns the cache off.
    cache_gb: u32,
    /// The user asked for the model, so an unfinished download carries on
    /// at launch. Off until they press Download, and again once they cancel
    /// or remove it.
    auto_download: bool,
}

impl Default for Saved {
    fn default() -> Self {
        Self {
            enabled: true,
            cache_gb: 5,
            auto_download: false,
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
}

impl From<download::State> for ModelInfo {
    fn from(s: download::State) -> Self {
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
    /// off, needsModel, starting, splitting, ready or failed.
    state: &'static str,
    /// Share of the track that's split, 0 to 1.
    ready: f32,
    error: Option<String>,
}

/// The Stems settings page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StemsInfo {
    enabled: bool,
    cache_gb: u32,
    /// Bytes the cache takes now.
    cache_bytes: u64,
    model: ModelInfo,
}

impl Stems {
    pub fn new(shared: Arc<SharedState>, app: AppHandle) -> Self {
        let dir = crate::paths::data_dir();
        let saved: Saved = dir
            .as_ref()
            .and_then(|d| std::fs::read(d.join("stems.json")).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let model = dir.as_ref().map(|d| {
            let dest = d.join("models").join(dj_stems::MODEL_FILE);
            Downloader::new(dj_stems::model_source(), dest, move |s| {
                // Splitting starts on the loaded decks once it's in, and
                // stops using it once it's removed.
                if matches!(s, download::State::Ready | download::State::Missing { .. }) {
                    if let Some(stems) = app.try_state::<Stems>() {
                        stems.apply();
                    }
                }
                let _ = app.emit("stems-model", ModelInfo::from(s.clone()));
            })
        });
        let heads: dj_stems::PlayHeads = Box::new(move |deck| shared.deck(deck).position);
        let stems = Self {
            splitter: Splitter::new(Settings::default(), heads),
            dir,
            saved: Mutex::new(saved),
            model,
        };
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
            enabled: saved.enabled,
            model: self.model_path().filter(|_| ready),
            cache_dir: self.cache_dir(),
            cache_limit: saved.cache_gb as u64 * GB,
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

    /// A track was loaded on `deck`: start splitting it.
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

    /// True when `deck`'s stems can be muted: split, or being split. Until
    /// then the deck plays the original whatever the stem mask says.
    pub fn usable(&self, deck: usize) -> bool {
        matches!(
            self.splitter.status(deck),
            Status::Starting | Status::Splitting(_) | Status::Ready
        )
    }

    pub fn decks(&self) -> [DeckStems; NUM_DECKS] {
        std::array::from_fn(|deck| {
            let (state, ready, error) = match self.splitter.status(deck) {
                Status::Off => ("off", 0.0, None),
                Status::NeedsModel => ("needsModel", 0.0, None),
                Status::Starting => ("starting", 0.0, None),
                Status::Splitting(r) => ("splitting", r, None),
                Status::Ready => ("ready", 1.0, None),
                Status::Failed(e) => ("failed", 0.0, Some(e)),
            };
            DeckStems {
                state,
                ready,
                error,
            }
        })
    }

    fn info(&self) -> StemsInfo {
        let saved = self.saved.lock().expect("stems settings").clone();
        StemsInfo {
            enabled: saved.enabled,
            cache_gb: saved.cache_gb,
            cache_bytes: self.cache_dir().map_or(0, |d| dj_stems::cache::size(&d)),
            model: self.model_info(),
        }
    }

    fn model_info(&self) -> ModelInfo {
        match &self.model {
            Some(m) => m.state().into(),
            None => download::State::Failed {
                done: 0,
                error: "There's no folder to keep it in.".into(),
            }
            .into(),
        }
    }

    /// Carries on with the download if the user asked for it and it isn't in.
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
    enabled: Option<bool>,
    cache_gb: Option<u32>,
) -> StemsInfo {
    {
        let mut s = stems.saved.lock().expect("stems settings");
        if let Some(v) = enabled {
            s.enabled = v;
        }
        if let Some(v) = cache_gb {
            s.cache_gb = v.min(100);
        }
    }
    stems.save();
    stems.apply();
    // With splitting off there's nothing to download the model for.
    match (enabled, &stems.model) {
        (Some(true), _) => stems.auto_download(),
        (Some(false), Some(m)) => m.cancel(),
        _ => {}
    }
    if let (Some(dir), Some(gb)) = (stems.cache_dir(), cache_gb) {
        let _ = dj_stems::cache::trim(&dir, gb as u64 * GB, None);
    }
    stems.info()
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

/// The app is set up: whatever the first launch asks has been answered. A
/// download the user started, and the app quit before it finished, carries on.
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

    /// Settings saved before the download was remembered: nobody has asked.
    #[test]
    fn older_settings_dont_download_the_model() {
        let s: Saved = serde_json::from_str(r#"{"enabled": false, "cacheGb": 20}"#).unwrap();
        assert!(!s.enabled);
        assert_eq!(s.cache_gb, 20);
        assert!(!s.auto_download);
        assert!(!Saved::default().auto_download);
    }

    #[test]
    fn the_ui_gets_the_download_as_it_is() {
        let info = ModelInfo::from(download::State::Downloading {
            done: 5,
            left: Some(9),
        });
        assert_eq!(
            serde_json::to_value(info).unwrap(),
            serde_json::json!({
                "state": "downloading", "done": 5, "total": MODEL_BYTES,
                "secondsLeft": 9, "error": null,
            })
        );
    }
}
