//! Importing another DJ app's library: tracks with their tags, cue points,
//! loops and beatgrids, and playlists. Your own work always wins: a track
//! that already has cues or a grid fixed by hand in oss-dj keeps them, and
//! running an import again only fills in what's still missing.

pub mod rekordbox;

use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};

use dj_engine::{Beatgrid, SavedCues};
use serde::{Deserialize, Serialize};

use super::db::Db;

/// A track as another app saved it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportTrack {
    pub path: PathBuf,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub cues: SavedCues,
    pub grid: Option<Beatgrid>,
}

impl ImportTrack {
    fn has_cues(&self) -> bool {
        self.cues.cue > 0.0
            || self.cues.saved_loop.is_some()
            || self.cues.hot_cues.iter().any(Option::is_some)
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportPlaylist {
    pub name: String,
    pub paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Collection {
    pub tracks: Vec<ImportTrack>,
    pub playlists: Vec<ImportPlaylist>,
}

/// Where a library can be imported from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    /// A Rekordbox collection exported as XML.
    Rekordbox { path: PathBuf },
}

impl Source {
    pub fn read(&self) -> Result<Collection, String> {
        match self {
            Source::Rekordbox { path } => {
                let xml = std::fs::read_to_string(path)
                    .map_err(|e| format!("couldn't read {}: {e}", path.display()))?;
                rekordbox::parse(&xml)
            }
        }
    }
}

/// A Rekordbox XML export found on this computer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub source: Source,
    /// Modified time, ms since 1970, so the newest export can be offered.
    pub modified: i64,
}

/// Looks for Rekordbox XML exports where people usually save them.
pub fn find_sources() -> Vec<Found> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let places = [
        "",
        "Desktop",
        "Documents",
        "Downloads",
        "Music",
        "Documents/rekordbox",
        "Music/rekordbox",
    ];
    let mut found: Vec<Found> = Vec::new();
    for place in places {
        let Ok(entries) = std::fs::read_dir(home.join(place)) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_xml = path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("xml"));
            if !is_xml || !looks_like_rekordbox(&path) {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as i64);
            found.push(Found {
                source: Source::Rekordbox { path },
                modified,
            });
        }
    }
    found.sort_by_key(|f| std::cmp::Reverse(f.modified));
    found
}

/// True when a file starts like a Rekordbox export.
fn looks_like_rekordbox(path: &Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 512];
    let n = std::fs::File::open(path)
        .and_then(|mut f| f.read(&mut head))
        .unwrap_or(0);
    String::from_utf8_lossy(&head[..n]).contains("<DJ_PLAYLISTS")
}

/// What an import would bring over, shown before anything is changed.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub tracks: usize,
    /// Tracks whose file isn't on this computer right now.
    pub missing: usize,
    pub with_cues: usize,
    pub hot_cues: usize,
    pub loops: usize,
    pub grids: usize,
    pub playlists: Vec<PlaylistPreview>,
    /// Folders to add so the tracks show up in the library.
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PlaylistPreview {
    pub name: String,
    pub count: usize,
}

pub fn preview(c: &Collection, existing: &[PathBuf]) -> Preview {
    let present: Vec<&Path> = c
        .tracks
        .iter()
        .map(|t| t.path.as_path())
        .filter(|p| p.exists())
        .collect();
    Preview {
        tracks: c.tracks.len(),
        missing: c.tracks.len() - present.len(),
        with_cues: c.tracks.iter().filter(|t| t.has_cues()).count(),
        hot_cues: c
            .tracks
            .iter()
            .map(|t| t.cues.hot_cues.iter().flatten().count())
            .sum(),
        loops: c
            .tracks
            .iter()
            .filter(|t| t.cues.saved_loop.is_some())
            .count(),
        grids: c.tracks.iter().filter(|t| t.grid.is_some()).count(),
        playlists: c
            .playlists
            .iter()
            .map(|p| PlaylistPreview {
                name: p.name.clone(),
                count: p.paths.len(),
            })
            .collect(),
        folders: folders_for(&present, existing)
            .iter()
            .map(|p| p.display().to_string())
            .collect(),
    }
}

