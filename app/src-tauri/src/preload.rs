//! Decoding the track selected in the library before it's loaded, so that
//! pressing Load (on screen, on the keyboard or on a controller) finds it
//! ready and the deck fills at once.
//!
//! One track at a time: a newer selection replaces the older one, and only
//! one decode runs. A selection made while one is running waits for it,
//! so browsing quickly through the list doesn't start a decode per row. A
//! decoded track that isn't loaded is let go after a while, so it doesn't
//! hold its memory (about 10 MB a minute of audio) for nothing.

use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use dj_engine::{Known, Track};

/// How long a decoded track that nobody loads is kept.
const KEEP: Duration = Duration::from_secs(60);

type Decoded = Result<Arc<Track>, String>;

#[derive(Default)]
struct Slot {
    /// The track asked for last, and what it was decoded with.
    want: Option<(String, Known)>,
    /// The track being decoded now.
    running: Option<String>,
    /// The track decoded last.
    done: Option<(String, Known, Decoded)>,
    /// Counts decodes, so a timer knows whether its track was replaced.
    generation: u64,
}

#[derive(Default)]
pub struct Preload {
    slot: Mutex<Slot>,
    changed: Condvar,
}

impl Preload {
    /// Starts decoding `path` with what the library knows about it, unless
    /// it's already decoded or on its way.
    pub fn request(self: &Arc<Self>, path: String, known: Known) {
        let mut slot = self.slot.lock().unwrap();
        let have = |p: &String| *p == path;
        if slot.running.as_ref().is_some_and(have)
            || slot
                .done
                .as_ref()
                .is_some_and(|(p, k, _)| have(p) && *k == known)
        {
            slot.want = None;
            return;
        }
        // Whatever was decoded for another track goes now.
        slot.done = None;
        if slot.running.is_some() {
            slot.want = Some((path, known));
            return;
        }
        slot.want = None;
        slot.running = Some(path.clone());
        drop(slot);
        self.start(path, known);
    }

    /// Decodes `path`, then whatever was asked for meanwhile, until nothing
    /// is wanted. `running` already names `path`.
    fn start(self: &Arc<Self>, path: String, known: Known) {
        let this = self.clone();
        let spawned = std::thread::Builder::new()
            .name("preload".into())
            .spawn(move || {
                let (mut path, mut known) = (path, known);
                loop {
                    let started = std::time::Instant::now();
                    let decoded = Track::load_known(&path, known)
                        .map(Arc::new)
                        .map_err(|e| e.to_string());
                    let mut slot = this.slot.lock().unwrap();
                    slot.generation += 1;
                    let generation = slot.generation;
                    if decoded.is_ok() {
                        eprintln!(
                            "preloaded {} in {:.2} s",
                            short(&path),
                            started.elapsed().as_secs_f64()
                        );
                    }
                    let next = slot.want.take();
                    // Kept unless a newer selection replaced it.
                    if next.is_none() {
                        slot.done = Some((path, known, decoded));
                    }
                    slot.running = next.as_ref().map(|(p, _)| p.clone());
                    this.changed.notify_all();
                    drop(slot);
                    match next {
                        Some(n) => (path, known) = n,
                        None => {
                            this.expire_later(generation);
                            return;
                        }
                    }
                }
            });
        if spawned.is_err() {
            let mut slot = self.slot.lock().unwrap();
            slot.want = None;
            slot.running = None;
            self.changed.notify_all();
        }
    }

    /// Lets go of the decoded track after [`KEEP`] if it's still the same.
    fn expire_later(self: &Arc<Self>, generation: u64) {
        let this = Arc::downgrade(self);
        let _ = std::thread::Builder::new()
            .name("preload-expiry".into())
            .spawn(move || {
                std::thread::sleep(KEEP);
                if let Some(this) = this.upgrade() {
                    let mut slot = this.slot.lock().unwrap();
                    if slot.generation == generation {
                        slot.done = None;
                    }
                }
            });
    }

