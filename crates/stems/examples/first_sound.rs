//! Measures how long stems take to be heard from a press, and what
//! preparing for the press buys. Also what memory it takes, on macOS.
//!
//!     cargo run --release -p dj-stems --example first_sound -- <model.onnx> [what]
//!
//! `what` is one of `steps`, `cold`, `model` (loaded, the region not split),
//! `both`, a number of ms to prepare for, `hover` or `memory`; without it,
//! all of them. Downloads the model to that path if it isn't there (166 MB).
//! Splitting takes several GB of memory while it runs.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use dj_engine::{Stems, Track};
use dj_stems::download::{Downloader, State};
use dj_stems::{Model, Settings, Splitter, Stop, When};

const TRIALS: usize = 3;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("path of the model"));
    let what = std::env::args().nth(2);
    let asked = |name: &str| what.as_deref().is_none_or(|w| w == name);
    fetch(&path);
    make(&path);

    if asked("steps") {
        steps(&path);
    }
    // Three minutes, the deck 93 s in.
    let mono = tone(44_100 * 180, 2);
    let samples: Vec<f32> = mono.iter().flat_map(|s| [*s, *s]).collect();
    for (name, before) in [
        ("cold", Before::Nothing),
        ("model", Before::Model),
        ("both", Before::Both),
    ] {
        if asked(name) {
            press(&path, &samples, name, before);
        }
    }
    if let Some(ms) = what.as_deref().and_then(|w| w.parse().ok()) {
        press(&path, &samples, "prepared", Before::For(ms));
    }
    if asked("hover") {
        hover(&path, &samples);
    }
    if asked("memory") {
        memory(&path, &samples);
    }
}

fn steps(path: &Path) {
    println!("The steps, in ms (median of {TRIALS}):");
    let mut loads = vec![];
    let mut runs = vec![];
    for _ in 0..TRIALS {
        let t = Instant::now();
        let mut m = Model::load(path).expect("model loads");
        loads.push(ms(t));
        let n = m.segment();
        let noise = tone(n, 1);
        let t = Instant::now();
        m.run(&noise, &noise, &Stop::new().expect("run options"))
            .expect("model runs");
        runs.push(ms(t));
    }
    println!("  load the model        {:>6.0}", median(&mut loads));
    println!("  first region after it {:>6.0}", median(&mut runs));
    let mut m = Model::load(path).expect("model loads");
    let noise = tone(m.segment(), 1);
    m.run(&noise, &noise, &Stop::new().expect("run options"))
        .expect("model runs");
    let mut more = vec![];
    for _ in 0..TRIALS {
        let t = Instant::now();
        m.run(&noise, &noise, &Stop::new().expect("run options"))
            .expect("model runs");
        more.push(ms(t));
    }
    println!("  each region after that{:>6.0}", median(&mut more));
    drop(m);
    let mut makes = vec![];
    for _ in 0..TRIALS {
        let t = Instant::now();
        std::hint::black_box(Stems::new(44_100 * 360));
        makes.push(ms(t));
    }
    println!("  a 6 minute buffer     {:>6.0}", median(&mut makes));
}

/// A splitter with the track on deck A, its cache looked at, and nothing else done.
fn on_use(path: &Path, samples: &[f32]) -> Splitter {
    let s = Splitter::new(
        Settings {
            when: When::OnUse,
            model: Some(path.into()),
            ..Default::default()
        },
        Box::new(|_| 93.0),
    );
    let track = Track::from_stereo(samples.to_vec(), 44_100);
    s.split(0, Arc::new(track), None);
    std::thread::sleep(Duration::from_millis(400));
    s
}

/// What has happened before the press.
#[derive(Clone, Copy)]
enum Before {
    Nothing,
    Model,
    Both,
    For(u64),
}

fn press(path: &Path, samples: &[f32], name: &str, before: Before) {
    let mut waits = vec![];
    let mut peak = 0;
    for _ in 0..TRIALS {
        let s = on_use(path, samples);
        let mem = Peak::start();
        match before {
            Before::Nothing => {}
            // The other deck is prepared, so the model is there for this one.
            Before::Model => {
                s.split(
                    1,
                    Arc::new(Track::from_stereo(samples.to_vec(), 44_100)),
                    None,
                );
                s.prepare(1, true);
                std::thread::sleep(Duration::from_secs(12));
            }
            Before::Both => {
                s.prepare(0, true);
                std::thread::sleep(Duration::from_secs(12));
            }
            Before::For(ms) => {
                s.prepare(0, true);
                std::thread::sleep(Duration::from_millis(ms));
            }
        }
        let t = Instant::now();
        s.use_stems(0);
        while !s.is_here(0) {
            assert!(t.elapsed() < Duration::from_secs(60), "{:?}", s.status(0));
            std::thread::sleep(Duration::from_millis(1));
        }
        waits.push(ms(t));
        peak = peak.max(mem.stop());
    }
    waits.sort_by(f64::total_cmp);
    println!(
        "Press to heard, {name}: {waits:.0?} ms, peak {:.1} GB",
        gb(peak)
    );
}

