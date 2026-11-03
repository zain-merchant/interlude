//! A stand-in output that runs the engine on a timer with no sound card.
//! Used when no audio device is available (CI, servers, headless tests), so
//! the rest of the app still works and positions still advance.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::{new_engine, EngineHandle};

pub struct NullOutput {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    pub sample_rate: u32,
}

impl Drop for NullOutput {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

pub fn start_null(sample_rate: u32) -> (NullOutput, EngineHandle) {
    let (mut engine, handle) = new_engine(sample_rate);
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();
    let thread = std::thread::Builder::new()
        .name("null-output".into())
        .spawn(move || {
            let block = 512usize;
            let mut m = vec![0f32; block * 2];
            let mut c = vec![0f32; block * 2];
            let period = Duration::from_secs_f64(block as f64 / sample_rate as f64);
            let mut next = Instant::now();
            while !stop2.load(Ordering::Relaxed) {
                engine.process(&mut m, &mut c);
                engine.meter_master(&m);
                next += period;
                if let Some(wait) = next.checked_duration_since(Instant::now()) {
                    std::thread::sleep(wait);
                }
            }
        })
        .expect("spawn null output thread");
    (
        NullOutput {
            stop,
            thread: Some(thread),
            sample_rate,
        },
        handle,
    )
}