    /// The decoded `path`, waiting for it if it's being decoded now.
    /// `None` when it wasn't asked for, or took a key or loudness from the
    /// library that `known` has replaced: the caller decodes it itself.
    /// Taking it empties the slot.
    pub fn take(&self, path: &str, known: Known) -> Option<Decoded> {
        let mut slot = self.slot.lock().unwrap();
        loop {
            if slot.done.as_ref().is_some_and(|(p, _, _)| p == path) {
                let (_, had, decoded) = slot.done.take()?;
                // A key or loudness taken from the library that has since
                // changed (the analyzer redid it) is out of date. One the
                // decode worked out itself is as good as the library's.
                // A grid found since is passed on by the caller anyway.
                let stale = |had: bool, same: bool| had && !same;
                if stale(had.key.is_some(), had.key == known.key)
                    || stale(had.loudness.is_some(), had.loudness == known.loudness)
                {
                    return None;
                }
                return Some(decoded);
            }
            if slot.running.as_deref() == Some(path) {
                // Loading it outranks whatever was selected since, which
                // would otherwise replace it as soon as it's decoded.
                slot.want = None;
                slot = self.changed.wait(slot).unwrap();
                continue;
            }
            // Still waiting behind another decode: the caller is quicker
            // decoding it now.
            if slot.want.as_ref().is_some_and(|(p, _)| p == path) {
                slot.want = None;
            }
            return None;
        }
    }
}

fn short(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Two seconds of a tone, as a WAV file in a fresh folder.
    fn wav(name: &str) -> String {
        let dir =
            std::env::temp_dir().join(format!("interlude-preload-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = hound::WavWriter::create(&path, spec).unwrap();
        for i in 0..44_100 * 2 {
            let v = ((i as f32 * 0.05).sin() * 8000.0) as i16;
            w.write_sample(v).unwrap();
            w.write_sample(v).unwrap();
        }
        w.finalize().unwrap();
        path.display().to_string()
    }

    /// Waits for the decodes asked for to finish.
    fn idle(p: &Preload) {
        let mut slot = p.slot.lock().unwrap();
        while slot.running.is_some() {
            slot = p.changed.wait(slot).unwrap();
        }
    }

    #[test]
    fn a_requested_track_is_taken_once_and_others_are_decoded_by_the_caller() {
        let a = wav("1a.wav");
        let b = wav("1b.wav");
        let p = Arc::new(Preload::default());
        p.request(a.clone(), Known::default());
        let t = p.take(&a, Known::default()).unwrap().unwrap();
        assert!(t.duration_secs() > 1.9);
        assert!(p.take(&a, Known::default()).is_none());
        assert!(p.take(&b, Known::default()).is_none());
    }

    #[test]
    fn a_newer_request_replaces_the_older_one() {
        let a = wav("2a.wav");
        let b = wav("2b.wav");
        let p = Arc::new(Preload::default());
        p.request(a.clone(), Known::default());
        p.request(b.clone(), Known::default());
        idle(&p);
        let t = p.take(&b, Known::default()).unwrap().unwrap();
        assert_eq!(t.path.as_deref(), Some(std::path::Path::new(&b)));
        assert!(p.take(&a, Known::default()).is_none());
    }

    #[test]
    fn a_track_decoded_with_a_key_the_library_has_since_changed_is_not_used() {
        let a = wav("3a.wav");
        let p = Arc::new(Preload::default());
        let before = Known {
            key: Some(None),
            ..Known::default()
        };
        p.request(a.clone(), before);
        idle(&p);
        let after = Known {
            key: Some(Some(dj_engine::Key::new(9, true))),
            ..Known::default()
        };
        assert!(p.take(&a, after).is_none());
        // Decoded without it known, it's used whatever the library says.
        p.request(a.clone(), Known::default());
        idle(&p);
        assert!(p.take(&a, after).is_some());
    }

    #[test]
    fn loading_a_track_still_being_decoded_waits_for_it_even_if_another_is_selected() {
        let a = wav("4a.wav");
        let b = wav("4b.wav");
        let p = Arc::new(Preload::default());
        p.request(a.clone(), Known::default());
        p.request(b.clone(), Known::default());
        let t = p.take(&a, Known::default()).unwrap().unwrap();
        assert_eq!(t.path.as_deref(), Some(std::path::Path::new(&a)));
        // The one selected after it was dropped: loading it decodes it then.
        idle(&p);
        assert!(p.take(&b, Known::default()).is_none());
    }
}
