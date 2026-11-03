//! Measures how much faster than real time the engine renders two playing
//! decks. Run with `cargo run --release -p dj-engine --example bench`.

use std::sync::Arc;
use std::time::Instant;

use dj_engine::{new_engine, Command, DeckId, Track};

fn main() {
    let sr = 48_000;
    let secs = 60;
    let tone: Vec<f32> = (0..sr * secs * 2)
        .map(|i| ((i / 2) as f32 * 0.01).sin() * 0.5)
        .collect();
    let track = Arc::new(Track::from_stereo(tone, 44_100));
    let (mut engine, mut h) = new_engine(sr as u32);
    for deck in DeckId::ALL {
        h.send(Command::Load {
            deck,
            track: track.clone(),
        })
        .unwrap();
        h.send(Command::SetRate { deck, rate: 1.03 }).unwrap();
        h.send(Command::Play { deck }).unwrap();
    }
    let block = 128;
    let (mut m, mut c) = (vec![0.0; block * 2], vec![0.0; block * 2]);
    let blocks = sr * 20 / block;
    let budget_us = block as f64 / sr as f64 * 1e6;
    let mut run = |keylock: bool| {
        for deck in DeckId::ALL {
            h.send(Command::SetKeylock { deck, on: keylock }).unwrap();
            h.send(Command::Seek { deck, seconds: 0.0 }).unwrap();
        }
        let t0 = Instant::now();
        for _ in 0..blocks {
            engine.process(&mut m, &mut c);
        }
        t0.elapsed().as_secs_f64() / blocks as f64 * 1e6
    };
    let per_block_us = run(false);
    let keylock_us = run(true);
    let six_min: Vec<f32> = (0..44_100 * 360 * 2)
        .map(|i| {
            let t = (i / 2) as f64 / 44_100.0;
            let bt = t % (60.0 / 124.0);
            ((2.0 * std::f64::consts::PI * 60.0 * bt).sin() * (-bt * 8.0).exp()) as f32
        })
        .collect();
    let t1 = Instant::now();
    let grid = dj_engine::analysis::detect_beatgrid(&six_min, 44_100);
    let t2 = Instant::now();
    let key = dj_engine::key::detect_key(&six_min, 44_100);
    println!(
        "key for a 6-minute track: {key:?} in {} ms",
        t2.elapsed().as_millis()
    );
    println!(
        "beatgrid for a 6-minute track: {grid:?} in {} ms",
        t1.elapsed().as_millis()
    );
    println!(
        "2 decks, {block}-frame blocks: {per_block_us:.1} µs per block of a {budget_us:.0} µs budget ({:.0}x real time)",
        budget_us / per_block_us
    );
    println!(
        "same with keylock: {keylock_us:.1} µs per block ({:.0}x real time)",
        budget_us / keylock_us
    );
}
