//! Reads a Rekordbox collection exported as XML (File, Export Collection in
//! xml format). Pioneer documents the format; `master.db` itself is
//! encrypted, so the export is the supported way in.
//!
//! Positions are in seconds. Hot cues are `POSITION_MARK`s numbered 0 to 7,
//! memory cues are numbered -1, and `Type="4"` marks a loop. A `TEMPO`
//! marker's `Battito` is which beat of the bar (1 to 4) it falls on.

use std::collections::HashMap;
use std::path::PathBuf;

use dj_engine::{Beatgrid, HOT_CUES};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::{Collection, ImportPlaylist, ImportTrack};

/// A track being read, with its memory cues and its loops (number, start, end).
type Reading = (ImportTrack, Vec<f64>, Vec<(i32, f64, f64)>);

/// Parses a `rekordbox.xml` file's contents.
pub fn parse(xml: &str) -> Result<Collection, String> {
    let mut reader = Reader::from_str(xml);
    let mut out = Collection::default();
    let mut ids: HashMap<String, PathBuf> = HashMap::new();
    // The track being read and its memory cues and loops.
    let mut track: Option<Reading> = None;
    // Playlist folders we're inside, and the playlist being read.
    let mut folders: Vec<String> = Vec::new();
    let mut playlist: Option<(ImportPlaylist, bool)> = None;
    let mut in_playlists = false;
    let mut saw_root = false;
    loop {
        let event = reader
            .read_event()
            .map_err(|e| format!("not a Rekordbox XML file ({e})"))?;
        let (e, empty) = match &event {
            Event::Start(e) => (e, false),
            Event::Empty(e) => (e, true),
            Event::End(e) => {
                match e.name().as_ref() {
                    b"TRACK" if !in_playlists => finish_track(&mut out, track.take()),
                    b"NODE" => {
                        if let Some((p, _)) = playlist.take() {
                            out.playlists.push(p);
                        } else {
                            folders.pop();
                        }
                    }
                    b"PLAYLISTS" => in_playlists = false,
                    _ => {}
                }
                continue;
            }
            Event::Eof => break,
            _ => continue,
        };
        match e.name().as_ref() {
            b"DJ_PLAYLISTS" => saw_root = true,
            b"PLAYLISTS" => in_playlists = !empty,
            b"TRACK" if !in_playlists => {
                let a = attrs(e);
                let Some(path) = a.get("Location").and_then(|l| location_to_path(l)) else {
                    continue;
                };
                if let Some(id) = a.get("TrackID") {
                    ids.insert(id.clone(), path.clone());
                }
                let t = ImportTrack {
                    path,
                    title: a.get("Name").cloned().unwrap_or_default(),
                    artist: a.get("Artist").cloned().unwrap_or_default(),
                    album: a.get("Album").cloned().unwrap_or_default(),
                    genre: a.get("Genre").cloned().unwrap_or_default(),
                    ..ImportTrack::default()
                };
                track = Some((t, Vec::new(), Vec::new()));
                if empty {
                    finish_track(&mut out, track.take());
                }
            }
            b"TEMPO" => {
                let Some((t, _, _)) = track.as_mut() else {
                    continue;
                };
                if t.grid.is_some() {
                    continue; // tempo changes: the first marker sets the grid
                }
                let a = attrs(e);
                let (Some(start), Some(bpm)) = (num(&a, "Inizio"), num(&a, "Bpm")) else {
                    continue;
                };
                if bpm <= 0.0 {
                    continue;
                }
                let beat_in_bar = num(&a, "Battito").unwrap_or(1.0).clamp(1.0, 4.0);
                let bar = 4.0 * 60.0 / bpm;
                let downbeat = start - (beat_in_bar - 1.0) * 60.0 / bpm;
                t.grid = Some(Beatgrid {
                    bpm,
                    first_beat: downbeat.rem_euclid(bar),
                });
            }
            b"POSITION_MARK" => {
                let Some((t, memory, loops)) = track.as_mut() else {
                    continue;
                };
                let a = attrs(e);
                let Some(start) = num(&a, "Start") else {
                    continue;
                };
                let n = num(&a, "Num").map_or(-1, |n| n as i32);
                let is_loop = a.get("Type").map(String::as_str) == Some("4");
                if (0..HOT_CUES as i32).contains(&n) {
                    t.cues.hot_cues[n as usize] = Some(start);
                } else if !is_loop {
                    memory.push(start);
                }
                if is_loop {
                    if let Some(end) = num(&a, "End").filter(|&end| end > start) {
                        loops.push((n, start, end));
                    }
                }
            }
            b"NODE" if in_playlists => {
                let a = attrs(e);
                let name = a.get("Name").cloned().unwrap_or_default();
                if a.get("Type").map(String::as_str) == Some("1") {
                    let mut full = folders.clone();
                    full.push(name);
                    let by_path = a.get("KeyType").map(String::as_str) == Some("1");
                    let p = ImportPlaylist {
                        name: full.join(" › "),
                        paths: Vec::new(),
                    };
                    if empty {
                        out.playlists.push(p);
                    } else {
                        playlist = Some((p, by_path));
                    }
                } else if !empty {
                    // A folder. The root folder doesn't name anything.
                    folders.push(name);
                    if folders.len() == 1 && folders[0] == "ROOT" {
                        folders[0] = String::new();
                    }
                }
            }
            b"TRACK" => {
                let Some((p, by_path)) = playlist.as_mut() else {
                    continue;
                };
                let a = attrs(e);
                let path = match a.get("Key") {
                    Some(k) if *by_path => location_to_path(k),
                    Some(k) => ids.get(k).cloned(),
                    None => None,
                };
                if let Some(path) = path {
                    p.paths.push(path);
                }
            }
            _ => {}
        }
    }
    if !saw_root {
        return Err("not a Rekordbox XML file".into());
    }
    // Folder names joined with an empty root start with " › ".
    for p in &mut out.playlists {
        if let Some(rest) = p.name.strip_prefix(" › ") {
            p.name = rest.to_string();
        }
    }
    Ok(out)
}

