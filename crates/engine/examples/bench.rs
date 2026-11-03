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
    let blocks = sr * 30 / block;
    let t0 = Instant::now();
    for _ in 0..blocks {
        engine.process(&mut m, &mut c);
    }
    let elapsed = t0.elapsed().as_secs_f64();
    let per_block_us = elapsed / blocks as f64 * 1e6;
    let budget_us = block as f64 / sr as f64 * 1e6;
    println!(
        "2 decks, {block}-frame blocks: {per_block_us:.1} µs per block of a {budget_us:.0} µs budget ({:.0}x real time)",
        budget_us / per_block_us
    );
}
