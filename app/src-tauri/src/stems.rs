//! Stems in the app: splits each loaded track in the background, fetches
//! the model on request, and keeps the stems settings.
//!
//! Settings live in `stems.json` in the app's data folder, the model in
//! `models/`, and finished stems in `stems/`.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use dj_engine::{SharedState, NUM_DECKS};
use dj_stems::{download, CacheKey, Settings, Splitter, Status};
use serde::{Deserialize, Serialize};
use tauri::State;

const GB: u64 = 1024 * 1024 * 1024;

/// What the user can change, as saved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    /// Split tracks when they load.
    enabled: bool,
    /// Stems cache size in GB. 0 turns the cache off.
    cache_gb: u32,
    /// Use the GPU and Neural Engine.
    accelerate: bool,
}

impl Default for Saved {
    fn default() -> Self {
        Self {
            enabled: true,
            cache_gb: 5,
            accelerate: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
enum ModelState {
    #[default]
    Missing,
    Downloading {
        done: u64,
        total: u64,
    },
    Ready,
    Failed {
        error: String,
    },
}

pub struct Stems {
    splitter: Splitter,
    dir: Option<PathBuf>,
    saved: Mutex<Saved>,
    model: Arc<Mutex<ModelState>>,
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
    accelerate: bool,
    /// Bytes the cache takes now.
    cache_bytes: u64,
    model: ModelState,
    /// Size of the model download, in bytes.
    model_bytes: u64,
}

/// Size of the model download, shown before it starts.
const MODEL_BYTES: u64 = 84 * 1024 * 1024;

impl Stems {
    pub fn new(shared: Arc<SharedState>) -> Self {
        let dir = dirs::data_dir().map(|d| d.join("oss-dj"));
        let saved: Saved = dir
            .as_ref()
            .and_then(|d| std::fs::read(d.join("stems.json")).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let model_path = dir
            .as_ref()
            .map(|d| d.join("models").join(dj_stems::MODEL_FILE));
        let model = if model_path.as_ref().is_some_and(|p| p.exists()) {
            ModelState::Ready
        } else {
            ModelState::Missing
        };
        let heads: dj_stems::PlayHeads = Box::new(move |deck| shared.deck(deck).position);
        let stems = Self {
            splitter: Splitter::new(Settings::default(), heads),
            dir,
            saved: Mutex::new(saved),
            model: Arc::new(Mutex::new(model)),
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
        let saved = self.saved.lock().expect("stems settings").clone();
        let ready = matches!(*self.model.lock().expect("model state"), ModelState::Ready);
        self.splitter.configure(Settings {
            enabled: saved.enabled,
            model: self.model_path().filter(|_| ready),
            accelerate: saved.accelerate,
            cache_dir: self.cache_dir(),
            cache_limit: saved.cache_gb as u64 * GB,
            compiled_dir: self.dir.as_ref().map(|d| d.join("models").join("compiled")),
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
            accelerate: saved.accelerate,
            cache_bytes: self.cache_dir().map_or(0, |d| dj_stems::cache::size(&d)),
            model: self.model.lock().expect("model state").clone(),
            model_bytes: MODEL_BYTES,
        }
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
    accelerate: Option<bool>,
) -> StemsInfo {
    {
        let mut s = stems.saved.lock().expect("stems settings");
        if let Some(v) = enabled {
            s.enabled = v;
        }
        if let Some(v) = cache_gb {
            s.cache_gb = v.min(100);
        }
        if let Some(v) = accelerate {
            s.accelerate = v;
        }
    }
    stems.save();
    stems.apply();
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

/// Starts downloading the model in the background; `stems_info` shows how
/// far it has got. Stems start on the loaded decks once it's in.
#[tauri::command]
pub fn download_stems_model(app: tauri::AppHandle, stems: State<'_, Stems>) -> Result<(), String> {
    let path = stems.model_path().ok_or("no data folder")?;
    {
        let mut m = stems.model.lock().expect("model state");
        if matches!(*m, ModelState::Downloading { .. } | ModelState::Ready) {
            return Ok(());
        }
        *m = ModelState::Downloading {
            done: 0,
            total: MODEL_BYTES,
        };
    }
    let model = stems.model.clone();
    std::thread::Builder::new()
        .name("stems-download".into())
        .spawn(move || {
            let result = download::fetch(
                dj_stems::MODEL_URL,
                dj_stems::MODEL_SHA256,
                &path,
                |done, total| {
                    *model.lock().expect("model state") = ModelState::Downloading {
                        done,
                        total: if total > 0 { total } else { MODEL_BYTES },
                    };
                },
            );
            *model.lock().expect("model state") = match result {
                Ok(()) => ModelState::Ready,
                Err(e) => ModelState::Failed {
                    error: e.to_string(),
                },
            };
            use tauri::Manager;
            app.state::<Stems>().apply();
        })
        .map_err(|e| e.to_string())?;
    Ok(())
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
