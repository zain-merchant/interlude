//! The saved library: one SQLite file holding the music folders, every
//! track found in them with its tags and analysis, and each track's cue
//! points. Music files themselves are never written.
//!
//! Schema changes are numbered migrations, run on open. Once a day, and
//! before any migration, the file is copied to `backups/` (the last 7 are
//! kept).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use dj_engine::{Beatgrid, Key, Loudness, SavedCues, HOT_CUES};
use rusqlite::{params, Connection, OptionalExtension};

use super::tags::Tags;
use super::Analysis;

/// Bumped when BPM or key detection changes enough that saved results
/// should be redone. Tracks analyzed by an older version keep showing their
/// old results while they're analyzed again in the background.
pub const ANALYSIS_VERSION: i64 = 4;

const BACKUPS_KEPT: usize = 7;

/// Each entry upgrades the schema by one version. Never edit one that has
/// shipped; add a new one.
const MIGRATIONS: &[&str] = &[
    // 1: folders, tracks with tags and analysis, cue points.
    "CREATE TABLE folders (
         path TEXT PRIMARY KEY
     );
     CREATE TABLE tracks (
         id INTEGER PRIMARY KEY,
         path TEXT NOT NULL UNIQUE,
         size INTEGER,
         modified INTEGER,
         missing INTEGER NOT NULL DEFAULT 0,
         added_at INTEGER NOT NULL,
         title TEXT NOT NULL DEFAULT '',
         artist TEXT NOT NULL DEFAULT '',
         album TEXT NOT NULL DEFAULT '',
         genre TEXT NOT NULL DEFAULT '',
         analysis_version INTEGER,
         analysis_failed INTEGER NOT NULL DEFAULT 0,
         duration REAL,
         bpm REAL,
         first_beat REAL,
         key_tonic INTEGER,
         key_minor INTEGER
     );
     -- kind: 0 main cue, 1 hot cue, 2 loop. Positions in seconds.
     CREATE TABLE cues (
         track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         kind INTEGER NOT NULL,
         slot INTEGER NOT NULL,
         start REAL NOT NULL,
         end REAL,
         PRIMARY KEY (track_id, kind, slot)
     );",
    // 2: playlists and play history.
    "CREATE TABLE playlists (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         position INTEGER NOT NULL
     );
     CREATE TABLE playlist_tracks (
         playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
         track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         position INTEGER NOT NULL,
         PRIMARY KEY (playlist_id, track_id)
     );
     CREATE TABLE history (
         id INTEGER PRIMARY KEY,
         track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         played_at INTEGER NOT NULL
     );
     CREATE INDEX history_played_at ON history (played_at);",
    // 3: beatgrids fixed by hand, which analysis leaves alone.
    "ALTER TABLE tracks ADD COLUMN grid_locked INTEGER NOT NULL DEFAULT 0;",
    // 4: loudness, for auto gain. `lufs` is NULL for silence; `peak` is
    // NULL until measured.
    "ALTER TABLE tracks ADD COLUMN lufs REAL;
     ALTER TABLE tracks ADD COLUMN peak REAL;",
    // 5: the grid (bpm, first_beat) came from Beat This!, so a quicker DSP
    // result doesn't replace it.
    "ALTER TABLE tracks ADD COLUMN grid_neural INTEGER NOT NULL DEFAULT 0;",
];

/// Plays further apart than this start a new history session, so a night
/// that runs past midnight stays one session.
const SESSION_GAP_MS: i64 = 4 * 60 * 60 * 1000;

const MAIN_CUE: i64 = 0;
const HOT_CUE: i64 = 1;
const LOOP: i64 = 2;

/// The columns `row_from` reads, from `tracks`.
const ROW_COLUMNS: &str = "tracks.path, tracks.title, tracks.artist, tracks.album, tracks.genre,
     tracks.missing, tracks.analysis_version, tracks.analysis_failed, tracks.duration,
     tracks.bpm, tracks.key_tonic, tracks.key_minor, tracks.lufs, tracks.peak";

fn row_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<Row> {
    Ok(Row {
        path: PathBuf::from(r.get::<_, String>(0)?),
        tags: Tags {
            title: r.get(1)?,
            artist: r.get(2)?,
            album: r.get(3)?,
            genre: r.get(4)?,
        },
        missing: r.get(5)?,
        analysis: analysis_from(r, 6)?,
    })
}

/// A playlist as the sidebar lists it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub count: usize,
}

/// One stretch of playing, as History lists it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Session {
    /// When its first track was played (ms since 1970). Also its id.
    pub start: i64,
    pub count: usize,
}

/// A file found on disk by a folder scan.
#[derive(Debug, Clone, PartialEq)]
pub struct FileStat {
    pub path: PathBuf,
    pub size: u64,
    /// Modified time, in milliseconds since 1970.
    pub modified: i64,
}

/// A track as the library lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub path: PathBuf,
    pub tags: Tags,
    pub missing: bool,
    pub analysis: Option<Analysis>,
}

pub struct Db {
    conn: Connection,
}

/// How the library file fared when the app opened it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Health {
    Ok,
    /// The file was damaged. It was set aside and the newest good backup,
    /// from `backup` (its file name), put in its place.
    #[serde(rename_all = "camelCase")]
    Restored {
        backup: String,
        damaged: PathBuf,
    },
    /// The file was damaged and there was no good backup. It was set aside
    /// and a new, empty library started.
    #[serde(rename_all = "camelCase")]
    Fresh {
        damaged: PathBuf,
    },
    /// The file couldn't be opened at all (in use by another copy of the
    /// app, or not readable), so this session's library isn't saved.
    Unsaved {
        reason: String,
    },
}

