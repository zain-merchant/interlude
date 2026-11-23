//! The splitter end to end, with a tiny stand-in model (`tests/data/
//! fake-stems.onnx`): drums are 1/8 of the mix, bass 1/4, other 1/8 and
//! vocals 1/2, over 4096-sample segments.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dj_engine::stems::{STORED_BASS, STORED_DRUMS, STORED_VOCALS};
use dj_engine::Track;
use dj_stems::{CacheKey, Settings, Splitter, Status};

/// The stand-in model, in a folder of its own: the splitter puts a copy that
/// loads quickly beside it.
fn model() -> PathBuf {
    static MODEL: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    MODEL
        .get_or_init(|| {
            let dir = std::env::temp_dir().join(format!("stems-model-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let from = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/fake-stems.onnx");
            let to = dir.join("fake-stems.onnx");
            std::fs::copy(from, &to).unwrap();
            to
        })
        .clone()
}

fn track(seconds: f32) -> Arc<Track> {
    let frames = (44_100.0 * seconds) as usize;
    let samples = (0..frames * 2)
        .map(|i| ((i / 2) as f32 * 0.03).sin() * 0.5)
        .collect();
    Arc::new(Track::from_stereo(samples, 44_100))
}

fn wait_ready(s: &Splitter, deck: usize) {
    let start = Instant::now();
    loop {
        match s.status(deck) {
            Status::Ready => return,
            Status::Failed(e) => panic!("failed: {e}"),
            _ if start.elapsed() > Duration::from_secs(30) => {
                panic!("timed out: {:?}", s.status(deck))
            }
            _ => std::thread::sleep(Duration::from_millis(5)),
        }
    }
}

fn check(track: &Track) {
    let stems = track.stems.get().expect("stems attached");
    assert!(stems.is_complete());
    for f in (0..track.frames()).step_by(101) {
        let l = track.samples[f * 2];
        let v = stems.get(f, STORED_VOCALS).0;
        let b = stems.get(f, STORED_BASS).0;
        let d = stems.get(f, STORED_DRUMS).0;
        assert!((v - l * 0.5).abs() < 2e-4, "vocals at {f}");
        assert!((b - l * 0.25).abs() < 2e-4, "bass at {f}");
        assert!((d - l * 0.125).abs() < 2e-4, "drums at {f}");
    }
}

#[test]
fn splits_two_decks_and_caches() {
    let dir = std::env::temp_dir().join(format!("oss-dj-splitter-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let settings = Settings {
        model: None,
        cache_dir: Some(dir.join("cache")),
        ..Default::default()
    };
    let s = Splitter::new(
        settings.clone(),
        Box::new(|deck| if deck == 0 { 0.0 } else { 0.5 }),
    );

    let file = dir.join("song.wav");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(&file, b"stand-in for a music file").unwrap();
    let key = CacheKey::for_file(&file, "fake");

    let a = track(3.0);
    let b = track(2.0);
    s.split(0, a.clone(), key.clone());
    s.split(1, b.clone(), None);
    // No model yet: waits for one.
    let start = Instant::now();
    while s.status(0) != Status::NeedsModel {
        assert!(
            start.elapsed() < Duration::from_secs(10),
            "{:?}",
            s.status(0)
        );
        std::thread::sleep(Duration::from_millis(5));
    }
    s.configure(Settings {
        model: Some(model()),
        ..settings.clone()
    });
    wait_ready(&s, 0);
    wait_ready(&s, 1);
    check(&a);
    check(&b);

    // The same file again comes straight from the cache, even with no model.
    s.configure(Settings {
        model: None,
        ..settings
    });
    let again = track(3.0);
    s.split(0, again.clone(), key);
    wait_ready(&s, 0);
    check(&again);

    s.stop(0);
    assert_eq!(s.status(0), Status::Off);
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
}

/// The model is dropped whenever splitting goes idle and loaded again for
/// the next track. ONNX Runtime allows one environment per process, so the
/// second load used to fail with "only one environment is allowed".
#[test]
fn model_loads_again_after_being_dropped() {
    for _ in 0..3 {
        let m = dj_stems::Model::load(&model()).expect("model loads");
        assert!(m.segment() > 0);
        drop(m);
    }
}

/// Once there's nothing to split, the model gets a copy that loads quickly.
#[test]
fn makes_a_quick_copy_when_idle() {
    let dir = std::env::temp_dir().join(format!("stems-idle-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("m.onnx");
    std::fs::copy(model(), &path).unwrap();
    let off = Settings {
        enabled: false,
        model: Some(path.clone()),
        ..Default::default()
    };
    let s = Splitter::new(off.clone(), Box::new(|_| 0.0));
    std::thread::sleep(Duration::from_millis(200));
    assert!(!dj_stems::quick::exists(&path), "not while stems are off");
    s.configure(Settings {
        enabled: true,
        ..off
    });
    let start = Instant::now();
    while !dj_stems::quick::exists(&path) {
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(5));
    }
    let a = track(2.0);
    s.split(0, a.clone(), None);
    wait_ready(&s, 0);
    check(&a);
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
}