/// Files the main cue (the earliest memory cue) and saved loop (a memory
/// loop, else the first hot loop) and adds the track.
fn finish_track(out: &mut Collection, track: Option<Reading>) {
    let Some((mut t, memory, mut loops)) = track else {
        return;
    };
    if let Some(first) = memory.iter().copied().reduce(f64::min) {
        t.cues.cue = first;
    }
    loops.sort_by_key(|l| (l.0 >= 0, l.0));
    t.cues.saved_loop = loops.first().map(|&(_, s, e)| (s, e));
    out.tracks.push(t);
}

fn attrs(e: &BytesStart<'_>) -> HashMap<String, String> {
    e.attributes()
        .flatten()
        .filter_map(|a| {
            let key = String::from_utf8_lossy(a.key.as_ref()).into_owned();
            let value = a.unescape_value().ok()?.into_owned();
            Some((key, value))
        })
        .collect()
}

fn num(a: &HashMap<String, String>, key: &str) -> Option<f64> {
    a.get(key)?
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite())
}

/// `file://localhost/Users/me/Music/a%20b.mp3` to a path. Windows exports
/// read `file://localhost/C:/Music/...`.
pub fn location_to_path(location: &str) -> Option<PathBuf> {
    let rest = location
        .strip_prefix("file://localhost")
        .or_else(|| location.strip_prefix("file://"))?;
    let decoded = percent_decode(rest)?;
    let b = decoded.as_bytes();
    let windows = b.len() > 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':';
    Some(PathBuf::from(if windows {
        &decoded[1..]
    } else {
        &decoded[..]
    }))
}

