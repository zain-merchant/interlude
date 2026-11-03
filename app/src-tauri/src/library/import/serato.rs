//! Reading a Serato DJ library.
//!
//! Serato keeps its track list and crates in a `_Serato_` folder (in the
//! Music folder, and at the root of each drive it has music on), but the
//! cue points, loops and beatgrids live in each music file's own tags:
//!
//! - `database V2` and `Subcrates/*.crate` are a list of tagged fields: a
//!   4-byte name, a 4-byte big-endian length, then the value. Names that
//!   start with `o` hold more fields; strings are UTF-16 big-endian. Paths
//!   are relative to the root of the drive the `_Serato_` folder is on.
//! - "Serato Markers2" holds hot cues and loops, as base64 text.
//! - "Serato BeatGrid" holds beatgrid markers.
//!
//! In MP3, AIFF and WAV files those two are ID3 GEOB frames; in MP4 and
//! FLAC files they are base64 text wrapped in a small header.

use std::collections::HashSet;
use std::fs::File;
use std::path::{Component, Path, PathBuf};

use base64::Engine as _;
use dj_engine::{Beatgrid, SavedCues, HOT_CUES};
use lofty::config::ParseOptions;
use lofty::file::AudioFile;
use lofty::id3::v2::{Frame, GeneralEncapsulatedObject, Id3v2Tag};

use super::{Collection, ImportPlaylist, ImportTrack};

/// True when `dir` is a `_Serato_` folder with a library in it.
pub fn is_library(dir: &Path) -> bool {
    dir.join("database V2").is_file()
}

/// Reads the library in the `_Serato_` folder `dir`: its tracks, crates,
/// and each track's cues and beatgrid from its file.
pub fn read(dir: &Path) -> Result<Collection, String> {
    let db = std::fs::read(dir.join("database V2"))
        .map_err(|e| format!("couldn't read Serato's library in {}: {e}", dir.display()))?;
    let root = volume_root(dir);
    let mut tracks = parse_database(&db, &root)?;
    read_markers(&mut tracks);
    let mut playlists = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir.join("Subcrates")) {
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "crate"))
            .collect();
        files.sort();
        for f in files {
            let Ok(bytes) = std::fs::read(&f) else {
                continue;
            };
            let name = crate_name(&f);
            playlists.push(ImportPlaylist {
                name,
                paths: parse_crate(&bytes, &root),
            });
        }
    }
    Ok(Collection { tracks, playlists })
}

