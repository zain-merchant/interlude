//! Where Interlude keeps its files, and moving them over from the days
//! when the app was called oss-dj.

use std::path::{Path, PathBuf};

/// The app's name, as it appears in folder and file names.
pub const NAME: &str = "Interlude";
/// The bundle identifier the app had as oss-dj.
const OLD_IDENTIFIER: &str = "dev.ossdj.app";

/// The app's own folder: the library, settings, stems, models and logs.
pub fn data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(NAME))
}

/// The folder set recordings are saved in.
pub fn recordings_dir() -> Option<PathBuf> {
    music_dir().map(|d| d.join(format!("{NAME} recordings")))
}

fn music_dir() -> Option<PathBuf> {
    dirs::audio_dir().or_else(|| dirs::home_dir().map(|h| h.join("Music")))
}

/// Moves what oss-dj left behind to where Interlude looks for it. Call
/// before anything opens those files, and before the window is made (the
/// web view's saved settings are copied too). Runs once in practice: each
/// step only happens while the new place is still empty. Returns what it
/// did, for the log (which can't be open yet: it lives in the new folder).
pub fn migrate(identifier: &str) -> Vec<String> {
    let mut notes = vec![];
    if let Some(data) = dirs::data_dir() {
        move_if_new(&data.join("oss-dj"), &data.join(NAME), &mut notes);
        // Mappings made with MIDI learn lived under the old identifier.
        move_if_new(
            &data.join(OLD_IDENTIFIER).join("controllers"),
            &data.join(identifier).join("controllers"),
            &mut notes,
        );
    }
    if let (Some(music), Some(new)) = (music_dir(), recordings_dir()) {
        move_if_new(&music.join("oss-dj recordings"), &new, &mut notes);
    }
    // The UI's settings (key mappings, sampler, zoom...) are in the web
    // view's storage, which macOS keeps per identifier. Copied rather than
    // moved, so going back to an old build still finds them.
    #[cfg(target_os = "macos")]
    if let Some(lib) = dirs::home_dir().map(|h| h.join("Library").join("WebKit")) {
        let new = lib.join(identifier);
        if !new.exists() {
            let old = lib.join(OLD_IDENTIFIER);
            if old.is_dir() {
                notes.push(match copy_dir(&old, &new) {
                    Ok(()) => format!("copied settings from {}", old.display()),
                    Err(e) => format!("couldn't copy settings from {}: {e}", old.display()),
                });
            }
        }
    }
    notes
}

/// Renames `old` to `new` if `old` exists and `new` doesn't.
fn move_if_new(old: &Path, new: &Path, notes: &mut Vec<String>) {
    if !old.exists() || new.exists() {
        return;
    }
    if let Some(parent) = new.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    notes.push(match std::fs::rename(old, new) {
        Ok(()) => format!("moved {} to {}", old.display(), new.display()),
        Err(e) => format!("couldn't move {} to {}: {e}", old.display(), new.display()),
    });
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_only_into_an_empty_place() {
        let dir = std::env::temp_dir().join(format!("interlude-paths-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let old = dir.join("old");
        let new = dir.join("deep").join("new");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("a"), "1").unwrap();
        move_if_new(&old, &new, &mut vec![]);
        assert!(!old.exists());
        assert_eq!(std::fs::read_to_string(new.join("a")).unwrap(), "1");

        // Something already there: left alone.
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("a"), "2").unwrap();
        move_if_new(&old, &new, &mut vec![]);
        assert_eq!(std::fs::read_to_string(new.join("a")).unwrap(), "1");
        assert!(old.join("a").exists());

        let copy = dir.join("copy");
        std::fs::create_dir_all(old.join("sub")).unwrap();
        std::fs::write(old.join("sub").join("b"), "3").unwrap();
        copy_dir(&old, &copy).unwrap();
        assert_eq!(
            std::fs::read_to_string(copy.join("sub").join("b")).unwrap(),
            "3"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
