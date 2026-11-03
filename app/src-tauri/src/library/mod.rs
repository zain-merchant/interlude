//! The library: music folders, the tracks in them with their tags and
//! analysis, and each track's cue points, saved in `library.db` (see
//! [`db`]). Search and sorting run in the UI over the track list, which is
//! instant for tens of thousands of tracks.
//!
//! Opening the library rescans its folders, but only files that are new or
//! changed have their tags read again. Files that have gone stay listed as
//! missing, so their cues survive a drive being unplugged.
//!
//! Length, BPM and key come from a background analyzer: one low-key worker
//! thread that decodes unanalyzed tracks one at a time, saves each result
//! and reports it to the UI as a `library-analysis` event.
//!
//! Cue points are saved as they change: a saver thread watches the decks'
//! hot cues, cue point and loop, and writes them for the loaded track.

mod db;
mod tags;

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};

use dj_engine::{DeckSnapshot, SavedCues, SharedState, TrackSummary, NUM_DECKS};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use db::{Db, FileStat};

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "mp4", "flac", "wav", "aif", "aiff", "ogg", "oga", "caf",
];
/// Guards against symlink loops and accidentally adding `/`.
const MAX_DEPTH: usize = 12;
/// How often the cue saver looks at the decks.
const CUE_SAVE_INTERVAL: Duration = Duration::from_millis(250);

pub struct Library {
    db: Arc<Mutex<Db>>,
    analyzer: Arc<Analyzer>,
    watches: Mutex<[Option<CueWatch>; NUM_DECKS]>,
    shared: OnceLock<Arc<SharedState>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    path: String,
    title: String,
    artist: String,
    album: String,
    genre: String,
    folder: String,
    format: String,
    /// The file wasn't found in the last scan. Its cues are kept.
    missing: bool,
    /// Length, BPM and key once analyzed; `None` until then.
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

/// Background track analysis: a queue of files and one worker.
struct Analyzer {
    queue: Mutex<VecDeque<PathBuf>>,
    wake: Condvar,
    db: Arc<Mutex<Db>>,
}

impl Analyzer {
    fn new(db: Arc<Mutex<Db>>) -> Self {
        Self {
            queue: Mutex::default(),
            wake: Condvar::new(),
            db,
        }
    }

    fn get(&self, path: &Path) -> Option<Analysis> {
        self.db.lock().unwrap().analysis(path).ok().flatten()
    }

    /// Replaces the queue with `paths`, so the list on screen is analyzed
    /// first. The worker skips any that are done by the time it gets there.
    fn enqueue(&self, paths: impl IntoIterator<Item = PathBuf>) {
        let mut queue = self.queue.lock().unwrap();
        queue.clear();
        queue.extend(paths);
        self.wake.notify_one();
    }

    /// Saves a result and tells the UI.
    fn record(&self, app: &AppHandle, path: &Path, analysis: Analysis, first_beat: Option<f64>) {
        if let Err(e) = self
            .db
            .lock()
            .unwrap()
            .save_analysis(path, &analysis, first_beat)
        {
            eprintln!("could not save analysis of {}: {e}", path.display());
        }
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
            self.record(&app, &path, analysis, None);
        }
    }
}

/// The track on a deck whose cue points are being saved.
struct CueWatch {
    path: PathBuf,
    duration: f64,
    /// The cues restored on load. Nothing is saved until the deck shows
    /// them, so a deck still showing the previous track can't overwrite
    /// this one's cues.
    restored: SavedCues,
    /// What's saved now, once the deck has shown `restored`.
    saved: Option<SavedCues>,
}

fn cues_of(d: &DeckSnapshot) -> SavedCues {
    SavedCues {
        cue: d.cue,
        hot_cues: d.hot_cues,
        saved_loop: d.loop_in.zip(d.loop_out),
    }
}

/// Equal to within a tenth of a millisecond, which absorbs the round trip
/// through sample frames.
fn same_cues(a: &SavedCues, b: &SavedCues) -> bool {
    let near = |x: f64, y: f64| (x - y).abs() < 1e-4;
    let opt = |x: Option<f64>, y: Option<f64>| match (x, y) {
        (Some(x), Some(y)) => near(x, y),
        (x, y) => x.is_none() && y.is_none(),
    };
    near(a.cue, b.cue)
        && a.hot_cues.iter().zip(&b.hot_cues).all(|(x, y)| opt(*x, *y))
        && opt(a.saved_loop.map(|l| l.0), b.saved_loop.map(|l| l.0))
        && opt(a.saved_loop.map(|l| l.1), b.saved_loop.map(|l| l.1))
}