/// Where Serato's relative paths start: the root of the drive the
/// `_Serato_` folder is on. The one in the Music folder is on the system
/// drive; one at the top of an external drive is on that drive.
fn volume_root(dir: &Path) -> PathBuf {
    let in_home = dirs::home_dir().is_some_and(|h| dir.starts_with(h));
    if let (false, Some(parent)) = (in_home, dir.parent()) {
        return parent.to_path_buf();
    }
    dir.components()
        .take_while(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
        .collect()
}

/// "Gigs%%Club" (a crate inside a crate) becomes "Gigs › Club".
fn crate_name(file: &Path) -> String {
    let stem = file
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    stem.split("%%").collect::<Vec<_>>().join(" › ")
}

/// Splits a run of Serato's tagged fields.
fn fields(mut b: &[u8]) -> impl Iterator<Item = ([u8; 4], &[u8])> {
    std::iter::from_fn(move || {
        if b.len() < 8 {
            return None;
        }
        let name: [u8; 4] = b[..4].try_into().ok()?;
        let len = u32::from_be_bytes(b[4..8].try_into().ok()?) as usize;
        let value = b.get(8..8 + len)?;
        b = &b[8 + len..];
        Some((name, value))
    })
}

fn utf16(b: &[u8]) -> String {
    let units: Vec<u16> = b
        .chunks_exact(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
        .trim_end_matches('\0')
        .to_string()
}

fn resolve(root: &Path, p: &str) -> PathBuf {
    let p = Path::new(p);
    if p.is_absolute() {
        p.into()
    } else {
        root.join(p)
    }
}

fn parse_database(b: &[u8], root: &Path) -> Result<Vec<ImportTrack>, String> {
    if !b.starts_with(b"vrsn") {
        return Err("this isn't a Serato library".into());
    }
    let mut out = Vec::new();
    for (name, value) in fields(b) {
        if &name != b"otrk" {
            continue;
        }
        let mut t = ImportTrack::default();
        for (f, v) in fields(value) {
            match &f {
                b"pfil" => t.path = resolve(root, &utf16(v)),
                b"tsng" => t.title = utf16(v),
                b"tart" => t.artist = utf16(v),
                b"talb" => t.album = utf16(v),
                b"tgen" => t.genre = utf16(v),
                _ => {}
            }
        }
        if !t.path.as_os_str().is_empty() {
            out.push(t);
        }
    }
    Ok(out)
}

fn parse_crate(b: &[u8], root: &Path) -> Vec<PathBuf> {
    fields(b)
        .filter(|(n, _)| n == b"otrk")
        .flat_map(|(_, v)| fields(v))
        .filter(|(n, _)| n == b"ptrk")
        .map(|(_, v)| resolve(root, &utf16(v)))
        .collect()
}

/// Reads cues and beatgrids from every track's file, a few at a time.
fn read_markers(tracks: &mut [ImportTrack]) {
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    let chunk = tracks.len().div_ceil(threads).max(1);
    std::thread::scope(|s| {
        for part in tracks.chunks_mut(chunk) {
            s.spawn(move || {
                for t in part {
                    if let Some(m) = markers_from_file(&t.path) {
                        t.cues = m.cues;
                        t.grid = m.grid;
                    }
                }
            });
        }
    });
}

#[derive(Debug, Default, PartialEq)]
struct Markers {
    cues: SavedCues,
    grid: Option<Beatgrid>,
}

/// The two Serato tags of a file, as raw bytes.
#[derive(Default)]
struct Raw {
    markers2: Option<Vec<u8>>,
    beatgrid: Option<Vec<u8>>,
}

fn markers_from_file(path: &Path) -> Option<Markers> {
    let raw = raw_tags(path)?;
    let cues = raw
        .markers2
        .as_deref()
        .map(parse_markers2)
        .unwrap_or_default();
    let grid = raw.beatgrid.as_deref().and_then(parse_beatgrid);
    Some(Markers { cues, grid })
}

fn raw_tags(path: &Path) -> Option<Raw> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    let mut f = File::open(path).ok()?;
    let opts = ParseOptions::new()
        .read_properties(false)
        .read_cover_art(false);
    match ext.as_str() {
        "mp3" => from_id3(lofty::mpeg::MpegFile::read_from(&mut f, opts).ok()?.id3v2()),
        "aif" | "aiff" => from_id3(
            lofty::iff::aiff::AiffFile::read_from(&mut f, opts)
                .ok()?
                .id3v2(),
        ),
        "wav" => from_id3(
            lofty::iff::wav::WavFile::read_from(&mut f, opts)
                .ok()?
                .id3v2(),
        ),
        "flac" => {
            let file = lofty::flac::FlacFile::read_from(&mut f, opts).ok()?;
            let vc = file.vorbis_comments()?;
            Some(Raw {
                markers2: vc.get("SERATO_MARKERS_V2").and_then(unwrap_text),
                beatgrid: vc.get("SERATO_BEATGRID").and_then(unwrap_text),
            })
        }
        "m4a" | "mp4" | "aac" | "alac" => {
            use lofty::mp4::{AtomData, AtomIdent};
            let file = lofty::mp4::Mp4File::read_from(&mut f, opts).ok()?;
            let ilst = file.ilst()?;
            let get = |name: &'static str| {
                let ident = AtomIdent::Freeform {
                    mean: "com.serato.dj".into(),
                    name: name.into(),
                };
                ilst.get(&ident)?.data().find_map(|d| match d {
                    AtomData::UTF8(s) | AtomData::UTF16(s) => unwrap_text(s),
                    AtomData::Unknown { data, .. } => unwrap_text(&String::from_utf8_lossy(data)),
                    _ => None,
                })
            };
            Some(Raw {
                markers2: get("markersv2"),
                beatgrid: get("beatgrid"),
            })
        }
        _ => None,
    }
}

fn from_id3(tag: Option<&Id3v2Tag>) -> Option<Raw> {
    let mut raw = Raw::default();
    for frame in tag? {
        let Frame::Binary(b) = frame else { continue };
        if b.id().as_str() != "GEOB" {
            continue;
        }
        let Ok(obj) = GeneralEncapsulatedObject::parse(&b.data, b.flags()) else {
            continue;
        };
        match obj.descriptor.as_deref() {
            Some("Serato Markers2") => raw.markers2 = Some(obj.data),
            Some("Serato BeatGrid") => raw.beatgrid = Some(obj.data),
            _ => {}
        }
    }
    Some(raw)
}

/// Decodes base64 that Serato wrote: split over lines, sometimes without
/// its padding, sometimes with one stray character on the end.
fn base64(text: &[u8]) -> Option<Vec<u8>> {
    let mut clean: Vec<u8> = text
        .iter()
        .copied()
        .take_while(|&c| c != 0)
        .filter(|c| !c.is_ascii_whitespace() && *c != b'=')
        .collect();
    if clean.len() % 4 == 1 {
        clean.pop();
    }
    base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(clean)
        .ok()
}

