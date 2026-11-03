//! The saved library: one SQLite file holding the music folders, every
//! track found in them with its tags and analysis, and each track's cue
//! points. Music files themselves are never written.
//!
//! Schema changes are numbered migrations, run on open. Once a day, and
//! before any migration, the file is copied to `backups/` (the last 7 are
//! kept).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use dj_engine::{Key, SavedCues, HOT_CUES};
use rusqlite::{params, Connection, OptionalExtension};

use super::tags::Tags;
use super::Analysis;

/// Bumped when BPM or key detection changes enough that saved results
/// should be redone. Tracks analyzed by an older version are analyzed
/// again in the background.
pub const ANALYSIS_VERSION: i64 = 1;

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
];

const MAIN_CUE: i64 = 0;
const HOT_CUE: i64 = 1;
const LOOP: i64 = 2;

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

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn path_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

impl Db {
    /// Opens (or creates) the library at `file`, backing it up first when
    /// a backup is due.
    pub fn open(file: &Path) -> rusqlite::Result<Self> {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let conn = Connection::open(file)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
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
        let mut st = self.conn.prepare(
            "SELECT path, title, artist, album, genre, missing, analysis_version,
                    analysis_failed, duration, bpm, key_tonic, key_minor
             FROM tracks",
        )?;
        let rows = st.query_map([], |r| {
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
        })?;
        let mut out = Vec::new();
        for row in rows {
            let row = row?;
            if roots.iter().any(|root| row.path.starts_with(root)) {
                out.push(row);
            }
        }
        Ok(out)
    }

    pub fn analysis(&self, path: &Path) -> rusqlite::Result<Option<Analysis>> {
        Ok(self
            .conn
            .query_row(
                "SELECT analysis_version, analysis_failed, duration, bpm, key_tonic, key_minor
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

    /// Saves a track's analysis. `first_beat` is known when the track was
    /// loaded onto a deck; background analysis leaves the saved one alone.
    pub fn save_analysis(
        &self,
        path: &Path,
        a: &Analysis,
        first_beat: Option<f64>,
    ) -> rusqlite::Result<()> {
        let id = self.track_id(path)?;
        self.conn.execute(
            "UPDATE tracks SET analysis_version = ?2, analysis_failed = ?3, duration = ?4,
                 bpm = ?5, key_tonic = ?6, key_minor = ?7,
                 first_beat = CASE WHEN ?5 IS NULL THEN NULL ELSE coalesce(?8, first_beat) END
             WHERE id = ?1",
            params![
                id,
                ANALYSIS_VERSION,
                a.failed,
                a.duration,
                a.bpm,
                a.key.map(|k| k.tonic),
                a.key.map(|k| k.minor),
                first_beat
            ],
        )?;
        Ok(())
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

/// Reads the six analysis columns starting at `at`. `None` when the track
/// hasn't been analyzed by the current analyzer.
fn analysis_from(r: &rusqlite::Row<'_>, at: usize) -> rusqlite::Result<Option<Analysis>> {
    let version: Option<i64> = r.get(at)?;
    if version != Some(ANALYSIS_VERSION) {
        return Ok(None);
    }
    let failed: bool = r.get(at + 1)?;
    let tonic: Option<u8> = r.get(at + 4)?;
    let minor: Option<bool> = r.get(at + 5)?;
    Ok(Some(Analysis {
        duration: r.get(at + 2)?,
        bpm: r.get(at + 3)?,
        key: tonic.zip(minor).map(|(t, m)| Key::new(t, m)),
        failed,
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
            failed: false,
        };
        db.save_analysis(p, &a, Some(0.12)).unwrap();
        db.save_analysis(p, &a, None).unwrap();
        assert_eq!(db.analysis(p).unwrap(), Some(a));
        let first: Option<f64> = db
            .conn
            .query_row("SELECT first_beat FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(first, Some(0.12));
    }

    #[test]
    fn old_analysis_versions_count_as_not_analyzed() {
        let db = Db::open_in_memory().unwrap();
        let p = Path::new("/m/a.mp3");
        db.save_analysis(p, &Analysis::FAILED, None).unwrap();
        db.conn
            .execute("UPDATE tracks SET analysis_version = 0", [])
            .unwrap();
        assert_eq!(db.analysis(p).unwrap(), None);
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
}
