//! The splitter end to end, with a tiny stand-in model (`tests/data/
//! fake-stems.onnx`): drums are 1/8 of the mix, bass 1/4, other 1/8 and
//! vocals 1/2, over 4096-sample segments.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dj_engine::stems::{STORED_BASS, STORED_DRUMS, STORED_VOCALS};
use dj_engine::Track;
use dj_stems::{CacheKey, Settings, Splitter, Status, When};

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

/// A splitter for `when`, with every play head at the start.
fn splitter(when: When, model: Option<PathBuf>) -> Splitter {
    let settings = Settings {
        when,
        model,
        ..Default::default()
    };
    Splitter::new(settings, Box::new(|_| 0.0))
}

/// Waits until `f`, or panics.
fn until(what: &str, f: impl Fn() -> bool) {
    let start = Instant::now();
    while !f() {
        assert!(start.elapsed() < Duration::from_secs(20), "{what}");
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// Long enough for anything that was going to happen to have happened.
fn settle() {
    std::thread::sleep(Duration::from_millis(300));
}

#[test]
fn nothing_splits_until_the_user_has_chosen() {
    let s = splitter(When::Unchosen, Some(model()));
    let a = track(2.0);
    s.split(0, a.clone(), None);
    s.use_stems(0);
    s.prepare(0, true);
    settle();
    assert_eq!(s.status(0), Status::Unchosen);
    assert!(a.stems.get().is_none(), "no memory taken");

    // Chosen while the track is loaded: it splits at once.
    s.configure(Settings {
        when: When::Always,
        ..s.settings()
    });
    wait_ready(&s, 0);
    check(&a);
}

#[test]
fn choosing_on_use_after_a_press_splits_that_track_only() {
    let s = splitter(When::Unchosen, Some(model()));
    let (a, b) = (track(2.0), track(2.0));
    s.split(0, a.clone(), None);
    s.split(1, b.clone(), None);
    s.use_stems(0);
    s.configure(Settings {
        when: When::OnUse,
        ..s.settings()
    });
    wait_ready(&s, 0);
    check(&a);
    settle();
    assert_eq!(s.status(1), Status::OnUse);
    assert!(b.stems.get().is_none());
}

#[test]
fn on_use_splits_each_deck_when_its_stems_are_used() {
    let s = splitter(When::OnUse, Some(model()));
    let (a, b) = (track(2.0), track(2.0));
    s.split(0, a.clone(), None);
    s.split(1, b.clone(), None);
    settle();
    for (deck, t) in [(0, &a), (1, &b)] {
        assert_eq!(s.status(deck), Status::OnUse);
        assert!(!s.is_here(deck));
        assert!(t.stems.get().is_none());
    }
    s.use_stems(1);
    wait_ready(&s, 1);
    assert!(s.is_here(1));
    check(&b);
    assert_eq!(s.status(0), Status::OnUse);
    s.use_stems(0);
    wait_ready(&s, 0);
    check(&a);
    // The next track on the deck waits to be used again.
    let c = track(2.0);
    s.split(0, c.clone(), None);
    settle();
    assert_eq!(s.status(0), Status::OnUse);
    assert!(c.stems.get().is_none());
}

#[test]
fn preparing_takes_no_stems_memory_and_is_let_go_at_once() {
    let s = splitter(When::OnUse, Some(model()));
    let a = track(2.0);
    s.split(0, a.clone(), None);
    s.prepare(0, true);
    settle();
    // It's still only a maybe.
    assert_eq!(s.status(0), Status::OnUse);
    assert!(a.stems.get().is_none());
    assert_eq!(s.model_loads(), 1);
    s.prepare(0, false);
    settle();
    assert_eq!(s.status(0), Status::OnUse);
    assert!(a.stems.get().is_none());
    // The model was dropped, so using it now loads it again, and works.
    s.use_stems(0);
    wait_ready(&s, 0);
    check(&a);
    assert_eq!(s.model_loads(), 2);
}

/// Crossing the stems over and over: whatever is loading when the pointer
/// comes back is used, and nothing is left running or queued afterwards.
#[test]
fn crossing_in_and_out_never_piles_up() {
    let s = splitter(When::OnUse, Some(model()));
    let a = track(2.0);
    s.split(0, a.clone(), None);
    settle();
    let started = Instant::now();
    for _ in 0..500 {
        s.prepare(0, true);
        s.prepare(0, false);
    }
    assert!(
        started.elapsed() < Duration::from_secs(1),
        "never waits for the worker"
    );
    settle();
    let loads = s.model_loads();
    assert!(loads < 100, "{loads} loads for 500 crossings");
    settle();
    assert_eq!(s.model_loads(), loads, "nothing queued");
    assert!(a.stems.get().is_none());
    assert_eq!(s.status(0), Status::OnUse);
    // Ending on the stems, it's prepared, and a use still works.
    s.prepare(0, true);
    settle();
    let ready = s.model_loads();
    s.use_stems(0);
    wait_ready(&s, 0);
    check(&a);
    assert_eq!(s.model_loads(), ready, "used what was prepared");
}

/// The region is stopped, not finished, and that isn't a failure.
#[test]
fn a_stopped_region_is_not_a_failure() {
    let mut m = dj_stems::Model::load(&model()).unwrap();
    let n = m.segment();
    let quiet = vec![0.0; n];
    let stop = dj_stems::Stop::new().unwrap();
    stop.stop();
    assert!(m.run(&quiet, &quiet, &stop).is_err());
    assert!(stop.asked());
    // The next run is its own.
    assert!(m
        .run(&quiet, &quiet, &dj_stems::Stop::new().unwrap())
        .is_ok());
}

/// Tracks loaded one after another: only the last is split, and what was
/// being split for the others is stopped.
#[test]
fn rapid_loads_split_only_the_last() {
    let s = splitter(When::Always, Some(model()));
    let tracks: Vec<_> = (0..20).map(|_| track(60.0)).collect();
    for t in &tracks {
        s.split(0, t.clone(), None);
    }
    wait_ready(&s, 0);
    check(&tracks[19]);
    for t in &tracks[..19] {
        assert!(!t.stems.get().is_some_and(|s| s.is_complete()));
    }
}

#[test]
fn what_was_prepared_is_used() {
    let s = splitter(When::OnUse, Some(model()));
    let a = track(2.0);
    s.split(0, a.clone(), None);
    s.prepare(0, true);
    settle();
    s.use_stems(0);
    wait_ready(&s, 0);
    check(&a);
}

#[test]
fn preparing_does_nothing_when_it_is_not_for_this_mode() {
    let s = splitter(When::Unchosen, Some(model()));
    let a = track(2.0);
    s.split(0, a.clone(), None);
    s.prepare(0, true);
    s.prepare(5, true);
    s.use_stems(5);
    settle();
    assert_eq!(s.status(0), Status::Unchosen);
    // Letting go of a hover that never was isn't one.
    s.configure(Settings {
        when: When::OnUse,
        ..s.settings()
    });
    s.prepare(0, false);
    settle();
    assert_eq!(s.status(0), Status::OnUse);
}

#[test]
fn cached_stems_play_at_once_in_every_mode() {
    let dir = std::env::temp_dir().join(format!("interlude-modes-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("song.wav");
    std::fs::write(&file, b"stand-in for a music file").unwrap();
    let key = CacheKey::for_file(&file, "fake");
    let s = splitter(When::Always, Some(model()));
    s.configure(Settings {
        cache_dir: Some(dir.join("cache")),
        ..s.settings()
    });
    s.split(0, track(2.0), key.clone());
    wait_ready(&s, 0);
    // Ready comes before the save: give it time.
    until("cached", || {
        std::fs::read_dir(dir.join("cache")).is_ok_and(|d| {
            d.flatten()
                .any(|e| e.path().extension().is_some_and(|x| x == "stems"))
        })
    });
    for when in [When::OnUse, When::Unchosen, When::Always] {
        for model in [None, Some(model())] {
            s.configure(Settings {
                when,
                model,
                ..s.settings()
            });
            let t = track(2.0);
            s.split(0, t.clone(), key.clone());
            wait_ready(&s, 0);
            assert!(s.is_here(0));
            check(&t);
        }
    }
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_press_before_the_model_is_in_counts_once_it_is() {
    let s = splitter(When::OnUse, None);
    let a = track(2.0);
    s.split(0, a.clone(), None);
    until("needs the model", || s.status(0) == Status::NeedsModel);
    s.use_stems(0);
    settle();
    assert_eq!(s.status(0), Status::NeedsModel);
    s.configure(Settings {
        model: Some(model()),
        ..s.settings()
    });
    wait_ready(&s, 0);
    check(&a);
}

#[test]
fn changing_mode_mid_split_keeps_what_is_used_and_stops_the_rest() {
    let s = splitter(When::Always, Some(model()));
    // Long enough to be caught part way.
    let (a, b) = (track(400.0), track(400.0));
    s.split(0, a.clone(), None);
    s.split(1, b.clone(), None);
    until("both under way", || {
        [&a, &b]
            .iter()
            .all(|t| t.stems.get().is_some_and(|s| s.ready_fraction() > 0.0))
    });
    s.use_stems(0);
    s.configure(Settings {
        when: When::OnUse,
        ..s.settings()
    });
    assert_eq!(s.status(1), Status::OnUse, "partly split, and left there");
    settle();
    let left = b.stems.get().unwrap().ready_fraction();
    assert!(left < 1.0, "the test track is too short to catch");
    settle();
    assert_eq!(b.stems.get().unwrap().ready_fraction(), left);
    // Off: nothing more happens, and what's split stays usable.
    s.configure(Settings {
        when: When::Never,
        ..s.settings()
    });
    assert_eq!(s.status(0), Status::Off);
    assert_eq!(s.status(1), Status::Off);
    // On again, with the tracks handed over again: it finishes them.
    s.configure(Settings {
        when: When::Always,
        ..s.settings()
    });
    s.split(1, b.clone(), None);
    wait_ready(&s, 1);
}

#[test]
fn removing_the_model_mid_split_waits_for_it() {
    let s = splitter(When::Always, Some(model()));
    let a = track(400.0);
    s.split(0, a.clone(), None);
    until("under way", || {
        a.stems.get().is_some_and(|s| s.ready_fraction() > 0.0)
    });
    s.configure(Settings {
        model: None,
        ..s.settings()
    });
    assert_eq!(s.status(0), Status::NeedsModel);
    s.configure(Settings {
        model: Some(model()),
        ..s.settings()
    });
    wait_ready(&s, 0);
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
        when: When::Never,
        model: Some(path.clone()),
        ..Default::default()
    };
    let s = Splitter::new(off.clone(), Box::new(|_| 0.0));
    std::thread::sleep(Duration::from_millis(200));
    assert!(!dj_stems::quick::exists(&path), "not while stems are off");
    s.configure(Settings {
        when: When::Always,
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

/// Until the model loads quickly, only a use loads it.
#[test]
fn nothing_is_prepared_without_a_quick_copy() {
    let dir = std::env::temp_dir().join(format!("stems-slow-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("m.onnx");
    std::fs::copy(model(), &path).unwrap();
    let s = splitter(When::OnUse, Some(path.clone()));
    until("a copy", || dj_stems::quick::exists(&path));
    settle();
    dj_stems::quick::remove(&path).unwrap();
    let a = track(2.0);
    s.split(0, a.clone(), None);
    s.prepare(0, true);
    settle();
    assert_eq!(s.model_loads(), 0);
    s.use_stems(0);
    wait_ready(&s, 0);
    check(&a);
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
}

/// What it takes is noted as it happens, and kept.
#[test]
fn notes_what_it_takes() {
    let dir = std::env::temp_dir().join(format!("stems-notes-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("measured.txt");
    let s = splitter(When::OnUse, Some(model()));
    until("a copy", || dj_stems::quick::exists(&model()));
    s.configure(Settings {
        measured: Some(file.clone()),
        ..s.settings()
    });
    assert_eq!(s.measured(), Default::default(), "nothing yet");
    s.split(0, track(20.0), None);
    settle();
    assert_eq!(s.measured(), Default::default(), "loading one isn't work");
    s.use_stems(0);
    wait_ready(&s, 0);
    let heard = s.measured().heard;
    assert!(heard.is_some_and(|h| h > 0.0 && h < 20.0), "{heard:?}");
    until("kept", || file.exists());

    // Used again there's nothing to note, and neither is there when it was
    // prepared first: that says how long the pointer rested.
    let kept = std::fs::read_to_string(&file).unwrap();
    s.use_stems(0);
    s.split(1, track(20.0), None);
    settle();
    s.prepare(1, true);
    settle();
    s.use_stems(1);
    wait_ready(&s, 1);
    settle();
    let line = |t: &str| t.lines().find(|l| l.starts_with("heard")).map(String::from);
    assert_eq!(line(&std::fs::read_to_string(&file).unwrap()), line(&kept));

    // Another launch has it at once.
    let again = splitter(When::OnUse, None);
    again.configure(Settings {
        measured: Some(file),
        ..again.settings()
    });
    // Kept to thousandths.
    assert!(again
        .measured()
        .heard
        .is_some_and(|h| (h - heard.unwrap()).abs() < 1e-3));
    drop((s, again));
    let _ = std::fs::remove_dir_all(&dir);
}

/// Stems that were made as the track loaded weren't waited for from a press.
#[test]
fn notes_only_a_press_that_starts_the_work() {
    let s = splitter(When::Always, Some(model()));
    until("a copy", || dj_stems::quick::exists(&model()));
    s.split(0, track(20.0), None);
    s.use_stems(0);
    wait_ready(&s, 0);
    settle();
    assert_eq!(s.measured().heard, None);
}