/// MP4 and FLAC hold base64 of "application/octet-stream\0\0<name>\0<data>".
fn unwrap_text(text: &str) -> Option<Vec<u8>> {
    let b = base64(text.as_bytes())?;
    let mut parts = b.splitn(4, |&c| c == 0);
    let (_mime, _empty, _name) = (parts.next()?, parts.next()?, parts.next()?);
    Some(parts.next()?.to_vec())
}

fn be_u32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

/// Hot cues and the first saved loop from "Serato Markers2". Serato has
/// no stored main cue, so it stays unset.
fn parse_markers2(data: &[u8]) -> SavedCues {
    let mut cues = SavedCues::default();
    let Some(text) = data.strip_prefix(&[1, 1]) else {
        return cues;
    };
    let Some(b) = base64(text) else { return cues };
    let Some(mut b) = b.strip_prefix(&[1, 1]) else {
        return cues;
    };
    let mut loop_index = usize::MAX;
    while let Some(end) = b.iter().position(|&c| c == 0) {
        let kind = &b[..end];
        let Some(len) = be_u32(b, end + 1) else { break };
        let start = end + 5;
        let Some(entry) = b.get(start..start + len as usize) else {
            break;
        };
        b = &b[start + len as usize..];
        let index = entry.get(1).copied().unwrap_or(u8::MAX) as usize;
        match kind {
            b"CUE" => {
                if let (true, Some(ms)) = (index < HOT_CUES, be_u32(entry, 2)) {
                    cues.hot_cues[index] = Some(ms as f64 / 1000.0);
                }
            }
            b"LOOP" => {
                let (Some(a), Some(z)) = (be_u32(entry, 2), be_u32(entry, 6)) else {
                    continue;
                };
                if z > a && index < loop_index {
                    loop_index = index;
                    cues.saved_loop = Some((a as f64 / 1000.0, z as f64 / 1000.0));
                }
            }
            _ => {}
        }
    }
    cues
}

/// The grid from "Serato BeatGrid": markers of (position, beats to the
/// next marker), the last one with the tempo instead. Each marker is a
/// downbeat. A grid with tempo changes is read as its first section.
fn parse_beatgrid(b: &[u8]) -> Option<Beatgrid> {
    let b = b.strip_prefix(&[1, 0])?;
    let n = be_u32(b, 0)? as usize;
    if n == 0 {
        return None;
    }
    let marker = |i: usize| b.get(4 + i * 8..12 + i * 8);
    let f32_at = |m: &[u8], at: usize| f32::from_be_bytes(m[at..at + 4].try_into().unwrap()) as f64;
    let first = marker(0)?;
    let start = f32_at(first, 0);
    let bpm = if n == 1 {
        f32_at(first, 4)
    } else {
        let beats = be_u32(first, 4)? as f64;
        let next = f32_at(marker(1)?, 0);
        beats * 60.0 / (next - start)
    };
    if !(20.0..=400.0).contains(&bpm) || !start.is_finite() {
        return None;
    }
    let bar = 4.0 * 60.0 / bpm;
    Some(Beatgrid {
        bpm,
        first_beat: start.rem_euclid(bar),
    })
}