fn percent_decode(s: &str) -> Option<String> {
    let mut out = Vec::with_capacity(s.len());
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.0.0" Company="AlphaTheta"/>
  <COLLECTION Entries="3">
    <TRACK TrackID="11" Name="Around the World" Artist="Daft Punk" Album="Homework" Genre="House"
        AverageBpm="121.00" Location="file://localhost/Users/dj/Music/DJ/Daft%20Punk%20-%20Around%20the%20World.mp3">
      <TEMPO Inizio="0.512" Bpm="121.00" Metro="4/4" Battito="2"/>
      <TEMPO Inizio="100.0" Bpm="122.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="" Type="0" Start="33.250" Num="-1"/>
      <POSITION_MARK Name="" Type="0" Start="1.000" Num="-1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.000" Num="0" Red="40" Green="226" Blue="20"/>
      <POSITION_MARK Name="" Type="4" Start="96.000" End="104.000" Num="2"/>
      <POSITION_MARK Name="" Type="4" Start="16.000" End="20.000" Num="-1"/>
    </TRACK>
    <TRACK TrackID="12" Name="Plain" Artist="" Location="file://localhost/C:/Music/plain.wav"/>
    <TRACK TrackID="13" Name="No location"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="2">
      <NODE Name="Friday" Type="1" KeyType="0" Entries="2">
        <TRACK Key="12"/>
        <TRACK Key="11"/>
      </NODE>
      <NODE Type="0" Name="Gigs" Count="1">
        <NODE Name="Club &amp; bar" Type="1" KeyType="1" Entries="1">
          <TRACK Key="file://localhost/C:/Music/plain.wav"/>
        </NODE>
      </NODE>
      <NODE Name="Empty" Type="1" KeyType="0" Entries="0"/>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>"#;

    #[test]
    fn reads_tracks_cues_grids_and_playlists() {
        let c = parse(XML).unwrap();
        assert_eq!(c.tracks.len(), 2, "the track without a file is skipped");
        let t = &c.tracks[0];
        assert_eq!(
            t.path,
            PathBuf::from("/Users/dj/Music/DJ/Daft Punk - Around the World.mp3")
        );
        assert_eq!(
            (t.title.as_str(), t.artist.as_str()),
            ("Around the World", "Daft Punk")
        );
        assert_eq!((t.album.as_str(), t.genre.as_str()), ("Homework", "House"));
        // Earliest memory cue is the main cue; hot cue A; hot loop 3 is a hot cue
        // too; the memory loop wins as the saved loop.
        assert_eq!(t.cues.cue, 1.0);
        assert_eq!(t.cues.hot_cues[0], Some(64.0));
        assert_eq!(t.cues.hot_cues[2], Some(96.0));
        assert_eq!(t.cues.saved_loop, Some((16.0, 20.0)));
        // Beat 2 of a bar at 0.512 s: the bar starts one beat earlier, wrapped
        // into the first bar.
        let g = t.grid.unwrap();
        assert_eq!(g.bpm, 121.0);
        let beat: f64 = 60.0 / 121.0;
        let bar = 4.0 * beat;
        assert!((g.first_beat - (0.512 - beat).rem_euclid(bar)).abs() < 1e-9);

        assert_eq!(c.tracks[1].path, PathBuf::from("C:/Music/plain.wav"));
        assert_eq!(c.tracks[1].grid, None);

        let names: Vec<_> = c.playlists.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["Friday", "Gigs › Club & bar", "Empty"]);
        assert_eq!(
            c.playlists[0].paths,
            [PathBuf::from("C:/Music/plain.wav"), t.path.clone()]
        );
        assert_eq!(c.playlists[1].paths, [PathBuf::from("C:/Music/plain.wav")]);
        assert!(c.playlists[2].paths.is_empty());
    }

    #[test]
    fn other_files_are_refused() {
        assert!(parse("<plist><dict/></plist>").is_err());
        assert!(parse("not xml at all <<<").is_err());
    }

    #[test]
    fn locations_decode() {
        assert_eq!(
            location_to_path("file://localhost/Volumes/USB/%C3%89t%C3%A9%2B.mp3"),
            Some(PathBuf::from("/Volumes/USB/Été+.mp3"))
        );
        assert_eq!(location_to_path("http://example.com/a.mp3"), None);
    }
}
