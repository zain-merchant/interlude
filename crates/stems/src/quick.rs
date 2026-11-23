//! A copy of the model that loads quickly.
//!
//! Every time ONNX Runtime loads a model it first optimises it, which for
//! this one takes seconds and peaks at nearly 5 GB. So that's done once, and
//! the result is saved beside the model: from then on loading takes a
//! fraction of a second and little more memory than the model itself.
//!
//! Only optimisations that aren't tied to the processor are saved (level 2).
//! The ones that are get applied as the copy is loaded, so it gives exactly
//! what the model does. It's still kept to the build of ONNX Runtime and the
//! kind of computer that made it.
//!
//! The copy's name says what it was made from and with, and holds its hash.
//! Anything that doesn't match is ignored, and cleared away by the next one
//! made. Without a copy, or when one can't be made or won't load, the model
//! is loaded as it is.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use ort::session::builder::GraphOptimizationLevel;
use sha2::{Digest, Sha256};

use crate::download::{file_sha256, free_space, hex};
use crate::{model, Error};

/// Bump to have every copy made again.
const REVISION: u32 = 1;
/// The end of every copy's name.
const SUFFIX: &str = ".quick.onnx";
/// The end of one that's still being made.
const UNFINISHED: &str = ".quick.building";
/// Room to leave on the disk.
const RESERVE: u64 = 200_000_000;

/// Held while a copy is made, so only one is at a time.
static MAKING: Mutex<()> = Mutex::new(());
/// A file as it was: how long, and when it was last written.
type Seen = (u64, SystemTime);
/// Copies that have been checked since the app started, as they were then.
static CHECKED: Mutex<Option<HashMap<PathBuf, Seen>>> = Mutex::new(None);

fn checked() -> MutexGuard<'static, Option<HashMap<PathBuf, Seen>>> {
    CHECKED.lock().unwrap_or_else(|e| e.into_inner())
}

fn seen(path: &Path) -> Option<Seen> {
    let m = fs::metadata(path).ok()?;
    Some((m.len(), m.modified().ok()?))
}

/// What a copy of `model` depends on, as a short hash, or `None` if there's
/// no such model.
fn key(model: &Path) -> Option<String> {
    let m = fs::metadata(model).ok()?;
    let made = m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    let mut h = Sha256::new();
    for part in [
        ort::info().to_string(),
        std::env::consts::ARCH.into(),
        std::env::consts::OS.into(),
        REVISION.to_string(),
        m.len().to_string(),
        made.as_nanos().to_string(),
    ] {
        h.update(part.as_bytes());
        h.update([0]);
    }
    Some(hex(&h.finalize())[..16].to_string())
}

/// `name.onnx` gives `name`.
fn stem(model: &Path) -> Option<String> {
    Some(model.file_stem()?.to_str()?.to_string())
}

/// Files beside `model` that are copies of it, whole or not.
fn all(model: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(stem)) = (model.parent(), stem(model)) else {
        return vec![];
    };
    let start = format!("{stem}.");
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
                n.starts_with(&start) && (n.ends_with(SUFFIX) || n.ends_with(UNFINISHED))
            })
        })
        .collect()
}

/// The copy of `model` to load, if there is one, with the hash it should have.
fn current(model: &Path) -> Option<(PathBuf, String)> {
    let start = format!("{}.{}.", stem(model)?, key(model)?);
    all(model).into_iter().find_map(|p| {
        let name = p.file_name()?.to_str()?;
        let hash = name.strip_prefix(&start)?.strip_suffix(SUFFIX)?.to_string();
        Some((p, hash))
    })
}

/// Whether `model` has a copy that loads quickly.
pub fn exists(model: &Path) -> bool {
    current(model).is_some()
}

/// The copy of `model`, checked the first time it's asked for. One that's
/// damaged is deleted.
pub(crate) fn find(model: &Path) -> Option<PathBuf> {
    let (path, hash) = current(model)?;
    let mut checked = checked();
    let checked = checked.get_or_insert_default();
    let now = seen(&path)?;
    if checked.get(&path) != Some(&now) {
        if !file_sha256(&path).is_ok_and(|h| h.starts_with(&hash)) {
            eprintln!("stems: the quick copy of the model is damaged; it'll be made again");
            let _ = fs::remove_file(&path);
            return None;
        }
        checked.insert(path.clone(), now);
    }
    Some(path)
}

/// Makes the copy of `model`, unless it's there. Takes a few seconds, and
/// the memory that loading the model itself does.
pub fn make(model: &Path) -> Result<(), Error> {
    let _one = MAKING.lock().unwrap_or_else(|e| e.into_inner());
    if exists(model) {
        return Ok(());
    }
    let (Some(dir), Some(stem), Some(key)) = (model.parent(), stem(model), key(model)) else {
        return Err(Error::Model("no model to copy".into()));
    };
    let started = Instant::now();
    for old in all(model) {
        fs::remove_file(old)?;
    }
    // Its weights take twice as much: 32 bits each where the model has 16.
    let need = fs::metadata(model)?.len() * 22 / 10 + RESERVE;
    if free_space(dir).is_some_and(|free| free < need) {
        return Err(Error::Model("no room for a quick copy".into()));
    }
    let building = dir.join(format!("{stem}{UNFINISHED}"));
    let made = (|| {
        let session = model::builder(GraphOptimizationLevel::Level2)?
            .with_optimized_model_path(&building)?
            .commit_from_file(model)?;
        drop(session);
        fs::File::open(&building)?.sync_all()?;
        let hash = file_sha256(&building)?;
        let path = dir.join(format!("{stem}.{key}.{}{SUFFIX}", &hash[..16]));
        fs::rename(&building, &path)?;
        // The model may have been removed or replaced meanwhile.
        if self::key(model).as_ref() != Some(&key) {
            fs::remove_file(path)?;
            return Err(Error::Model("the model changed".into()));
        }
        if let Some(s) = seen(&path) {
            checked().get_or_insert_default().insert(path, s);
        }
        Ok(())
    })();
    if made.is_err() {
        let _ = fs::remove_file(&building);
    } else {
        eprintln!(
            "stems: made a quick copy of the model in {:.1} s",
            started.elapsed().as_secs_f64()
        );
    }
    made
}

/// Bytes the copies of `model` take.
pub fn size(model: &Path) -> u64 {
    all(model)
        .iter()
        .filter_map(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .sum()
}

/// Deletes the copies of `model`.
pub fn remove(model: &Path) -> std::io::Result<()> {
    all(model).iter().try_for_each(fs::remove_file)
}