/// Serato libraries on this computer: the one in the Music folder, and
/// one at the top of each mounted drive.
pub fn find() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(music) = dirs::audio_dir().or_else(|| dirs::home_dir().map(|h| h.join("Music"))) {
        dirs.push(music.join("_Serato_"));
    }
    if let Ok(volumes) = std::fs::read_dir("/Volumes") {
        dirs.extend(volumes.flatten().map(|v| v.path().join("_Serato_")));
    }
    #[cfg(windows)]
    for letter in b'D'..=b'Z' {
        dirs.push(PathBuf::from(format!("{}:\\_Serato_", letter as char)));
    }
    let mut seen = HashSet::new();
    dirs.retain(|d| is_library(d) && seen.insert(d.clone()));
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(name: &[u8; 4], value: &[u8]) -> Vec<u8> {
        let mut out = name.to_vec();
        out.extend((value.len() as u32).to_be_bytes());
        out.extend(value);
        out
    }

    fn text(s: &str) -> Vec<u8> {
        s.encode_utf16().flat_map(u16::to_be_bytes).collect()
    }

    #[test]
    fn reads_the_track_list_and_crates() {
        let mut db = field(b"vrsn", &text("2.0/Serato Scratch LIVE Database"));
        let mut otrk = field(b"pfil", &text("Users/dj/Music/a.mp3"));
        otrk.extend(field(b"tsng", &text("Song")));
        otrk.extend(field(b"tart", &text("Artist")));
        otrk.extend(field(b"tbpm", &text("124")));
        db.extend(field(b"otrk", &otrk));
        db.extend(field(b"otrk", &field(b"pfil", &text("/abs/b.flac"))));

        let tracks = parse_database(&db, Path::new("/")).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].path, Path::new("/Users/dj/Music/a.mp3"));
        assert_eq!(
            (tracks[0].title.as_str(), tracks[0].artist.as_str()),
            ("Song", "Artist")
        );
        assert_eq!(tracks[1].path, Path::new("/abs/b.flac"));

        let mut cr = field(b"vrsn", &text("1.0/Serato ScratchLive Crate"));
        cr.extend(field(b"otrk", &field(b"ptrk", &text("Music/a.mp3"))));
        cr.extend(field(b"otrk", &field(b"ptrk", &text("Music/c.mp3"))));
        let paths = parse_crate(&cr, Path::new("/Volumes/USB"));
        assert_eq!(
            paths,
            [
                PathBuf::from("/Volumes/USB/Music/a.mp3"),
                PathBuf::from("/Volumes/USB/Music/c.mp3")
            ]
        );
        assert_eq!(crate_name(Path::new("Gigs%%Club.crate")), "Gigs › Club");

        assert!(parse_database(b"nope", Path::new("/")).is_err());
    }

    fn entry(kind: &str, data: &[u8]) -> Vec<u8> {
        let mut out = kind.as_bytes().to_vec();
        out.push(0);
        out.extend((data.len() as u32).to_be_bytes());
        out.extend(data);
        out
    }

    fn markers2() -> Vec<u8> {
        let mut b = vec![1, 1];
        b.extend(entry("COLOR", &[0, 0xff, 0xff, 0xff]));
        // Hot cue 1 (index 0) at 1.5 s and hot cue 4 at 62.25 s.
        for (i, ms) in [(0u8, 1500u32), (3, 62250)] {
            let mut c = vec![0, i];
            c.extend(ms.to_be_bytes());
            c.extend([0, 0xcc, 0, 0, 0, 0]);
            c.extend(b"Drop\0");
            b.extend(entry("CUE", &c));
        }
        // Loops 2 and 1: loop 1 is the one kept.
        for (i, a, z) in [(1u8, 90_000u32, 98_000u32), (0, 30_000, 34_000)] {
            let mut l = vec![0, i];
            l.extend(a.to_be_bytes());
            l.extend(z.to_be_bytes());
            l.extend([0xff; 4]);
            l.extend([0, 0x27, 0xaa, 0xe1, 0, 0]);
            l.extend(b"\0");
            b.extend(entry("LOOP", &l));
        }
        b.extend(entry("BPMLOCK", &[0]));
        b.push(0);
        // Serato writes it as base64 in lines of 72, without padding.
        let enc = base64::engine::general_purpose::STANDARD_NO_PAD.encode(&b);
        let lines: Vec<&str> = enc
            .as_bytes()
            .chunks(72)
            .map(|c| std::str::from_utf8(c).unwrap())
            .collect();
        let mut out = vec![1, 1];
        out.extend(lines.join("\n").into_bytes());
        out.push(0);
        out
    }

    #[test]
    fn reads_hot_cues_and_loops() {
        let cues = parse_markers2(&markers2());
        assert_eq!(cues.hot_cues[0], Some(1.5));
        assert_eq!(cues.hot_cues[3], Some(62.25));
        assert_eq!(cues.hot_cues.iter().flatten().count(), 2);
        assert_eq!(cues.saved_loop, Some((30.0, 34.0)));
        assert_eq!(cues.cue, 0.0);
        assert_eq!(parse_markers2(b"junk"), SavedCues::default());
    }

    #[test]
    fn reads_beatgrids() {
        let mut one = vec![1, 0, 0, 0, 0, 1];
        one.extend(0.25f32.to_be_bytes());
        one.extend(128.0f32.to_be_bytes());
        one.push(0);
        let g = parse_beatgrid(&one).unwrap();
        assert!((g.bpm - 128.0).abs() < 1e-4);
        assert!((g.first_beat - 0.25).abs() < 1e-6);

        // Two sections: the first one, 64 beats over 32 s, is 120 BPM, and
        // a marker before the start is wrapped into the first bar.
        let mut two = vec![1, 0, 0, 0, 0, 2];
        two.extend((-1.5f32).to_be_bytes());
        two.extend(64u32.to_be_bytes());
        two.extend(30.5f32.to_be_bytes());
        two.extend(124.0f32.to_be_bytes());
        let g = parse_beatgrid(&two).unwrap();
        assert!((g.bpm - 120.0).abs() < 1e-4);
        assert!((g.first_beat - 0.5).abs() < 1e-5);

        assert_eq!(parse_beatgrid(&[1, 0, 0, 0, 0, 0]), None);
    }

    #[test]
    fn mp4_and_flac_tags_unwrap() {
        let mut inner = b"application/octet-stream\0\0Serato Markers2\0".to_vec();
        let payload = markers2();
        inner.extend(&payload);
        let enc = base64::engine::general_purpose::STANDARD.encode(&inner);
        assert_eq!(unwrap_text(&enc).unwrap(), payload);
    }
}
