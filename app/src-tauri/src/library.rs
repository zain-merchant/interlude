//! Phase 1 library: a list of watched folders and the audio files in them.
//!
//! Folders are saved to `<config dir>/oss-dj/library.json`. Search and
//! sorting run in the UI over the file list, which is instant for tens of
//! thousands of tracks. Tags, analysis results and crates move to SQLite in
//! Phase 2.
//!
//! Length, BPM and key come from a background analyzer: one low-key worker
//! thread that decodes the listed tracks one at a time and reports each
//! result to the UI as a `library-analysis` event. Results are kept in
//! memory for the session only, so a rescan doesn't redo them.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};

use dj_engine::TrackSummary;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "mp4", "flac", "wav", "aif", "aiff", "ogg", "oga", "caf",
];
/// Guards against symlink loops and accidentally adding `/`.
const MAX_DEPTH: usize = 12;

#[derive(Default, Serialize, Deserialize)]
struct Saved {
    folders: Vec<PathBuf>,
}

pub struct Library {
    saved: Mutex<Saved>,
    file: Option<PathBuf>,
    analyzer: Arc<Analyzer>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    path: String,
    title: String,
    artist: String,
    folder: String,
    format: String,
    /// Length, BPM and key once analyzed this session; `None` until then.
    analysis: Option<Analysis>,
}

/// A track's analysis as the library reports it. `failed` marks a file
/// that couldn't be decoded, so the UI stops waiting for it.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    duration: Option<f64>,
    bpm: Option<f64>,
    key: Option<dj_engine::Key>,
    failed: bool,
}

impl From<TrackSummary> for Analysis {
    fn from(s: TrackSummary) -> Self {
        Self {
            duration: Some(s.duration),
            bpm: s.bpm,
            key: s.key,
            failed: false,
        }
    }
}

impl Analysis {
    const FAILED: Self = Self {
        duration: None,
        bpm: None,
        key: None,
        failed: true,
    };
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AnalysisEvent {
    path: String,
    #[serde(flatten)]
    analysis: Analysis,
}

/// Background track analysis: a queue of files, one worker, and the
/// results so far.
#[derive(Default)]
struct Analyzer {
    queue: Mutex<VecDeque<PathBuf>>,
    wake: Condvar,
    results: Mutex<HashMap<PathBuf, Analysis>>,
}

impl Analyzer {
    fn get(&self, path: &Path) -> Option<Analysis> {
        self.results.lock().unwrap().get(path).copied()
    }

    /// Replaces the queue with `paths` (skipping ones already done), so the
    /// list on screen is analyzed first.
    fn enqueue(&self, paths: impl IntoIterator<Item = PathBuf>) {
        let results = self.results.lock().unwrap();
        let mut queue = self.queue.lock().unwrap();
        queue.clear();
        queue.extend(paths.into_iter().filter(|p| !results.contains_key(p)));
        drop(results);
        self.wake.notify_one();
    }

    /// Records a result found elsewhere (a deck load) and tells the UI.
    fn record(&self, app: &AppHandle, path: PathBuf, analysis: Analysis) {
        self.results.lock().unwrap().insert(path.clone(), analysis);
        let _ = app.emit(
            "library-analysis",
            AnalysisEvent {
                path: path.display().to_string(),
                analysis,
            },
        );
    }

    fn run(self: Arc<Self>, app: AppHandle) {
        loop {
            let path = {
                let mut queue = self.queue.lock().unwrap();
                loop {
                    if let Some(p) = queue.pop_front() {
                        break p;
                    }
                    queue = self.wake.wait(queue).unwrap();
                }
            };
            if self.get(&path).is_some() {
                continue;
            }
            let analysis = TrackSummary::analyze(&path)
                .map(Analysis::from)
                .unwrap_or(Analysis::FAILED);
            self.record(&app, path, analysis);
        }
    }
}

impl Library {
    pub fn load() -> Self {
        let file = dirs::config_dir().map(|d| d.join("oss-dj").join("library.json"));
        let saved = file
            .as_ref()
            .and_then(|f| std::fs::read(f).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            saved: Mutex::new(saved),
            file,
            analyzer: Arc::default(),
        }
    }

    /// Starts the background analysis worker.
    pub fn start_analyzer(&self, app: AppHandle) {
        let analyzer = self.analyzer.clone();
        let _ = std::thread::Builder::new()
            .name("library-analysis".into())
            .spawn(move || analyzer.run(app));
    }