/// True for errors that mean the file itself is broken, rather than
/// busy or out of reach.
fn is_damage(e: &rusqlite::Error) -> bool {
    use rusqlite::ErrorCode::{DatabaseCorrupt, NotADatabase};
    matches!(e, rusqlite::Error::SqliteFailure(f, _) if matches!(f.code, DatabaseCorrupt | NotADatabase))
}

fn is_busy(e: &rusqlite::Error) -> bool {
    use rusqlite::ErrorCode::{DatabaseBusy, DatabaseLocked};
    matches!(e, rusqlite::Error::SqliteFailure(f, _) if matches!(f.code, DatabaseBusy | DatabaseLocked))
}

/// Opens `file`: Ok(None) when it's damaged.
fn open_checked(file: &Path) -> rusqlite::Result<Option<Db>> {
    match Db::open(file) {
        Ok(db) => Ok(Some(db)),
        Err(e) if is_damage(&e) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Fails with `DatabaseCorrupt` unless SQLite's quick check passes.
fn check_sound(conn: &Connection) -> rusqlite::Result<()> {
    let result: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
            Some(result),
        ))
    }
}

/// Moves a damaged library (and its WAL files) out of the way, keeping it
/// next to the original in case it can be rescued. Returns where it went.
fn set_aside(file: &Path) -> std::io::Result<PathBuf> {
    let stamp = chrono::Local::now().format("%Y-%m-%d %H.%M.%S");
    let aside = file.with_file_name(format!("library (damaged {stamp}).db"));
    std::fs::rename(file, &aside)?;
    for ext in ["-wal", "-shm"] {
        let mut from = file.as_os_str().to_owned();
        from.push(ext);
        let mut to = aside.as_os_str().to_owned();
        to.push(ext);
        let _ = std::fs::rename(&from, &to);
    }
    Ok(aside)
}

/// The library's backups, newest first.
fn backups(file: &Path) -> Vec<PathBuf> {
    let Some(dir) = file.parent().map(|d| d.join("backups")) else {
        return Vec::new();
    };
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("library-") && n.ends_with(".db"))
        })
        .filter_map(|p| {
            let meta = p.metadata().ok()?;
            (meta.len() > 0).then_some(())?;
            Some((meta.modified().ok()?, p))
        })
        .collect();
    found.sort_by_key(|f| std::cmp::Reverse(f.0));
    found.into_iter().map(|(_, p)| p).collect()
}

impl Db {
    /// Opens the library at `file`, never losing it silently:
    /// - a damaged file is set aside and the newest good backup restored
    ///   (or, with none, a new library started);
    /// - a file that can't be opened at all is left alone, and the app runs
    ///   on a library that lasts until quit.
    ///
    /// The `Health` says which happened, so the user can be told.
    pub fn open_or_recover(file: &Path) -> (Self, Health) {
        let unsaved = |e: rusqlite::Error| {
            eprintln!("could not open the library: {e}");
            let reason = if is_busy(&e) {
                "another copy of Interlude is using it".to_string()
            } else {
                e.to_string()
            };
            let db = Self::open_in_memory().expect("in-memory library");
            (db, Health::Unsaved { reason })
        };
        match open_checked(file) {
            Ok(Some(db)) => return (db, Health::Ok),
            Ok(None) => {}
            Err(e) => return unsaved(e),
        }
        eprintln!("the library at {} is damaged", file.display());
        let damaged = match set_aside(file) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("could not move the damaged library aside: {e}");
                let db = Self::open_in_memory().expect("in-memory library");
                let reason =
                    format!("the library file is damaged and couldn't be moved aside ({e})");
                return (db, Health::Unsaved { reason });
            }
        };
        for backup in backups(file) {
            if std::fs::copy(&backup, file).is_err() {
                continue;
            }
            match open_checked(file) {
                Ok(Some(db)) => {
                    let name = backup
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    eprintln!("restored the library from {}", backup.display());
                    return (
                        db,
                        Health::Restored {
                            backup: name,
                            damaged,
                        },
                    );
                }
                _ => {
                    let _ = std::fs::remove_file(file);
                }
            }
        }
        match Self::open(file) {
            Ok(db) => (db, Health::Fresh { damaged }),
            Err(e) => unsaved(e),
        }
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn path_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

impl Db {
    /// Opens (or creates) the library at `file`, backing it up first when
    /// a backup is due. Fails with `DatabaseCorrupt` or `NotADatabase` if
    /// the file is damaged.
    pub fn open(file: &Path) -> rusqlite::Result<Self> {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let conn = Connection::open(file)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        // Safe with WAL: a crash can lose the last commit, never corrupt the file.
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        // Before the backup, so a damaged file never replaces a good one.
        check_sound(&conn)?;
        let db = Self::setup(conn)?;
        db.back_up(file);
        db.migrate()?;
        Ok(db)
    }

