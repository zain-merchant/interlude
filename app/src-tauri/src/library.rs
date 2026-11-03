//! Phase 1 library: a list of watched folders and the audio files in them.
//!
//! Folders are saved to `<config dir>/oss-dj/library.json`. Search runs in
//! the UI over the file list, which is instant for tens of thousands of
//! tracks. Tags, analysis results and crates move to SQLite in Phase 2.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

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
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    path: String,
    title: String,
    artist: String,
    folder: String,
    format: String,
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
/// `folder` is omitted. Scans on a worker thread.
#[tauri::command]
pub async fn library_tracks(
    lib: State<'_, Library>,
    folder: Option<String>,
) -> Result<Vec<LibraryTrack>, String> {
    let roots: Vec<PathBuf> = match folder {
        Some(f) => vec![PathBuf::from(f)],
        None => lib.saved.lock().unwrap().folders.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for root in roots {
            scan(&root, 0, &mut out);
        }
        out.sort_by(|a, b| (&a.artist, &a.title).cmp(&(&b.artist, &b.title)));
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
    fn file_without_separator_is_all_title() {
        let t = describe(Path::new("/music/untitled_04.wav"), "wav");
        assert_eq!(t.artist, "");
        assert_eq!(t.title, "untitled_04");
    }
}