/// Most folders the preview suggests; more get folded into their parents.
const MAX_FOLDERS: usize = 8;

/// The fewest folders that hold `files`, leaving out ones already in the
/// library. Many scattered folders are folded up into common parents, but
/// never as far as the home folder or a drive's root.
pub fn folders_for(files: &[&Path], existing: &[PathBuf]) -> Vec<PathBuf> {
    let home = dirs::home_dir();
    let covered = |p: &Path| existing.iter().any(|e| p.starts_with(e));
    let mut set: BTreeSet<PathBuf> = files
        .iter()
        .filter(|f| !covered(f))
        .filter_map(|f| f.parent().map(Path::to_path_buf))
        .collect();
    loop {
        // Drop folders inside another one in the set.
        let list: Vec<PathBuf> = set.iter().cloned().collect();
        set = list
            .iter()
            .filter(|p| !list.iter().any(|q| q != *p && p.starts_with(q)))
            .cloned()
            .collect();
        if set.len() <= MAX_FOLDERS {
            break;
        }
        // Fold the deepest folders up a level, if that stays specific.
        let deepest = set
            .iter()
            .map(|p| p.components().count())
            .max()
            .unwrap_or(0);
        let mut changed = false;
        set = set
            .into_iter()
            .map(|p| {
                let up = p.parent().map(Path::to_path_buf);
                match up {
                    Some(up)
                        if p.components().count() == deepest
                            && up.components().count() > 2
                            && Some(&up) != home.as_ref() =>
                    {
                        changed = true;
                        up
                    }
                    _ => p,
                }
            })
            .collect();
        if !changed {
            break;
        }
    }
    set.into_iter().collect()
}

/// What to bring over.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub cues: bool,
    pub grids: bool,
    pub playlists: bool,
}

/// What an import did.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub tracks: usize,
    pub cues: usize,
    pub grids: usize,
    pub playlists: usize,
    /// Tracks that kept the cues or grid already set in oss-dj.
    pub kept: usize,
}