impl CueWatch {
    /// Given the deck's state now, the cues to save, if they changed.
    fn check(&mut self, d: &DeckSnapshot) -> Option<SavedCues> {
        if !d.loaded || (d.duration - self.duration).abs() > 1e-3 {
            return None;
        }
        let now = cues_of(d);
        match &self.saved {
            None if same_cues(&now, &self.restored) => {
                self.saved = Some(self.restored);
                None
            }
            Some(saved) if !same_cues(&now, saved) => {
                self.saved = Some(now);
                Some(now)
            }
            _ => None,
        }
    }
}

impl Library {
    pub fn load() -> Self {
        let dir = dirs::data_dir().map(|d| d.join("oss-dj"));
        let db = dir
            .as_ref()
            .map(|d| Db::open(&d.join("library.db")))
            .and_then(|r| {
                r.map_err(|e| eprintln!("could not open the library: {e}"))
                    .ok()
            })
            .unwrap_or_else(|| Db::open_in_memory().expect("in-memory library"));
        import_old_folders(&db);
        let db = Arc::new(Mutex::new(db));
        Self {
            analyzer: Arc::new(Analyzer::new(db.clone())),
            db,
            watches: Mutex::default(),
            shared: OnceLock::new(),
        }
    }

    /// Starts the background analysis worker and lets the cue saver see
    /// the decks.
    pub fn start(&self, app: AppHandle, shared: Arc<SharedState>) {
        let analyzer = self.analyzer.clone();
        let _ = std::thread::Builder::new()
            .name("library-analysis".into())
            .spawn(move || analyzer.run(app));
        let _ = self.shared.set(shared);
    }

    /// Saves any cue changes on the decks. Called by the saver thread, and
    /// before a deck is emptied so its last change isn't lost.
    pub fn save_cues(&self, deck: usize) {
        let Some(shared) = self.shared.get() else {
            return;
        };
        let mut watches = self.watches.lock().unwrap();
        let Some(w) = watches.get_mut(deck).and_then(|w| w.as_mut()) else {
            return;
        };
        if let Some(cues) = w.check(&shared.deck(deck)) {
            if let Err(e) = self.db.lock().unwrap().save_cues(&w.path, &cues) {
                eprintln!("could not save cues for {}: {e}", w.path.display());
            }
        }
    }

    /// Runs the cue saver until the app quits.
    pub fn run_cue_saver(&self) {
        loop {
            std::thread::sleep(CUE_SAVE_INTERVAL);
            for deck in 0..NUM_DECKS {
                self.save_cues(deck);
            }
        }
    }

    /// Saves the analysis of a track that was just loaded onto a deck, so
    /// the library shows it without decoding the file again, and returns
    /// its saved cue points to put back on the deck.
    pub fn loaded(&self, app: &AppHandle, deck: usize, track: &dj_engine::Track) -> SavedCues {
        // The deck still holds the track being replaced: keep its last change.
        self.save_cues(deck);
        let Some(path) = &track.path else {
            self.unwatch(deck);
            return SavedCues::default();
        };
        self.analyzer.record(
            app,
            path,
            TrackSummary::of(track).into(),
            track.beatgrid.map(|g| g.first_beat),
        );
        let cues = self.db.lock().unwrap().cues(path).unwrap_or_else(|e| {
            eprintln!("could not read cues for {}: {e}", path.display());
            SavedCues::default()
        });
        if let Some(w) = self.watches.lock().unwrap().get_mut(deck) {
            *w = Some(CueWatch {
                path: path.clone(),
                duration: track.duration_secs(),
                restored: cues,
                saved: None,
            });
        }
        cues
    }

    /// Stops saving a deck's cues, saving its last change first.
    pub fn unwatch(&self, deck: usize) {
        self.save_cues(deck);
        if let Some(w) = self.watches.lock().unwrap().get_mut(deck) {
            *w = None;
        }
    }

