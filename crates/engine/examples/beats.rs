//! Prints the detected beatgrid of each WAV file given, one line per file:
//! `path<TAB>bpm<TAB>first_beat<TAB>milliseconds`. Used by
//! `tools/beat-eval` to score the analysis against ground truth. Run with
//! `cargo run --release -p dj-engine --no-default-features --example beats -- <files…>`.
//! A single `-` argument reads the paths from stdin, one per line.

use std::io::BufRead;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use dj_engine::analysis::detect_beatgrid;

fn read_wav(path: &str) -> Result<(Vec<f32>, u32), hound::Error> {
    let mut r = hound::WavReader::open(path)?;
    let spec = r.spec();
    let mono: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r.samples::<f32>().collect::<Result<_, _>>()?,
        hound::SampleFormat::Int => {
            let scale = 1.0 / (1u64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>()
                .map(|s| s.map(|v| v as f32 * scale))
                .collect::<Result<_, _>>()?
        }
    };
    let ch = spec.channels as usize;
    let stereo = mono
        .chunks_exact(ch)
        .flat_map(|f| if ch == 1 { [f[0], f[0]] } else { [f[0], f[1]] })
        .collect();
    Ok((stereo, spec.sample_rate))
}

fn main() {
    let mut paths: Vec<String> = std::env::args().skip(1).collect();
    if paths == ["-"] {
        paths = std::io::stdin()
            .lock()
            .lines()
            .map_while(Result::ok)
            .collect();
    }
    let next = AtomicUsize::new(0);
    let out = Mutex::new(());
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get());
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(path) = paths.get(i) else { break };
                let line = match read_wav(path) {
                    Ok((stereo, sr)) => {
                        let t = Instant::now();
                        let g = detect_beatgrid(&stereo, sr);
                        let ms = t.elapsed().as_millis();
                        match g {
                            Some(g) => format!("{path}\t{:.4}\t{:.5}\t{ms}", g.bpm, g.first_beat),
                            None => format!("{path}\t\t\t{ms}"),
                        }
                    }
                    Err(e) => format!("{path}\terror: {e}"),
                };
                let _g = out.lock().unwrap();
                println!("{line}");
            });
        }
    });
}