/// What the pointer costs: on the stems for a while, then off again.
fn hover(path: &Path, samples: &[f32]) {
    for rest in [0, 100, 1000, 5000] {
        for _ in 0..TRIALS {
            let s = on_use(path, samples);
            let before = footprint();
            let mem = Peak::start();
            s.prepare(0, true);
            std::thread::sleep(Duration::from_millis(rest));
            s.prepare(0, false);
            let t = Instant::now();
            // Back once it has stayed back for a second.
            let mut back = 0.0;
            while t.elapsed() < Duration::from_secs(20) {
                if footprint() > before + 50_000_000 {
                    back = ms(t);
                } else if ms(t) - back > 1000.0 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            println!(
                "On them {rest} ms: peak {:.2} GB (was {:.2}), back {back:.0} ms after leaving, {:.2} GB then, {} loads",
                gb(mem.stop()),
                gb(before),
                gb(footprint()),
                s.model_loads(),
            );
        }
    }
}

/// Makes the copy of the model that loads quickly, once.
fn make(path: &Path) {
    if dj_stems::quick::exists(path) {
        return;
    }
    let mem = Peak::start();
    let t = Instant::now();
    dj_stems::quick::make(path).expect("quick copy");
    println!(
        "Quick copy made in {:.1} s, peak {:.1} GB, {:.0} MB",
        ms(t) / 1000.0,
        gb(mem.stop()),
        dj_stems::quick::size(path) as f64 / 1e6
    );
}

fn gb(bytes: u64) -> f64 {
    bytes as f64 / 1e9
}

fn memory(path: &Path, samples: &[f32]) {
    println!("Memory, in GB, prepared and then let go:");
    let s = on_use(path, samples);
    println!("  before   {:.2}", footprint() as f64 / 1e9);
    let mem = Peak::start();
    s.prepare(0, true);
    std::thread::sleep(Duration::from_secs(12));
    println!("  peak     {:.2}", mem.stop() as f64 / 1e9);
    println!("  held     {:.2}", footprint() as f64 / 1e9);
    s.prepare(0, false);
    std::thread::sleep(Duration::from_secs(3));
    println!("  let go   {:.2}", footprint() as f64 / 1e9);
}

fn fetch(path: &Path) {
    let d = Downloader::new(dj_stems::model_source(), path.into(), |_| {});
    let t = Instant::now();
    if d.state() != State::Ready {
        println!("Downloading the model to {}", path.display());
        d.start();
    }
    loop {
        match d.state() {
            State::Ready => break,
            State::Failed { error, .. } => panic!("{error}"),
            _ => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    println!("Model in after {:.1} s", t.elapsed().as_secs_f64());
}

fn tone(n: usize, seed: u32) -> Vec<f32> {
    let mut x = seed;
    (0..n)
        .map(|i| {
            x = x.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (i as f32 * 0.03).sin() * 0.3 + (x >> 16) as f32 / 65_536.0 * 0.2 - 0.1
        })
        .collect()
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn median(v: &mut [f64]) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

/// Watches this process's memory until it's stopped.
struct Peak {
    going: Arc<AtomicBool>,
    peak: Arc<AtomicU64>,
    thread: std::thread::JoinHandle<()>,
}

impl Peak {
    fn start() -> Self {
        let going = Arc::new(AtomicBool::new(true));
        let peak = Arc::new(AtomicU64::new(0));
        let (g, p) = (going.clone(), peak.clone());
        let thread = std::thread::spawn(move || {
            while g.load(Ordering::Relaxed) {
                p.fetch_max(footprint(), Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        Self {
            going,
            peak,
            thread,
        }
    }

    fn stop(self) -> u64 {
        self.going.store(false, Ordering::Relaxed);
        let _ = self.thread.join();
        self.peak.load(Ordering::Relaxed)
    }
}

/// This process's memory, as Activity Monitor counts it.
#[cfg(target_os = "macos")]
fn footprint() -> u64 {
    let mut info: libc::rusage_info_v4 = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        libc::proc_pid_rusage(
            libc::getpid(),
            libc::RUSAGE_INFO_V4,
            &mut info as *mut _ as *mut libc::rusage_info_t,
        )
    };
    if ok == 0 {
        info.ri_phys_footprint
    } else {
        0
    }
}

#[cfg(not(target_os = "macos"))]
fn footprint() -> u64 {
    0
}