    fn folders(&self) -> Result<Vec<String>, String> {
        Ok(self
            .db
            .lock()
            .unwrap()
            .folders()
            .map_err(|e| e.to_string())?
            .iter()
            .map(|p| p.display().to_string())
            .collect())
    }
}

/// Brings over the folder list from `library.json`, which held it before
/// the library moved to SQLite. The old file is left as it was.
fn import_old_folders(db: &Db) {
    #[derive(Deserialize)]
    struct Old {
        folders: Vec<PathBuf>,
    }
    if !db.folders().map(|f| f.is_empty()).unwrap_or(false) {
        return;
    }
    let Some(old) = dirs::config_dir()
        .map(|d| d.join("oss-dj").join("library.json"))
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice::<Old>(&b).ok())
    else {
        return;
    };
    for f in old.folders {
        let _ = db.add_folder(&f);
    }
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Finds every audio file under `dir`, with its size and modified time.
fn walk(dir: &Path, depth: usize, out: &mut Vec<FileStat>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            walk(&path, depth + 1, out);
        } else if is_audio(&path) {
            let Ok(meta) = entry.metadata() else { continue };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as i64);
            out.push(FileStat {
                path,
                size: meta.len(),
                modified,
            });
        }
    }
}

/// Reads the tags of `files` on a few threads.
fn read_tags(files: Vec<FileStat>) -> Vec<(FileStat, tags::Tags)> {
    let threads = std::thread::available_parallelism().map_or(2, |n| n.get().min(4));
    let chunk = files.len().div_ceil(threads).max(1);
    std::thread::scope(|s| {
        let jobs: Vec<_> = files
            .chunks(chunk)
            .map(|c| {
                s.spawn(move || {
                    c.iter()
                        .map(|f| (f.clone(), tags::read(&f.path)))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        jobs.into_iter()
            .flat_map(|j| j.join().unwrap_or_default())
            .collect()
    })
}

/// Rescans `roots`, saves what changed and returns their tracks.
fn sync(db: &Mutex<Db>, roots: &[PathBuf]) -> rusqlite::Result<Vec<db::Row>> {
    let mut found = Vec::new();
    for root in roots {
        walk(root, 0, &mut found);
    }
    let stale = db.lock().unwrap().stale(&found)?;
    // Tags are read without holding the lock, so analysis and cue saving
    // carry on during a long first scan.
    let read = read_tags(stale);
    let db = db.lock().unwrap();
    db.apply_scan(roots, &found, &read)?;
    db.tracks(roots)
}

fn list_entry(row: db::Row) -> LibraryTrack {
    let p = &row.path;
    LibraryTrack {
        path: p.display().to_string(),
        title: row.tags.title,
        artist: row.tags.artist,
        album: row.tags.album,
        genre: row.tags.genre,
        folder: p
            .parent()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        format: p
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_uppercase())
            .unwrap_or_default(),
        missing: row.missing,
        analysis: row.analysis,
    }
}

#[tauri::command]
pub fn library_folders(lib: State<'_, Library>) -> Result<Vec<String>, String> {
    lib.folders()
}

#[tauri::command]
pub fn add_folder(lib: State<'_, Library>, path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err(format!("{} is not a folder", path.display()));
    }
    lib.db
        .lock()
        .unwrap()
        .add_folder(&path)
        .map_err(|e| e.to_string())?;
    lib.folders()
}

#[tauri::command]
pub fn remove_folder(lib: State<'_, Library>, path: String) -> Result<Vec<String>, String> {
    lib.db
        .lock()
        .unwrap()
        .remove_folder(Path::new(&path))
        .map_err(|e| e.to_string())?;
    lib.folders()
}

/// Lists every track in the given folder, or in all folders when `folder`
/// is omitted, after rescanning it. Then queues the tracks not yet analyzed
/// for the background analyzer.
#[tauri::command]
pub async fn library_tracks(
    lib: State<'_, Library>,
    folder: Option<String>,
) -> Result<Vec<LibraryTrack>, String> {
    let roots: Vec<PathBuf> = match folder {
        Some(f) => vec![PathBuf::from(f)],
        None => lib
            .db
            .lock()
            .unwrap()
            .folders()
            .map_err(|e| e.to_string())?,
    };
    let db = lib.db.clone();
    let analyzer = lib.analyzer.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let rows = sync(&db, &roots).map_err(|e| e.to_string())?;
        let mut out: Vec<LibraryTrack> = rows.into_iter().map(list_entry).collect();
        out.sort_by(|a, b| (&a.artist, &a.title).cmp(&(&b.artist, &b.title)));
        analyzer.enqueue(
            out.iter()
                .filter(|t| t.analysis.is_none() && !t.missing)
                .map(|t| PathBuf::from(&t.path)),
        );
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn deck(cues: &SavedCues, duration: f64) -> DeckSnapshot {
        let mut d = DeckSnapshot {
            loaded: true,
            duration,
            ..DeckSnapshot::default()
        };
        d.cue = cues.cue;
        d.hot_cues = cues.hot_cues;
        d.loop_in = cues.saved_loop.map(|l| l.0);
        d.loop_out = cues.saved_loop.map(|l| l.1);
        d
    }

    #[test]
    fn cue_saver_waits_for_the_restored_cues_then_saves_changes() {
        let mut restored = SavedCues {
            cue: 3.0,
            ..SavedCues::default()
        };
        restored.hot_cues[0] = Some(10.0);
        let mut w = CueWatch {
            path: "/m/a.mp3".into(),
            duration: 200.0,
            restored,
            saved: None,
        };
        // The deck still shows the previous track: nothing saved.
        assert_eq!(w.check(&deck(&SavedCues::default(), 150.0)), None);
        assert_eq!(w.check(&deck(&SavedCues::default(), 200.0)), None);
        // The restored cues arrive: armed, nothing to save.
        assert_eq!(w.check(&deck(&restored, 200.0)), None);
        // A new hot cue is saved once.
        let mut changed = restored;
        changed.hot_cues[3] = Some(42.0);
        assert_eq!(w.check(&deck(&changed, 200.0)), Some(changed));
        assert_eq!(w.check(&deck(&changed, 200.0)), None);
        // Ejected: nothing.
        let mut empty = deck(&SavedCues::default(), 0.0);
        empty.loaded = false;
        assert_eq!(w.check(&empty), None);
    }

    /// A tiny silent WAV file.
    pub(super) fn write_wav(path: &Path) {
        let data = [0u8; 400];
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes()); // PCM
        b.extend_from_slice(&2u16.to_le_bytes()); // stereo
        b.extend_from_slice(&44_100u32.to_le_bytes());
        b.extend_from_slice(&(44_100u32 * 4).to_le_bytes());
        b.extend_from_slice(&4u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&(data.len() as u32).to_le_bytes());
        b.extend_from_slice(&data);
        std::fs::write(path, b).unwrap();
    }

    #[test]
    fn scanning_a_real_folder_finds_files_and_marks_deleted_ones_missing() {
        let dir = std::env::temp_dir().join(format!("oss-dj-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("House")).unwrap();
        write_wav(&dir.join("House/Artist - One.wav"));
        write_wav(&dir.join("Two.wav"));
        std::fs::write(dir.join("notes.txt"), "not audio").unwrap();
        let db = Mutex::new(Db::open_in_memory().unwrap());
        let roots = vec![dir.clone()];

        let mut rows = sync(&db, &roots).unwrap();
        rows.sort_by(|a, b| a.path.cmp(&b.path));
        let titles: Vec<_> = rows.iter().map(|r| r.tags.title.as_str()).collect();
        assert_eq!(titles, ["One", "Two"]);
        assert_eq!(rows[0].tags.artist, "Artist");

        std::fs::remove_file(dir.join("Two.wav")).unwrap();
        let rows = sync(&db, &roots).unwrap();
        let two = rows.iter().find(|r| r.tags.title == "Two").unwrap();
        assert!(two.missing);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn audio_files_are_found_by_extension() {
        assert!(is_audio(Path::new("/m/a.MP3")));
        assert!(is_audio(Path::new("/m/a.flac")));
        assert!(!is_audio(Path::new("/m/cover.jpg")));
    }

    #[test]
    fn list_entry_names_the_folder_and_format() {
        let t = list_entry(db::Row {
            path: "/music/House/Daft Punk - Around the World.mp3".into(),
            tags: tags::Tags::default(),
            missing: false,
            analysis: None,
        });
        assert_eq!(t.folder, "House");
        assert_eq!(t.format, "MP3");
    }
}
