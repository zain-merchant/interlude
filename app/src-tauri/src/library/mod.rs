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
mod import;
mod tags;

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};

use dj_engine::{
    Beatgrid, DeckSnapshot, Loudness, SavedCues, SharedState, TrackSummary, NUM_DECKS,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use db::{Db, FileStat, Health};

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "mp4", "flac", "wav", "aif", "aiff", "ogg", "oga", "caf",
];
/// Guards against symlink loops and accidentally adding `/`.
const MAX_DEPTH: usize = 12;
/// How often the cue saver looks at the decks.
const CUE_SAVE_INTERVAL: Duration = Duration::from_millis(250);
/// A track counts as played, and goes into History, after this long on air.
const PLAYED_AFTER_SECS: f64 = 30.0;

pub struct Library {
    db: Arc<Mutex<Db>>,
    analyzer: Arc<Analyzer>,
    watches: Mutex<[Option<CueWatch>; NUM_DECKS]>,
    shared: OnceLock<Arc<SharedState>>,
    app: OnceLock<AppHandle>,
    health: Health,
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
    /// Length, BPM and key once analyzed; `None` until then. Kept, marked
    /// outdated, while a newer analyzer redoes it.
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
    /// `None` for tracks analyzed before loudness was measured, until the
    /// analyzer gets back to them.
    loudness: Option<Loudness>,
    failed: bool,
    /// Found by an older analyzer. Shown until the analyzer redoes it, so
    /// an update that improves detection doesn't blank the library.
    outdated: bool,
}

impl From<TrackSummary> for Analysis {
    fn from(s: TrackSummary) -> Self {
        Self {
            duration: Some(s.duration),
            bpm: s.bpm,
            key: s.key,
            loudness: Some(s.loudness),
            failed: false,
            outdated: false,
        }
    }
}

impl Analysis {
    const FAILED: Self = Self {
        duration: None,
        bpm: None,
        key: None,
        loudness: None,
        failed: true,
        outdated: false,
    };

    /// Nothing left to analyze: everything is measured by the current
    /// analyzer, or the file couldn't be decoded.
    fn complete(&self) -> bool {
        !self.outdated && (self.failed || self.loudness.is_some())
    }
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