    /// A library that lasts until quit, for when the file can't be opened.
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let db = Self::setup(Connection::open_in_memory()?)?;
        db.migrate()?;
        Ok(db)
    }

    fn setup(conn: Connection) -> rusqlite::Result<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(2))?;
        Ok(Self { conn })
    }

    fn version(&self) -> rusqlite::Result<usize> {
        self.conn
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .map(|v| v as usize)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let from = self.version()?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(from) {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", (i + 1) as i64)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// Copies the library to `backups/` once a day, and before a schema
    /// upgrade, keeping the newest few. Failure here never stops the app.
    fn back_up(&self, file: &Path) {
        let Ok(version) = self.version() else { return };
        if version == 0 {
            return; // brand new, nothing to keep
        }
        let Some(dir) = file.parent().map(|d| d.join("backups")) else {
            return;
        };
        let _ = std::fs::create_dir_all(&dir);
        let today = chrono::Local::now().format("%Y-%m-%d");
        let name = if version < MIGRATIONS.len() {
            format!("library-{today}-before-v{}.db", version + 1)
        } else {
            format!("library-{today}.db")
        };
        let target = dir.join(name);
        if !target.exists() {
            if let Err(e) = self
                .conn
                .execute("VACUUM INTO ?1", params![path_str(&target)])
            {
                eprintln!("library backup failed: {e}");
                return;
            }
        }
        let mut old: Vec<PathBuf> = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("library-") && n.ends_with(".db"))
            })
            .collect();
        old.sort();
        let excess = old.len().saturating_sub(BACKUPS_KEPT);
        for p in &old[..excess] {
            let _ = std::fs::remove_file(p);
        }
    }

    pub fn folders(&self) -> rusqlite::Result<Vec<PathBuf>> {
        let mut st = self
            .conn
            .prepare("SELECT path FROM folders ORDER BY rowid")?;
        let rows = st.query_map([], |r| r.get::<_, String>(0))?;
        rows.map(|r| r.map(PathBuf::from)).collect()
    }

    pub fn add_folder(&self, path: &Path) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO folders (path) VALUES (?1)",
            params![path_str(path)],
        )?;
        Ok(())
    }

    /// Forgets a folder. Its tracks stay saved, with their cues, so adding
    /// the folder back restores them; they're just no longer listed.
    pub fn remove_folder(&self, path: &Path) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM folders WHERE path = ?1",
            params![path_str(path)],
        )?;
        Ok(())
    }

    /// Of the files a scan found, the ones that are new or changed since
    /// they were last read, so only those have their tags read again.
    pub fn stale(&self, files: &[FileStat]) -> rusqlite::Result<Vec<FileStat>> {
        let mut st = self
            .conn
            .prepare("SELECT path, size, modified FROM tracks WHERE size IS NOT NULL")?;
        let known: HashMap<String, (i64, i64)> = st
            .query_map([], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(files
            .iter()
            .filter(|f| known.get(&path_str(&f.path)) != Some(&(f.size as i64, f.modified)))
            .cloned()
            .collect())
    }

    /// Saves the result of scanning `roots`: `read` holds the tags of the
    /// new and changed files, `found` every file seen. Saved tracks under
    /// `roots` that weren't seen are marked missing; their cues are kept.
    pub fn apply_scan(
        &self,
        roots: &[PathBuf],
        found: &[FileStat],
        read: &[(FileStat, Tags)],
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut upsert = tx.prepare(
                "INSERT INTO tracks (path, size, modified, added_at, title, artist, album, genre)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT (path) DO UPDATE SET size = ?2, modified = ?3, missing = 0,
                     title = ?5, artist = ?6, album = ?7, genre = ?8",
            )?;
            let now = now_ms();
            for (f, t) in read {
                upsert.execute(params![
                    path_str(&f.path),
                    f.size as i64,
                    f.modified,
                    now,
                    t.title,
                    t.artist,
                    t.album,
                    t.genre
                ])?;
            }
            let seen: std::collections::HashSet<String> =
                found.iter().map(|f| path_str(&f.path)).collect();
            let mut all = tx.prepare("SELECT id, path, missing FROM tracks")?;
            let rows: Vec<(i64, String, bool)> = all
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
                .collect::<rusqlite::Result<_>>()?;
            let mut mark = tx.prepare("UPDATE tracks SET missing = ?2 WHERE id = ?1")?;
            for (id, path, missing) in rows {
                if !roots.iter().any(|r| Path::new(&path).starts_with(r)) {
                    continue;
                }
                let now_missing = !seen.contains(&path);
                if now_missing != missing {
                    mark.execute(params![id, now_missing])?;
                }
            }
        }
        tx.commit()
    }

    /// Every saved track under one of `roots`, missing ones included.
    pub fn tracks(&self, roots: &[PathBuf]) -> rusqlite::Result<Vec<Row>> {
        let mut st = self
            .conn
            .prepare(&format!("SELECT {ROW_COLUMNS} FROM tracks"))?;
        let rows = st.query_map([], row_from)?;
        let mut out = Vec::new();
        for row in rows {
            let row = row?;
            if roots.iter().any(|root| row.path.starts_with(root)) {
                out.push(row);
            }
        }
        Ok(out)
    }

    pub fn playlists(&self) -> rusqlite::Result<Vec<Playlist>> {
        let mut st = self.conn.prepare(
            "SELECT id, name, (SELECT count(*) FROM playlist_tracks WHERE playlist_id = id)
             FROM playlists ORDER BY position, id",
        )?;
        let rows = st.query_map([], |r| {
            Ok(Playlist {
                id: r.get(0)?,
                name: r.get(1)?,
                count: r.get::<_, i64>(2)? as usize,
            })
        })?;
        rows.collect()
    }

    /// Adds an empty playlist at the end of the list. Returns its id.
    pub fn create_playlist(&self, name: &str) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO playlists (name, position)
             VALUES (?1, (SELECT coalesce(max(position), -1) + 1 FROM playlists))",
            params![name],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn rename_playlist(&self, id: i64, name: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE playlists SET name = ?2 WHERE id = ?1",
            params![id, name],
        )?;
        Ok(())
    }

    /// Deletes a playlist. The tracks stay in the library.
    pub fn delete_playlist(&self, id: i64) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// A playlist's tracks, in order.
    pub fn playlist_tracks(&self, id: i64) -> rusqlite::Result<Vec<Row>> {
        let mut st = self.conn.prepare(&format!(
            "SELECT {ROW_COLUMNS} FROM playlist_tracks
             JOIN tracks ON tracks.id = playlist_tracks.track_id
             WHERE playlist_id = ?1 ORDER BY playlist_tracks.position"
        ))?;
        let rows = st.query_map(params![id], row_from)?;
        rows.collect()
    }

    /// Adds tracks to the end of a playlist. Ones already in it stay where
    /// they are.
    pub fn add_to_playlist(&self, id: i64, paths: &[PathBuf]) -> rusqlite::Result<()> {
        let mut order = self.playlist_order(id)?;
        for p in paths {
            if !order.contains(p) {
                order.push(p.clone());
            }
        }
        self.set_playlist_tracks(id, &order)
    }

    fn playlist_order(&self, id: i64) -> rusqlite::Result<Vec<PathBuf>> {
        Ok(self
            .playlist_tracks(id)?
            .into_iter()
            .map(|r| r.path)
            .collect())
    }

    /// Replaces a playlist's tracks with `paths`, in that order. Used to
    /// reorder and remove. A path listed twice is kept once, where it first
    /// appears.
    pub fn set_playlist_tracks(&self, id: i64, paths: &[PathBuf]) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![id],
        )?;
        let mut position = 0i64;
        for p in paths {
            let track = self.track_id(p)?;
            position += tx.execute(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
                 VALUES (?1, ?2, ?3)",
                params![id, track, position],
            )? as i64;
        }
        tx.commit()
    }

    /// Notes that a track was played on air.
    pub fn record_play(&self, path: &Path, at: i64) -> rusqlite::Result<()> {
        let track = self.track_id(path)?;
        self.conn.execute(
            "INSERT INTO history (track_id, played_at) VALUES (?1, ?2)",
            params![track, at],
        )?;
        Ok(())
    }

    /// Plays grouped into sessions, newest first.
    pub fn sessions(&self) -> rusqlite::Result<Vec<Session>> {
        let mut st = self
            .conn
            .prepare("SELECT played_at FROM history ORDER BY played_at")?;
        let times: Vec<i64> = st
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let mut out: Vec<Session> = Vec::new();
        let mut last = None;
        for t in times {
            match (out.last_mut(), last) {
                (Some(s), Some(l)) if t - l <= SESSION_GAP_MS => s.count += 1,
                _ => out.push(Session { start: t, count: 1 }),
            }
            last = Some(t);
        }
        out.reverse();
        Ok(out)
    }

    /// The tracks played in the session that started at `start`, in the
    /// order they were played. A track played twice is listed twice.
    pub fn session_tracks(&self, start: i64) -> rusqlite::Result<Vec<Row>> {
        let end = self.session_end(start)?;
        let mut st = self.conn.prepare(&format!(
            "SELECT {ROW_COLUMNS} FROM history JOIN tracks ON tracks.id = history.track_id
             WHERE played_at BETWEEN ?1 AND ?2 ORDER BY played_at, history.id"
        ))?;
        let rows = st.query_map(params![start, end], row_from)?;
        rows.collect()
    }

    /// The time of the last play in the session starting at `start`.
    fn session_end(&self, start: i64) -> rusqlite::Result<i64> {
        let mut st = self
            .conn
            .prepare("SELECT played_at FROM history WHERE played_at >= ?1 ORDER BY played_at")?;
        let times = st.query_map(params![start], |r| r.get::<_, i64>(0))?;
        let mut end = start;
        for t in times {
            let t = t?;
            if t - end > SESSION_GAP_MS {
                break;
            }
            end = t;
        }
        Ok(end)
    }

    pub fn analysis(&self, path: &Path) -> rusqlite::Result<Option<Analysis>> {
        Ok(self
            .conn
            .query_row(
                "SELECT analysis_version, analysis_failed, duration, bpm, key_tonic, key_minor,
                     lufs, peak
                 FROM tracks WHERE path = ?1",
                params![path_str(path)],
                |r| analysis_from(r, 0),
            )
            .optional()?
            .flatten())
    }

    /// The track's id, adding a bare row for a file loaded from outside
    /// the library folders. A later scan fills in its tags.
    fn track_id(&self, path: &Path) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT OR IGNORE INTO tracks (path, added_at) VALUES (?1, ?2)",
            params![path_str(path), now_ms()],
        )?;
        self.conn.query_row(
            "SELECT id FROM tracks WHERE path = ?1",
            params![path_str(path)],
            |r| r.get(0),
        )
    }

    /// Saves a track's analysis. `first_beat` is known when the grid was
    /// found (`None` leaves the saved one alone). `neural` marks a grid
    /// from Beat This!; a DSP grid never replaces one, and neither replaces
    /// a grid fixed by hand.
    pub fn save_analysis(
        &self,
        path: &Path,
        a: &Analysis,
        first_beat: Option<f64>,
        neural: bool,
    ) -> rusqlite::Result<()> {
        let id = self.track_id(path)?;
        self.conn.execute(
            "UPDATE tracks SET analysis_version = ?2, analysis_failed = ?3, duration = ?4,
                 key_tonic = ?6, key_minor = ?7, lufs = ?9, peak = ?10,
                 bpm = CASE WHEN grid_locked OR (grid_neural AND NOT ?11) THEN bpm ELSE ?5 END,
                 first_beat = CASE WHEN grid_locked OR (grid_neural AND NOT ?11) THEN first_beat
                     WHEN ?5 IS NULL THEN NULL ELSE coalesce(?8, first_beat) END,
                 grid_neural = CASE WHEN grid_locked THEN grid_neural
                     ELSE grid_neural OR ?11 END
             WHERE id = ?1",
            params![
                id,
                ANALYSIS_VERSION,
                a.failed,
                a.duration,
                a.bpm,
                a.key.map(|k| k.tonic),
                a.key.map(|k| k.minor),
                first_beat,
                a.loudness.and_then(|l| l.lufs),
                a.loudness.map(|l| l.peak),
                neural,
            ],
        )?;
        Ok(())
    }

    /// Saves the grid Beat This! found for a track loaded onto a deck,
    /// unless its grid was fixed by hand.
    pub fn save_neural_grid(&self, path: &Path, grid: Beatgrid) -> rusqlite::Result<()> {
        let id = self.track_id(path)?;
        self.conn.execute(
            "UPDATE tracks SET bpm = ?2, first_beat = ?3, grid_neural = 1
             WHERE id = ?1 AND NOT grid_locked",
            params![id, grid.bpm, grid.first_beat],
        )?;
        Ok(())
    }

    /// The grid Beat This! found for a track, unless one was fixed by hand.
    pub fn neural_grid(&self, path: &Path) -> rusqlite::Result<Option<Beatgrid>> {
        self.conn
            .query_row(
                "SELECT bpm, first_beat FROM tracks
                 WHERE path = ?1 AND grid_neural AND NOT grid_locked
                     AND bpm IS NOT NULL AND first_beat IS NOT NULL",
                params![path_str(path)],
                |r| {
                    Ok(Beatgrid {
                        bpm: r.get(0)?,
                        first_beat: r.get(1)?,
                    })
                },
            )
            .optional()
    }

    /// The beatgrid fixed by hand for a track, if there is one.
    pub fn locked_grid(&self, path: &Path) -> rusqlite::Result<Option<Beatgrid>> {
        self.conn
            .query_row(
                "SELECT bpm, first_beat FROM tracks
                 WHERE path = ?1 AND grid_locked AND bpm IS NOT NULL",
                params![path_str(path)],
                |r| {
                    Ok(Beatgrid {
                        bpm: r.get(0)?,
                        first_beat: r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                    })
                },
            )
            .optional()
    }

    /// Saves a beatgrid fixed by hand and locks it, so analysis leaves it
    /// alone. `None` unlocks and puts back `detected`.
    pub fn save_grid(
        &self,
        path: &Path,
        grid: Option<Beatgrid>,
        detected: Option<Beatgrid>,
    ) -> rusqlite::Result<()> {
        let id = self.track_id(path)?;
        let g = grid.or(detected);
        self.conn.execute(
            "UPDATE tracks SET grid_locked = ?2, bpm = ?3, first_beat = ?4 WHERE id = ?1",
            params![
                id,
                grid.is_some(),
                g.map(|g| g.bpm),
                g.map(|g| g.first_beat)
            ],
        )?;
        Ok(())
    }

    /// Sets a track's tags where it has none yet (a file not scanned yet,
    /// or one without tags). Tags read from the file itself are kept.
    pub fn fill_tags(
        &self,
        path: &Path,
        title: &str,
        artist: &str,
        album: &str,
        genre: &str,
    ) -> rusqlite::Result<()> {
        let id = self.track_id(path)?;
        self.conn.execute(
            "UPDATE tracks SET
                 title = CASE WHEN title = '' THEN ?2 ELSE title END,
                 artist = CASE WHEN title = '' AND artist = '' THEN ?3 ELSE artist END,
                 album = CASE WHEN album = '' THEN ?4 ELSE album END,
                 genre = CASE WHEN genre = '' THEN ?5 ELSE genre END
             WHERE id = ?1",
            params![id, title, artist, album, genre],
        )?;
        Ok(())
    }

    /// True when a track has any saved cue point or loop.
    pub fn has_cues(&self, path: &Path) -> rusqlite::Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM cues JOIN tracks ON tracks.id = cues.track_id
                            WHERE tracks.path = ?1)",
            params![path_str(path)],
            |r| r.get(0),
        )
    }

    /// A track's saved cue points; all empty for a track never cued.
    pub fn cues(&self, path: &Path) -> rusqlite::Result<SavedCues> {
        let mut cues = SavedCues::default();
        let mut st = self.conn.prepare(
            "SELECT kind, slot, start, end FROM cues
             JOIN tracks ON tracks.id = cues.track_id WHERE tracks.path = ?1",
        )?;
        let rows = st.query_map(params![path_str(path)], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, Option<f64>>(3)?,
            ))
        })?;
        for row in rows {
            match row? {
                (MAIN_CUE, _, start, _) => cues.cue = start,
                (HOT_CUE, slot, start, _) if (0..HOT_CUES as i64).contains(&slot) => {
                    cues.hot_cues[slot as usize] = Some(start)
                }
                (LOOP, 0, start, Some(end)) => cues.saved_loop = Some((start, end)),
                _ => {}
            }
        }
        Ok(cues)
    }

    /// Replaces a track's saved cue points.
    pub fn save_cues(&self, path: &Path, cues: &SavedCues) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let id = self.track_id(path)?;
        tx.execute("DELETE FROM cues WHERE track_id = ?1", params![id])?;
        {
            let mut ins = tx.prepare(
                "INSERT INTO cues (track_id, kind, slot, start, end) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            if cues.cue > 0.0 {
                ins.execute(params![id, MAIN_CUE, 0, cues.cue, None::<f64>])?;
            }
            for (slot, at) in cues.hot_cues.iter().enumerate() {
                if let Some(at) = at {
                    ins.execute(params![id, HOT_CUE, slot as i64, at, None::<f64>])?;
                }
            }
            if let Some((start, end)) = cues.saved_loop {
                ins.execute(params![id, LOOP, 0, start, end])?;
            }
        }
        tx.commit()
    }
}

