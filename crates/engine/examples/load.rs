//! Times loading a track, stage by stage, and shows how much memory it
//! holds. Run with
//! `cargo run --release -p dj-engine --no-default-features --example load -- <file>`.

use std::time::Instant;

use dj_engine::Track;

fn main() {
    let path = std::env::args().nth(1).expect("usage: load <audio file>");
    let t0 = Instant::now();
    let t = Track::load(&path).expect("could not load the file");
    let total = t0.elapsed();
    let (s, sr) = (&t.samples, t.sample_rate);
    let time = |f: &dyn Fn()| {
        let t = Instant::now();
        f();
        t.elapsed().as_millis()
    };
    let wf = time(&|| {
        std::hint::black_box(dj_engine::Waveform::analyze(s, sr));
    });
    let grid = time(&|| {
        std::hint::black_box(dj_engine::analysis::detect_beatgrid(s, sr));
    });
    let key = time(&|| {
        std::hint::black_box(dj_engine::key::detect_key(s, sr));
    });
    println!(
        "loaded {:.0} s of audio in {} ms (analysis alone: waveform {wf} ms, beatgrid {grid} ms, key {key} ms)",
        t.duration_secs(),
        total.as_millis()
    );
    println!(
        "samples: {} MB used, {} MB allocated",
        (s.len() * 4) >> 20,
        (s.capacity() * 4) >> 20
    );
}
