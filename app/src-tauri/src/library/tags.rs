//! Title, artist, album and genre from a file's tags, falling back to the
//! file name ("Artist - Title") when a file has none.

use std::path::Path;

use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::probe::Probe;

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Tags {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
}

/// Reads the tags of an audio file. Never fails: a file with no readable
/// tags gets its title and artist from the file name.
pub fn read(path: &Path) -> Tags {
    let mut tags = from_file(path).unwrap_or_default();
    if tags.title.is_empty() {
        let (artist, title) = from_name(path);
        tags.title = title;
        if tags.artist.is_empty() {
            tags.artist = artist;
        }
    }
    tags
}

fn from_file(path: &Path) -> Option<Tags> {
    let file = Probe::open(path)
        .ok()?
        .options(ParseOptions::new().read_cover_art(false))
        .read()
        .ok()?;
    let tag = file.primary_tag().or_else(|| file.first_tag())?;
    let text = |v: Option<std::borrow::Cow<'_, str>>| {
        v.map(|s| s.trim().trim_matches('\0').to_string())
            .unwrap_or_default()
    };
    Some(Tags {
        title: text(tag.title()),
        artist: text(tag.artist()),
        album: text(tag.album()),
        genre: text(tag.genre()),
    })
}

/// Artist and title from an "Artist - Title" file name.
pub fn from_name(path: &Path) -> (String, String) {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    match stem.split_once(" - ") {
        Some((a, t)) => (a.trim().to_string(), t.trim().to_string()),
        None => (String::new(), stem),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_artist_and_title_from_file_name() {
        let (artist, title) = from_name(Path::new("/music/House/Daft Punk - Around the World.mp3"));
        assert_eq!(artist, "Daft Punk");
        assert_eq!(title, "Around the World");
    }

    #[test]
    fn file_without_separator_is_all_title() {
        assert_eq!(
            from_name(Path::new("/music/untitled_04.wav")),
            (String::new(), "untitled_04".to_string())
        );
    }

    #[test]
    fn reads_tags_from_a_tagged_file() {
        use lofty::config::WriteOptions;
        use lofty::tag::{Tag, TagType};
        let path = std::env::temp_dir().join(format!("oss-dj-tags-{}.wav", std::process::id()));
        crate::library::tests::write_wav(&path);
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title("Real Title".into());
        tag.set_artist("Real Artist".into());
        tag.set_album("An Album".into());
        tag.set_genre("House".into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        let t = read(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(
            t,
            Tags {
                title: "Real Title".into(),
                artist: "Real Artist".into(),
                album: "An Album".into(),
                genre: "House".into(),
            }
        );
    }

    #[test]
    fn unreadable_file_falls_back_to_its_name() {
        let t = read(Path::new("/nowhere/Artist - Song.mp3"));
        assert_eq!((t.artist.as_str(), t.title.as_str()), ("Artist", "Song"));
        assert_eq!(t.album, "");
    }
}