/// Brings `c` into the library. `progress(done, total)` is called as it
/// goes. Existing cues and hand-fixed grids are never replaced.
pub fn apply(
    db: &Db,
    c: &Collection,
    opts: Options,
    folders: &[PathBuf],
    mut progress: impl FnMut(usize, usize),
) -> rusqlite::Result<Summary> {
    let mut s = Summary::default();
    let total = c.tracks.len() + c.playlists.len();
    for f in folders {
        db.add_folder(f)?;
    }
    for (i, t) in c.tracks.iter().enumerate() {
        db.fill_tags(&t.path, &t.title, &t.artist, &t.album, &t.genre)?;
        s.tracks += 1;
        let mut kept = false;
        if opts.cues && t.has_cues() {
            if db.has_cues(&t.path)? {
                kept = true;
            } else {
                db.save_cues(&t.path, &t.cues)?;
                s.cues += 1;
            }
        }
        if let (true, Some(g)) = (opts.grids, t.grid) {
            if db.locked_grid(&t.path)?.is_some() {
                kept = true;
            } else {
                db.save_grid(&t.path, Some(g), None)?;
                s.grids += 1;
            }
        }
        s.kept += kept as usize;
        if i % 50 == 0 {
            progress(i, total);
        }
    }
    if opts.playlists {
        let mut have: Vec<(i64, String)> = db
            .playlists()?
            .into_iter()
            .map(|p| (p.id, p.name))
            .collect();
        for (i, p) in c.playlists.iter().enumerate() {
            // Importing again adds to the playlist made last time.
            let id = match have.iter().find(|(_, n)| *n == p.name) {
                Some((id, _)) => *id,
                None => {
                    let id = db.create_playlist(&p.name)?;
                    have.push((id, p.name.clone()));
                    s.playlists += 1;
                    id
                }
            };
            let unique: Vec<PathBuf> = {
                let mut seen = HashSet::new();
                p.paths
                    .iter()
                    .filter(|x| seen.insert(*x))
                    .cloned()
                    .collect()
            };
            db.add_to_playlist(id, &unique)?;
            progress(c.tracks.len() + i, total);
        }
    }
    progress(total, total);
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str) -> ImportTrack {
        ImportTrack {
            path: path.into(),
            title: "Imported".into(),
            ..ImportTrack::default()
        }
    }

    #[test]
    fn import_fills_in_but_never_replaces_your_own_work() {
        let db = Db::open_in_memory().unwrap();
        let mine = Path::new("/m/mine.mp3");
        let mut my_cues = SavedCues::default();
        my_cues.hot_cues[0] = Some(5.0);
        db.save_cues(mine, &my_cues).unwrap();
        let my_grid = Beatgrid {
            bpm: 174.0,
            first_beat: 0.0,
        };
        db.save_grid(mine, Some(my_grid), None).unwrap();

        let mut a = track("/m/mine.mp3");
        a.cues.hot_cues[0] = Some(99.0);
        a.grid = Some(Beatgrid {
            bpm: 87.0,
            first_beat: 0.0,
        });
        let mut b = track("/m/new.mp3");
        b.cues.cue = 12.0;
        b.grid = Some(Beatgrid {
            bpm: 125.0,
            first_beat: 0.3,
        });
        let c = Collection {
            tracks: vec![a, b.clone()],
            playlists: vec![ImportPlaylist {
                name: "Friday".into(),
                paths: vec![b.path.clone(), mine.into(), b.path.clone()],
            }],
        };
        let opts = Options {
            cues: true,
            grids: true,
            playlists: true,
        };
        let s = apply(&db, &c, opts, &[], |_, _| {}).unwrap();
        assert_eq!(
            s,
            Summary {
                tracks: 2,
                cues: 1,
                grids: 1,
                playlists: 1,
                kept: 1
            }
        );
        assert_eq!(db.cues(mine).unwrap(), my_cues);
        assert_eq!(db.locked_grid(mine).unwrap(), Some(my_grid));
        assert_eq!(db.cues(&b.path).unwrap().cue, 12.0);
        assert_eq!(db.locked_grid(&b.path).unwrap(), b.grid);

        // Again: nothing new, the playlist isn't duplicated.
        let s = apply(&db, &c, opts, &[], |_, _| {}).unwrap();
        assert_eq!((s.cues, s.grids, s.playlists), (0, 0, 0));
        let lists = db.playlists().unwrap();
        assert_eq!(lists.len(), 1);
        assert_eq!(lists[0].count, 2);
    }

    #[test]
    fn options_leave_things_out() {
        let db = Db::open_in_memory().unwrap();
        let mut a = track("/m/a.mp3");
        a.cues.cue = 3.0;
        let c = Collection {
            tracks: vec![a],
            playlists: vec![ImportPlaylist {
                name: "X".into(),
                paths: vec![],
            }],
        };
        let opts = Options {
            cues: false,
            grids: true,
            playlists: false,
        };
        apply(&db, &c, opts, &[], |_, _| {}).unwrap();
        assert_eq!(
            db.cues(Path::new("/m/a.mp3")).unwrap(),
            SavedCues::default()
        );
        assert!(db.playlists().unwrap().is_empty());
    }

    #[test]
    fn suggested_folders_are_few_and_skip_ones_already_added() {
        let files: Vec<PathBuf> = [
            "/Volumes/USB/House/a.mp3",
            "/Volumes/USB/House/Deep/b.mp3",
            "/Volumes/USB/Techno/c.mp3",
            "/Users/z/Music/DJ/d.mp3",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let refs: Vec<&Path> = files.iter().map(PathBuf::as_path).collect();
        let got = folders_for(&refs, &[PathBuf::from("/Users/z/Music")]);
        assert_eq!(
            got,
            [
                PathBuf::from("/Volumes/USB/House"),
                PathBuf::from("/Volumes/USB/Techno")
            ]
        );

        // Lots of scattered folders fold up into their parent.
        let many: Vec<PathBuf> = (0..20)
            .map(|i| PathBuf::from(format!("/Volumes/USB/Crates/c{i}/t.mp3")))
            .collect();
        let refs: Vec<&Path> = many.iter().map(PathBuf::as_path).collect();
        assert_eq!(
            folders_for(&refs, &[]),
            [PathBuf::from("/Volumes/USB/Crates")]
        );
    }
}