    /// Saves a result and tells the UI. `first_beat` and `neural` describe
    /// the grid found, as [`Db::save_analysis`] takes them.
    fn record(
        &self,
        app: &AppHandle,
        path: &Path,
        analysis: Analysis,
        first_beat: Option<f64>,
        neural: bool,
    ) {
        let db = self.db.lock().unwrap();
        if let Err(e) = db.save_analysis(path, &analysis, first_beat, neural) {
            eprintln!("could not save analysis of {}: {e}", path.display());
        }
        // Report what's saved: a BPM fixed by hand wins over the detected one.
        let analysis = db.analysis(path).ok().flatten().unwrap_or(analysis);
        drop(db);
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
            if self.get(&path).is_some_and(|a| a.complete()) {
                continue;
            }
            // A malformed file can make a decoder panic. Caught here, it
            // marks that one file as failed; uncaught, it would end this
            // thread and with it all analysis until the app restarts (and
            // then again at the same file).
            let result = std::panic::catch_unwind(|| TrackSummary::analyze(&path));
            let (mut first_beat, mut neural) = (None, false);
            let analysis = match result {
                Ok(Ok(summary)) => {
                    first_beat = summary.grid.map(|g| g.first_beat);
                    neural = summary.neural_grid;
                    Analysis::from(summary)
                }
                // Gone mid-analysis (a drive unplugged, a file moved): try
                // again once it's back, rather than marking it undecodable
                // for good.
                _ if !path.is_file() => continue,
                Ok(Err(_)) => Analysis::FAILED,
                Err(_) => {
                    eprintln!("analysis crashed on {}", path.display());
                    Analysis::FAILED
                }
            };
            self.record(&app, &path, analysis, first_beat, neural);
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
    /// Seconds the track has played on air since it was loaded.
    on_air: f64,
    /// Already in History for this load.
    played: bool,
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
    fn new(path: PathBuf, duration: f64, restored: SavedCues) -> Self {
        Self {
            path,
            duration,
            restored,
            saved: None,
            on_air: 0.0,
            played: false,
        }
    }

    /// The deck shows this watch's track, not the one before it.
    fn shows_track(&self, d: &DeckSnapshot) -> bool {
        d.loaded && (d.duration - self.duration).abs() <= 1e-3
    }

    /// Counts `dt` seconds of the deck playing where the audience hears it
    /// (fader up, crossfader not shut on it). True once, when the track has
    /// been heard long enough to count as played.
    fn listen(&mut self, d: &DeckSnapshot, deck: usize, crossfader: f32, dt: f64) -> bool {
        if self.played || !self.shows_track(d) {
            return false;
        }
        let cut = if deck == 0 {
            crossfader >= 0.99
        } else {
            crossfader <= -0.99
        };
        if d.playing && d.fader > 0.01 && !cut {
            self.on_air += dt;
        }
        self.played = self.on_air >= PLAYED_AFTER_SECS;
        self.played
    }

    /// Given the deck's state now, the cues to save, if they changed.
    fn check(&mut self, d: &DeckSnapshot) -> Option<SavedCues> {
        if !self.shows_track(d) {
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
        let dir = crate::paths::data_dir();
        let (db, health) = match &dir {
            Some(d) => Db::open_or_recover(&d.join("library.db")),
            None => (
                Db::open_in_memory().expect("in-memory library"),
                Health::Unsaved {
                    reason: "there's no folder to keep it in".into(),
                },
            ),
        };
        import_old_folders(&db);
        let db = Arc::new(Mutex::new(db));
        Self {
            analyzer: Arc::new(Analyzer::new(db.clone())),
            db,
            health,
            watches: Mutex::default(),
            shared: OnceLock::new(),
            app: OnceLock::new(),
        }
    }

    /// Starts the background analysis worker and lets the cue saver see
    /// the decks.
    pub fn start(&self, app: AppHandle, shared: Arc<SharedState>) {
        let analyzer = self.analyzer.clone();
        let _ = self.app.set(app.clone());
        let _ = std::thread::Builder::new()
            .name("library-analysis".into())
            .spawn(move || {
                // Below the audio, the UI and other apps.
                dj_engine::background::lower();
                analyzer.run(app)
            });
        let _ = self.shared.set(shared);
    }

    /// Saves any cue changes on a deck, and counts `dt` seconds towards
    /// its track being played. Called by the deck watcher thread, and before
    /// a deck is emptied so its last change isn't lost.
    fn watch_deck(&self, deck: usize, dt: f64) {
        let Some(shared) = self.shared.get() else {
            return;
        };
        let mut watches = self.watches.lock().unwrap();
        let Some(w) = watches.get_mut(deck).and_then(|w| w.as_mut()) else {
            return;
        };
        let d = shared.deck(deck);
        if let Some(cues) = w.check(&d) {
            if let Err(e) = self.db.lock().unwrap().save_cues(&w.path, &cues) {
                eprintln!("could not save cues for {}: {e}", w.path.display());
            }
        }
        if w.listen(&d, deck, shared.mixer().crossfader, dt) {
            let now = chrono::Utc::now().timestamp_millis();
            if let Err(e) = self.db.lock().unwrap().record_play(&w.path, now) {
                eprintln!("could not add {} to History: {e}", w.path.display());
            }
            if let Some(app) = self.app.get() {
                let _ = app.emit("library-played", w.path.display().to_string());
            }
        }
    }

    /// Watches the decks until the app quits: saves cue changes and adds
    /// tracks to History once they've played.
    pub fn run_deck_watcher(&self) {
        let mut last = std::time::Instant::now();
        loop {
            std::thread::sleep(CUE_SAVE_INTERVAL);
            let now = std::time::Instant::now();
            let dt = (now - last).as_secs_f64();
            last = now;
            for deck in 0..NUM_DECKS {
                self.watch_deck(deck, dt);
            }
        }
    }

    /// Saves a beatgrid fixed by hand (locked against analysis), or with
    /// `None` goes back to `detected`, and updates the library's BPM.
    pub fn save_grid(
        &self,
        app: &AppHandle,
        path: &Path,
        grid: Option<Beatgrid>,
        detected: Option<Beatgrid>,
    ) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        db.save_grid(path, grid, detected)
            .map_err(|e| e.to_string())?;
        if let Ok(Some(analysis)) = db.analysis(path) {
            let _ = app.emit(
                "library-analysis",
                AnalysisEvent {
                    path: path.display().to_string(),
                    analysis,
                },
            );
        }
        Ok(())
    }

    /// What the library's analysis already knows about a file, so loading
    /// it onto a deck skips working that out again (key detection alone is
    /// most of a load). Only a complete, current analysis counts; the grid
    /// only once Beat This! has found it, since the DSP grid it refines
    /// isn't saved.
    pub fn known(&self, path: &Path) -> dj_engine::Known {
        let db = self.db.lock().unwrap();
        let mut known = dj_engine::Known::default();
        if let Ok(Some(a)) = db.analysis(path) {
            if !a.outdated && !a.failed {
                if let Some(loudness) = a.loudness {
                    known.key = Some(a.key);
                    known.loudness = Some(loudness);
                }
            }
        }
        if let Ok(Some(grid)) = db.neural_grid(path) {
            known.beatgrid = Some(Some(grid));
        }
        known
    }

    /// Saves the analysis of a track that was just loaded onto a deck, so
    /// the library shows it without decoding the file again, and returns
    /// what to put back on the deck: its saved cue points, its beatgrid if
    /// one was fixed by hand, and the grid Beat This! found if it has run.
    /// `known` is what the load took from the library instead of analyzing
    /// ([`Library::known`]); with all of it, there's nothing new to save.
    pub fn loaded(
        &self,
        app: &AppHandle,
        deck: usize,
        track: &dj_engine::Track,
        known: dj_engine::Known,
    ) -> (SavedCues, Option<Beatgrid>, Option<Beatgrid>) {
        // The deck still holds the track being replaced: keep its last change.
        self.watch_deck(deck, 0.0);
        let Some(path) = &track.path else {
            self.unwatch(deck);
            return (SavedCues::default(), None, None);
        };
        if known.key.is_none() || known.loudness.is_none() {
            self.analyzer.record(
                app,
                path,
                TrackSummary::of(track).into(),
                track.beatgrid.map(|g| g.first_beat),
                false,
            );
        }
        let cues = self.db.lock().unwrap().cues(path).unwrap_or_else(|e| {
            eprintln!("could not read cues for {}: {e}", path.display());
            SavedCues::default()
        });
        let grid = self.db.lock().unwrap().locked_grid(path).unwrap_or(None);
        let neural = self.db.lock().unwrap().neural_grid(path).unwrap_or(None);
        if let Some(w) = self.watches.lock().unwrap().get_mut(deck) {
            *w = Some(CueWatch::new(path.clone(), track.duration_secs(), cues));
        }
        (cues, grid, neural)
    }

    /// Saves the grid Beat This! found for a track on a deck and tells the
    /// UI its tempo. Returns whether the track's grid was fixed by hand, in
    /// which case nothing changed.
    pub fn save_neural_grid(&self, app: &AppHandle, path: &Path, grid: Beatgrid) -> bool {
        let db = self.db.lock().unwrap();
        if db.locked_grid(path).ok().flatten().is_some() {
            return true;
        }
        if let Err(e) = db.save_neural_grid(path, grid) {
            eprintln!("could not save the grid of {}: {e}", path.display());
        }
        if let Ok(Some(analysis)) = db.analysis(path) {
            let _ = app.emit(
                "library-analysis",
                AnalysisEvent {
                    path: path.display().to_string(),
                    analysis,
                },
            );
        }
        false
    }

    /// Stops saving a deck's cues, saving its last change first.
    pub fn unwatch(&self, deck: usize) {
        self.watch_deck(deck, 0.0);
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

/// How the library file fared when the app opened it, so the UI can say
/// if it was restored from a backup or isn't being saved.
#[tauri::command]
pub fn library_health(lib: State<'_, Library>) -> Health {
    lib.health.clone()
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
                .filter(|t| !t.analysis.is_some_and(|a| a.complete()) && !t.missing)
                .map(|t| PathBuf::from(&t.path)),
        );
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Lists saved tracks without rescanning, and queues the unanalyzed ones.
fn listed(
    lib: &Library,
    rows: rusqlite::Result<Vec<db::Row>>,
) -> Result<Vec<LibraryTrack>, String> {
    let out: Vec<LibraryTrack> = rows
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(list_entry)
        .collect();
    lib.analyzer.enqueue(
        out.iter()
            .filter(|t| !t.analysis.is_some_and(|a| a.complete()) && !t.missing)
            .map(|t| PathBuf::from(&t.path)),
    );
    Ok(out)
}

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub fn playlists(lib: State<'_, Library>) -> Result<Vec<db::Playlist>, String> {
    lib.db.lock().unwrap().playlists().map_err(db_err)
}

/// Makes a playlist, optionally filled with `paths`. Returns its id.
#[tauri::command]
pub fn create_playlist(
    lib: State<'_, Library>,
    name: String,
    paths: Option<Vec<String>>,
) -> Result<i64, String> {
    let db = lib.db.lock().unwrap();
    let id = db.create_playlist(name.trim()).map_err(db_err)?;
    let paths: Vec<PathBuf> = paths
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect();
    db.set_playlist_tracks(id, &paths).map_err(db_err)?;
    Ok(id)
}

#[tauri::command]
pub fn rename_playlist(lib: State<'_, Library>, id: i64, name: String) -> Result<(), String> {
    lib.db
        .lock()
        .unwrap()
        .rename_playlist(id, name.trim())
        .map_err(db_err)
}

#[tauri::command]
pub fn delete_playlist(lib: State<'_, Library>, id: i64) -> Result<(), String> {
    lib.db.lock().unwrap().delete_playlist(id).map_err(db_err)
}

#[tauri::command]
pub fn playlist_tracks(lib: State<'_, Library>, id: i64) -> Result<Vec<LibraryTrack>, String> {
    let rows = lib.db.lock().unwrap().playlist_tracks(id);
    listed(&lib, rows)
}

#[tauri::command]
pub fn add_to_playlist(lib: State<'_, Library>, id: i64, paths: Vec<String>) -> Result<(), String> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    lib.db
        .lock()
        .unwrap()
        .add_to_playlist(id, &paths)
        .map_err(db_err)
}

/// Replaces a playlist's tracks, in order: how the UI reorders and removes.
#[tauri::command]
pub fn set_playlist_tracks(
    lib: State<'_, Library>,
    id: i64,
    paths: Vec<String>,
) -> Result<(), String> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    lib.db
        .lock()
        .unwrap()
        .set_playlist_tracks(id, &paths)
        .map_err(db_err)
}

#[tauri::command]
pub fn history_sessions(lib: State<'_, Library>) -> Result<Vec<db::Session>, String> {
    lib.db.lock().unwrap().sessions().map_err(db_err)
}

#[tauri::command]
pub fn session_tracks(lib: State<'_, Library>, start: i64) -> Result<Vec<LibraryTrack>, String> {
    let rows = lib.db.lock().unwrap().session_tracks(start);
    listed(&lib, rows)
}

/// Rekordbox XML exports found in the usual places, newest first.
#[tauri::command]
pub async fn import_sources() -> Vec<import::Found> {
    tauri::async_runtime::spawn_blocking(import::find_sources)
        .await
        .unwrap_or_default()
}

/// Reads a library to import and says what it would bring over. Changes
/// nothing.
#[tauri::command]
pub async fn import_preview(
    lib: State<'_, Library>,
    source: import::Source,
) -> Result<import::Preview, String> {
    let existing = lib.db.lock().unwrap().folders().map_err(db_err)?;
    tauri::async_runtime::spawn_blocking(move || {
        let c = source.read()?;
        Ok(import::preview(&c, &existing))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
struct ImportProgress {
    done: usize,
    total: usize,
}

/// Imports a library, adding `folders` to the library first. Reports
/// progress as `import-progress` events.
#[tauri::command]
pub async fn import_run(
    app: AppHandle,
    lib: State<'_, Library>,
    source: import::Source,
    options: import::Options,
    folders: Vec<String>,
) -> Result<import::Summary, String> {
    let db = lib.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let c = source.read()?;
        let folders: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
        let db = db.lock().unwrap();
        import::apply(&db, &c, options, &folders, |done, total| {
            let _ = app.emit("import-progress", ImportProgress { done, total });
        })
        .map_err(db_err)
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
        let mut w = CueWatch::new("/m/a.mp3".into(), 200.0, restored);
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
    fn a_track_counts_as_played_after_30_seconds_on_air() {
        let mut w = CueWatch::new("/m/a.mp3".into(), 200.0, SavedCues::default());
        let mut d = deck(&SavedCues::default(), 200.0);
        d.playing = true;
        d.fader = 1.0;
        // Crossfader shut on deck A, or fader down: not heard.
        assert!(!w.listen(&d, 0, 1.0, 40.0));
        d.fader = 0.0;
        assert!(!w.listen(&d, 0, 0.0, 40.0));
        d.fader = 0.8;
        assert!(!w.listen(&d, 0, 0.0, 20.0));
        assert!(w.listen(&d, 0, 0.0, 10.0));
        // Only once per load.
        assert!(!w.listen(&d, 0, 0.0, 60.0));
        // Deck B is shut by the crossfader at the far left.
        let mut b = CueWatch::new("/m/b.mp3".into(), 200.0, SavedCues::default());
        assert!(!b.listen(&d, 1, -1.0, 60.0));
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