/// Reads the eight analysis columns starting at `at`. `None` when the track
/// hasn't been analyzed yet. A result from an older analyzer is kept, marked
/// outdated, so its BPM and key stay on screen until it's redone.
fn analysis_from(r: &rusqlite::Row<'_>, at: usize) -> rusqlite::Result<Option<Analysis>> {
    let Some(version): Option<i64> = r.get(at)? else {
        return Ok(None);
    };
    let failed: bool = r.get(at + 1)?;
    let tonic: Option<u8> = r.get(at + 4)?;
    let minor: Option<bool> = r.get(at + 5)?;
    let lufs: Option<f32> = r.get(at + 6)?;
    let peak: Option<f32> = r.get(at + 7)?;
    Ok(Some(Analysis {
        duration: r.get(at + 2)?,
        bpm: r.get(at + 3)?,
        key: tonic.zip(minor).map(|(t, m)| Key::new(t, m)),
        loudness: peak.map(|peak| Loudness { lufs, peak }),
        failed,
        outdated: version != ANALYSIS_VERSION,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stat(path: &str, size: u64, modified: i64) -> FileStat {
        FileStat {
            path: path.into(),
            size,
            modified,
        }
    }

    fn tags(title: &str) -> Tags {
        Tags {
            title: title.into(),
            ..Tags::default()
        }
    }

    #[test]
    fn rescans_read_only_new_and_changed_files_and_keep_missing_ones() {
        let db = Db::open_in_memory().unwrap();
        let roots = vec![PathBuf::from("/m")];
        let a = stat("/m/a.mp3", 10, 1);
        let b = stat("/m/b.mp3", 20, 1);
        let found = vec![a.clone(), b.clone()];
        assert_eq!(db.stale(&found).unwrap(), found);
        db.apply_scan(
            &roots,
            &found,
            &[(a.clone(), tags("A")), (b.clone(), tags("B"))],
        )
        .unwrap();

        // b changed on disk, a didn't, c is new.
        let b2 = stat("/m/b.mp3", 21, 2);
        let c = stat("/m/c.mp3", 5, 1);
        assert_eq!(
            db.stale(&[a.clone(), b2.clone(), c.clone()]).unwrap(),
            [b2.clone(), c.clone()]
        );

        // a is gone: it stays listed, marked missing, with its cues.
        let mut cues = SavedCues::default();
        cues.hot_cues[1] = Some(12.5);
        db.save_cues(&a.path, &cues).unwrap();
        db.apply_scan(
            &roots,
            std::slice::from_ref(&b2),
            &[(b2.clone(), tags("B2"))],
        )
        .unwrap();
        let rows = db.tracks(&roots).unwrap();
        let row = |p: &str| rows.iter().find(|r| r.path == Path::new(p)).unwrap();
        assert!(row("/m/a.mp3").missing);
        assert!(!row("/m/b.mp3").missing);
        assert_eq!(row("/m/b.mp3").tags.title, "B2");
        assert_eq!(db.cues(&a.path).unwrap(), cues);

        // Found again: no longer missing.
        db.apply_scan(&roots, std::slice::from_ref(&a), &[])
            .unwrap();
        assert!(
            !db.tracks(&roots)
                .unwrap()
                .iter()
                .find(|r| r.path == a.path)
                .unwrap()
                .missing
        );
    }

    #[test]
    fn tracks_outside_the_folders_are_not_listed_but_kept() {
        let db = Db::open_in_memory().unwrap();
        let a = stat("/m/a.mp3", 10, 1);
        db.apply_scan(
            &["/m".into()],
            std::slice::from_ref(&a),
            &[(a.clone(), tags("A"))],
        )
        .unwrap();
        assert_eq!(db.tracks(&["/other".into()]).unwrap(), []);
        assert_eq!(db.tracks(&["/m".into()]).unwrap().len(), 1);
        // Scanning another folder doesn't mark these missing.
        db.apply_scan(&["/other".into()], &[], &[]).unwrap();
        assert!(!db.tracks(&["/m".into()]).unwrap()[0].missing);
    }

    #[test]
    fn cues_round_trip() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        assert_eq!(db.cues(p).unwrap(), SavedCues::default());
        let mut cues = SavedCues {
            cue: 4.25,
            saved_loop: Some((8.0, 16.0)),
            ..SavedCues::default()
        };
        cues.hot_cues[0] = Some(1.5);
        cues.hot_cues[7] = Some(200.0);
        db.save_cues(p, &cues).unwrap();
        assert_eq!(db.cues(p).unwrap(), cues);
        // Clearing replaces, not merges.
        cues.hot_cues[0] = None;
        cues.saved_loop = None;
        db.save_cues(p, &cues).unwrap();
        assert_eq!(db.cues(p).unwrap(), cues);
    }

    #[test]
    fn analysis_round_trips_and_background_results_keep_the_first_beat() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        assert_eq!(db.analysis(p).unwrap(), None);
        let a = Analysis {
            duration: Some(300.0),
            bpm: Some(124.0),
            key: Some(Key::new(9, true)),
            loudness: Some(Loudness {
                lufs: Some(-8.5),
                peak: 0.98,
            }),
            failed: false,
            outdated: false,
        };
        db.save_analysis(p, &a, Some(0.12), false).unwrap();
        db.save_analysis(p, &a, None, false).unwrap();
        assert_eq!(db.analysis(p).unwrap(), Some(a));
        let first: Option<f64> = db
            .conn
            .query_row("SELECT first_beat FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(first, Some(0.12));
    }

    #[test]
    fn a_grid_fixed_by_hand_survives_analysis_until_reset() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        let detected = Beatgrid {
            bpm: 87.0,
            first_beat: 0.1,
        };
        let a = Analysis {
            duration: Some(300.0),
            bpm: Some(87.0),
            key: None,
            loudness: None,
            failed: false,
            outdated: false,
        };
        db.save_analysis(p, &a, Some(0.1), false).unwrap();
        assert_eq!(db.locked_grid(p).unwrap(), None);
        let fixed = Beatgrid {
            bpm: 174.0,
            first_beat: 1.2,
        };
        db.save_grid(p, Some(fixed), Some(detected)).unwrap();
        // Analysis runs again (a reload, or a new analyzer version).
        db.save_analysis(p, &a, Some(0.1), false).unwrap();
        assert_eq!(db.locked_grid(p).unwrap(), Some(fixed));
        assert_eq!(db.analysis(p).unwrap().unwrap().bpm, Some(174.0));
        // Reset: back to the detected grid, unlocked.
        db.save_grid(p, None, Some(detected)).unwrap();
        assert_eq!(db.locked_grid(p).unwrap(), None);
        assert_eq!(db.analysis(p).unwrap().unwrap().bpm, Some(87.0));
    }

    #[test]
    fn a_neural_grid_outlasts_dsp_results_but_not_a_fixed_one() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        let a = |bpm| Analysis {
            duration: Some(300.0),
            bpm: Some(bpm),
            key: None,
            loudness: None,
            failed: false,
            outdated: false,
        };
        // Loaded onto a deck: the DSP grid, then Beat This!'s.
        db.save_analysis(p, &a(123.9), Some(0.4), false).unwrap();
        assert_eq!(db.neural_grid(p).unwrap(), None);
        let neural = Beatgrid {
            bpm: 124.0,
            first_beat: 1.3,
        };
        db.save_neural_grid(p, neural).unwrap();
        assert_eq!(db.neural_grid(p).unwrap(), Some(neural));
        // Loaded again: the quicker DSP result doesn't replace it.
        db.save_analysis(p, &a(123.9), Some(0.4), false).unwrap();
        assert_eq!(db.neural_grid(p).unwrap(), Some(neural));
        assert_eq!(db.analysis(p).unwrap().unwrap().bpm, Some(124.0));
        // Background analysis with Beat This! does.
        db.save_analysis(p, &a(124.5), Some(0.2), true).unwrap();
        assert_eq!(db.neural_grid(p).unwrap().unwrap().bpm, 124.5);
        // A grid fixed by hand wins over both, and Beat This! leaves it be.
        let fixed = Beatgrid {
            bpm: 62.0,
            first_beat: 0.0,
        };
        db.save_grid(p, Some(fixed), Some(neural)).unwrap();
        db.save_neural_grid(p, neural).unwrap();
        db.save_analysis(p, &a(124.5), Some(0.2), true).unwrap();
        assert_eq!(db.neural_grid(p).unwrap(), None);
        assert_eq!(db.locked_grid(p).unwrap(), Some(fixed));
        // Reset puts the detected grid back.
        db.save_grid(p, None, Some(neural)).unwrap();
        assert_eq!(db.neural_grid(p).unwrap(), Some(neural));
    }

    #[test]
    fn loudness_round_trips_silence_included() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        let silent = Analysis {
            duration: Some(10.0),
            bpm: None,
            key: None,
            loudness: Some(Loudness {
                lufs: None,
                peak: 0.0,
            }),
            failed: false,
            outdated: false,
        };
        db.save_analysis(p, &silent, None, false).unwrap();
        let back = db.analysis(p).unwrap().unwrap();
        assert_eq!(back, silent);
        assert!(back.complete());
        // A track analyzed before loudness was measured keeps its BPM and
        // key, and is analyzed again for its loudness.
        db.conn
            .execute("UPDATE tracks SET lufs = NULL, peak = NULL", [])
            .unwrap();
        let old = db.analysis(p).unwrap().unwrap();
        assert_eq!(old.duration, Some(10.0));
        assert!(!old.complete());
    }

    #[test]
    fn old_analysis_versions_are_kept_but_marked_outdated() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        let a = Analysis {
            duration: Some(300.0),
            bpm: Some(124.0),
            key: Some(Key::new(9, true)),
            loudness: Some(Loudness {
                lufs: Some(-9.0),
                peak: 0.9,
            }),
            failed: false,
            outdated: false,
        };
        db.save_analysis(p, &a, Some(0.1), false).unwrap();
        assert!(db.analysis(p).unwrap().unwrap().complete());
        db.conn
            .execute("UPDATE tracks SET analysis_version = 2", [])
            .unwrap();
        // Still shown, but queued to be redone.
        let old = db.analysis(p).unwrap().unwrap();
        assert_eq!(old, Analysis { outdated: true, ..a });
        assert!(!old.complete());
        // Redoing it brings it up to date.
        db.save_analysis(p, &a, Some(0.1), false).unwrap();
        assert!(db.analysis(p).unwrap().unwrap().complete());
        // A track never analyzed still has nothing to show.
        assert_eq!(db.analysis(Path::new("/m/new.mp3")).unwrap(), None);
    }

    #[test]
    fn playlists_keep_their_order_and_skip_duplicates() {
        let db = Db::open_in_memory().unwrap();
        let p: Vec<PathBuf> = ["/m/a.mp3", "/m/b.mp3", "/m/c.mp3"]
            .iter()
            .map(PathBuf::from)
            .collect();
        let warm = db.create_playlist("Warmup").unwrap();
        let peak = db.create_playlist("Peak").unwrap();
        db.add_to_playlist(warm, &[p[1].clone(), p[0].clone()])
            .unwrap();
        db.add_to_playlist(warm, &[p[0].clone(), p[2].clone()])
            .unwrap();
        let order = |id| -> Vec<PathBuf> {
            db.playlist_tracks(id)
                .unwrap()
                .into_iter()
                .map(|r| r.path)
                .collect()
        };
        assert_eq!(order(warm), [p[1].clone(), p[0].clone(), p[2].clone()]);

        // Reorder and remove in one go.
        db.set_playlist_tracks(warm, &[p[2].clone(), p[1].clone(), p[2].clone()])
            .unwrap();
        assert_eq!(order(warm), [p[2].clone(), p[1].clone()]);

        db.rename_playlist(peak, "Peak time").unwrap();
        let lists = db.playlists().unwrap();
        assert_eq!(
            lists,
            [
                Playlist {
                    id: warm,
                    name: "Warmup".into(),
                    count: 2
                },
                Playlist {
                    id: peak,
                    name: "Peak time".into(),
                    count: 0
                }
            ]
        );
        db.delete_playlist(warm).unwrap();
        assert_eq!(db.playlists().unwrap().len(), 1);
        // The tracks themselves stay.
        assert!(db.track_id(&p[0]).is_ok());
    }

    #[test]
    fn history_splits_into_sessions_at_long_gaps() {
        let db = Db::open_in_memory().unwrap();
        let hour = 60 * 60 * 1000;
        let (a, b) = (Path::new("/m/a.mp3"), Path::new("/m/b.mp3"));
        // Friday night, past midnight: one session.
        db.record_play(a, 22 * hour).unwrap();
        db.record_play(b, 25 * hour).unwrap();
        db.record_play(a, 26 * hour).unwrap();
        // Saturday evening: a new one.
        db.record_play(b, 44 * hour).unwrap();
        let sessions = db.sessions().unwrap();
        assert_eq!(
            sessions,
            [
                Session {
                    start: 44 * hour,
                    count: 1
                },
                Session {
                    start: 22 * hour,
                    count: 3
                }
            ]
        );
        let titles: Vec<PathBuf> = db
            .session_tracks(22 * hour)
            .unwrap()
            .into_iter()
            .map(|r| r.path)
            .collect();
        assert_eq!(titles, [a, b, a]);
        assert_eq!(db.session_tracks(44 * hour).unwrap().len(), 1);
    }

    #[test]
    fn removed_folders_come_back_with_their_tracks() {
        let db = Db::open_in_memory().unwrap();
        db.add_folder(Path::new("/m")).unwrap();
        db.add_folder(Path::new("/n")).unwrap();
        db.add_folder(Path::new("/m")).unwrap();
        assert_eq!(db.folders().unwrap(), [PathBuf::from("/m"), "/n".into()]);
        db.remove_folder(Path::new("/m")).unwrap();
        assert_eq!(db.folders().unwrap(), [PathBuf::from("/n")]);
    }

    #[test]
    fn backups_are_made_daily_and_before_upgrades_and_pruned() {
        let dir = std::env::temp_dir().join(format!("oss-dj-db-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("library.db");
        drop(Db::open(&file).unwrap()); // new: no backup
        assert!(!dir.join("backups").exists());
        drop(Db::open(&file).unwrap()); // existing: today's backup
        let backups = dir.join("backups");
        for i in 0..10 {
            std::fs::write(backups.join(format!("library-2000-01-{i:02}.db")), "").unwrap();
        }
        drop(Db::open(&file).unwrap()); // today's exists already: just prune
        let left = std::fs::read_dir(&backups).unwrap().count();
        assert_eq!(left, BACKUPS_KEPT);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oss-dj-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_sound_library_opens_as_is() {
        let dir = test_dir("health-ok");
        let file = dir.join("library.db");
        let (db, health) = Db::open_or_recover(&file);
        assert_eq!(health, Health::Ok);
        db.add_folder(Path::new("/music")).unwrap();
        drop(db);
        let (db, health) = Db::open_or_recover(&file);
        assert_eq!(health, Health::Ok);
        assert_eq!(db.folders().unwrap(), [PathBuf::from("/music")]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_damaged_library_is_set_aside_and_restored_from_a_backup() {
        let dir = test_dir("health-restore");
        let file = dir.join("library.db");
        let db = Db::open(&file).unwrap();
        db.add_folder(Path::new("/music")).unwrap();
        drop(db);
        drop(Db::open(&file).unwrap()); // makes today's backup
        std::fs::write(&file, b"this is not a database, just noise ".repeat(200)).unwrap();

        let (db, health) = Db::open_or_recover(&file);
        let Health::Restored { backup, damaged } = health else {
            panic!("expected a restore, got {health:?}");
        };
        assert!(backup.starts_with("library-"));
        assert!(damaged.exists(), "the damaged file is kept");
        assert_eq!(db.folders().unwrap(), [PathBuf::from("/music")]);
        // Restored for good: the next launch is normal.
        drop(db);
        assert_eq!(Db::open_or_recover(&file).1, Health::Ok);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_damaged_library_with_no_backup_starts_fresh_and_keeps_the_old_file() {
        let dir = test_dir("health-fresh");
        let file = dir.join("library.db");
        std::fs::write(&file, b"garbage".repeat(1000)).unwrap();
        let (db, health) = Db::open_or_recover(&file);
        let Health::Fresh { damaged } = health else {
            panic!("expected a fresh start, got {health:?}");
        };
        assert!(damaged.exists());
        db.add_folder(Path::new("/music")).unwrap();
        drop(db);
        // The new library is saved.
        assert_eq!(Db::open(&file).unwrap().folders().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