    /// Remembers the analysis of a track that was just loaded onto a deck,
    /// so the library shows it without decoding the file again.
    pub fn loaded(&self, app: &AppHandle, track: &dj_engine::Track) {
        if let Some(path) = &track.path {
            self.analyzer
                .record(app, path.clone(), TrackSummary::of(track).into());
        }
    }

    fn save(&self, saved: &Saved) -> Result<(), String> {
        let Some(file) = &self.file else {
            return Ok(());
        };
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_vec_pretty(saved).map_err(|e| e.to_string())?;
        std::fs::write(file, json).map_err(|e| e.to_string())
    }
}

fn scan(dir: &Path, depth: usize, out: &mut Vec<LibraryTrack>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            scan(&path, depth + 1, out);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext = ext.to_ascii_lowercase();
            if AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                out.push(describe(&path, &ext));
            }
        }
    }
}

/// Fills in artist and title from "Artist - Title" file names until tag
/// reading lands.
fn describe(path: &Path, ext: &str) -> LibraryTrack {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let (artist, title) = match stem.split_once(" - ") {
        Some((a, t)) => (a.trim().to_string(), t.trim().to_string()),
        None => (String::new(), stem.clone()),
    };
    LibraryTrack {
        path: path.display().to_string(),
        title,
        artist,
        folder: path
            .parent()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        format: ext.to_ascii_uppercase(),
        analysis: None,
    }
}

#[tauri::command]
pub fn library_folders(lib: State<'_, Library>) -> Vec<String> {
    lib.saved
        .lock()
        .unwrap()
        .folders
        .iter()
        .map(|p| p.display().to_string())
        .collect()
}

#[tauri::command]
pub fn add_folder(lib: State<'_, Library>, path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err(format!("{} is not a folder", path.display()));
    }
    let mut saved = lib.saved.lock().unwrap();
    if !saved.folders.contains(&path) {
        saved.folders.push(path);
        lib.save(&saved)?;
    }
    Ok(saved
        .folders
        .iter()
        .map(|p| p.display().to_string())
        .collect())
}

#[tauri::command]
pub fn remove_folder(lib: State<'_, Library>, path: String) -> Result<Vec<String>, String> {
    let mut saved = lib.saved.lock().unwrap();
    saved.folders.retain(|p| p != Path::new(&path));
    lib.save(&saved)?;
    Ok(saved
        .folders
        .iter()
        .map(|p| p.display().to_string())
        .collect())
}

/// Lists every audio file in the given folder, or in all folders when
/// `folder` is omitted. Scans on a worker thread, then queues the tracks
/// not yet analyzed for the background analyzer.
#[tauri::command]
pub async fn library_tracks(
    lib: State<'_, Library>,
    folder: Option<String>,
) -> Result<Vec<LibraryTrack>, String> {
    let roots: Vec<PathBuf> = match folder {
        Some(f) => vec![PathBuf::from(f)],
        None => lib.saved.lock().unwrap().folders.clone(),
    };
    let analyzer = lib.analyzer.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for root in roots {
            scan(&root, 0, &mut out);
        }
        out.sort_by(|a, b| (&a.artist, &a.title).cmp(&(&b.artist, &b.title)));
        for t in &mut out {
            t.analysis = analyzer.get(Path::new(&t.path));
        }
        analyzer.enqueue(
            out.iter()
                .filter(|t| t.analysis.is_none())
                .map(|t| PathBuf::from(&t.path)),
        );
        out
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_artist_and_title_from_file_name() {
        let t = describe(
            Path::new("/music/House/Daft Punk - Around the World.mp3"),
            "mp3",
        );
        assert_eq!(t.artist, "Daft Punk");
        assert_eq!(t.title, "Around the World");
        assert_eq!(t.folder, "House");
        assert_eq!(t.format, "MP3");
    }

    #[test]
    fn analyzer_queue_skips_analyzed_tracks_and_replaces_the_old_list() {
        let a = Analyzer::default();
        a.results
            .lock()
            .unwrap()
            .insert("/m/done.mp3".into(), Analysis::FAILED);
        a.enqueue(["/m/old.mp3".into()]);
        a.enqueue(["/m/done.mp3".into(), "/m/new.mp3".into()]);
        let queue: Vec<_> = a.queue.lock().unwrap().iter().cloned().collect();
        assert_eq!(queue, [PathBuf::from("/m/new.mp3")]);
    }

    #[test]
    fn file_without_separator_is_all_title() {
        let t = describe(Path::new("/music/untitled_04.wav"), "wav");
        assert_eq!(t.artist, "");
        assert_eq!(t.title, "untitled_04");
    }
}
