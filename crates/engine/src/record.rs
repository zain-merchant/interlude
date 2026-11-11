//! Set recording: the master output, written to a WAV file.
//!
//! The audio thread copies each master block into a lock-free ring buffer
//! while a recording runs. A writer thread drains it to disk, so the audio
//! thread never waits on the file system. If the disk stalls long enough
//! for the ring to fill, whole blocks are dropped and counted rather than
//! blocking playback.

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use rtrb::{Consumer, Producer, RingBuffer};

/// Seconds of audio the ring buffer holds while the disk catches up.
const RING_SECS: usize = 4;
/// How often the writer wakes to drain the ring.
const WRITER_PERIOD: Duration = Duration::from_millis(20);
/// How often the WAV header is rewritten and the file flushed, so a crash
/// or power cut leaves a playable file missing at most about this much.
const FLUSH_PERIOD: Duration = Duration::from_secs(1);
/// Bit depth of recordings.
const BITS: u16 = 24;

#[derive(Debug, thiserror::Error)]
pub enum RecordError {
    #[error("already recording")]
    AlreadyRecording,
    #[error("not recording")]
    NotRecording,
    #[error("could not write recording: {0}")]
    Io(String),
}

impl From<hound::Error> for RecordError {
    fn from(e: hound::Error) -> Self {
        RecordError::Io(e.to_string())
    }
}

impl From<std::io::Error> for RecordError {
    fn from(e: std::io::Error) -> Self {
        RecordError::Io(e.to_string())
    }
}

/// Counters shared between the audio thread, the writer and the handle.
#[derive(Debug, Default)]
pub(crate) struct RecordShared {
    /// The audio thread copies master blocks while this is set.
    pub active: AtomicBool,
    /// Frames written to the file so far.
    pub frames: AtomicU64,
    /// Frames lost because the disk fell behind.
    pub dropped: AtomicU64,
}

/// Audio-thread side: copies master blocks into the ring.
pub(crate) struct RecordTap {
    tx: Producer<f32>,
    shared: Arc<RecordShared>,
}

impl RecordTap {
    /// Real-time safe. `master` is interleaved stereo.
    #[inline]
    pub fn push(&mut self, master: &[f32]) {
        if !self.shared.active.load(Ordering::Acquire) {
            return;
        }
        match self.tx.write_chunk_uninit(master.len()) {
            Ok(chunk) => {
                chunk.fill_from_iter(master.iter().copied());
            }
            Err(_) => {
                self.shared
                    .dropped
                    .fetch_add((master.len() / 2) as u64, Ordering::Relaxed);
            }
        }
    }
}

/// What a recording looks like right now, for the UI.
#[derive(Debug, Clone, Default, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct RecordingStatus {
    pub active: bool,
    /// Length of the recording so far (or of the last one), in seconds.
    pub seconds: f64,
    /// The file being written (or last written).
    pub path: Option<PathBuf>,
    /// Audio lost because the disk fell behind, in seconds.
    pub dropped_seconds: f64,
    /// Why the last recording stopped on its own, if it did.
    pub error: Option<String>,
}

struct Job {
    thread: JoinHandle<(Consumer<f32>, Result<(), RecordError>)>,
    stop: Arc<AtomicBool>,
}

/// Control side: starts and stops recordings.
pub(crate) struct Recorder {
    rx: Option<Consumer<f32>>,
    job: Option<Job>,
    shared: Arc<RecordShared>,
    sample_rate: u32,
    path: Option<PathBuf>,
    error: Arc<Mutex<Option<String>>>,
}

pub(crate) fn new_recorder(sample_rate: u32) -> (RecordTap, Recorder) {
    let (tx, rx) = RingBuffer::new(sample_rate as usize * 2 * RING_SECS);
    let shared = Arc::new(RecordShared::default());
    (
        RecordTap {
            tx,
            shared: shared.clone(),
        },
        Recorder {
            rx: Some(rx),
            job: None,
            shared,
            sample_rate,
            path: None,
            error: Arc::default(),
        },
    )
}

impl Recorder {
    pub fn start(&mut self, path: &Path) -> Result<(), RecordError> {
        self.reap();
        if self.job.is_some() {
            return Err(RecordError::AlreadyRecording);
        }
        // The ring only goes missing if the writer thread panicked; the
        // engine plays on, but recording can't start again this session.
        let mut rx = self.rx.take().ok_or_else(|| {
            RecordError::Io("the recorder stopped working; restart the app to record".into())
        })?;
        let writer = match self.create(path) {
            Ok(w) => w,
            Err(e) => {
                self.rx = Some(rx);
                return Err(e);
            }
        };
        // Throw away anything left over from the end of the last recording.
        if let Ok(c) = rx.read_chunk(rx.slots()) {
            c.commit_all();
        }
        self.shared.frames.store(0, Ordering::Relaxed);
        self.shared.dropped.store(0, Ordering::Relaxed);
        *self.error.lock().unwrap_or_else(|e| e.into_inner()) = None;
        self.path = Some(path.to_path_buf());

        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let stop = stop.clone();
            let shared = self.shared.clone();
            let error = self.error.clone();
            std::thread::Builder::new()
                .name("set-recorder".into())
                .spawn(move || {
                    let result = write_loop(&mut rx, writer, &stop, &shared);
                    if let Err(e) = &result {
                        shared.active.store(false, Ordering::Release);
                        *error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e.to_string());
                    }
                    (rx, result)
                })?
        };
        self.job = Some(Job { thread, stop });
        self.shared.active.store(true, Ordering::Release);
        Ok(())
    }

    fn create(&self, path: &Path) -> Result<hound::WavWriter<BufWriter<File>>, RecordError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: self.sample_rate,
            bits_per_sample: BITS,
            sample_format: hound::SampleFormat::Int,
        };
        Ok(hound::WavWriter::create(path, spec)?)
    }

    /// Stops the recording, finishes the file and returns its final status.
    pub fn stop(&mut self) -> Result<RecordingStatus, RecordError> {
        let job = self.job.take().ok_or(RecordError::NotRecording)?;
        self.shared.active.store(false, Ordering::Release);
        job.stop.store(true, Ordering::Release);
        let result = self.join(job);
        result.map(|_| self.status())
    }

    pub fn status(&mut self) -> RecordingStatus {
        self.reap();
        let sr = self.sample_rate as f64;
        RecordingStatus {
            active: self.job.is_some(),
            seconds: self.shared.frames.load(Ordering::Relaxed) as f64 / sr,
            path: self.path.clone(),
            dropped_seconds: self.shared.dropped.load(Ordering::Relaxed) as f64 / sr,
            error: self.error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        }
    }

    /// Collects a writer that stopped on its own (after a disk error).
    fn reap(&mut self) {
        if self.job.as_ref().is_some_and(|j| j.thread.is_finished()) {
            let job = self.job.take().expect("checked");
            let _ = self.join(job);
        }
    }

    fn join(&mut self, job: Job) -> Result<(), RecordError> {
        match job.thread.join() {
            Ok((rx, result)) => {
                self.rx = Some(rx);
                result
            }
            Err(_) => {
                // The writer panicked and took the ring with it; recording
                // can't restart, but playback is unaffected.
                Err(RecordError::Io("recorder thread crashed".into()))
            }
        }
    }
}

impl Drop for Recorder {
    fn drop(&mut self) {
        if self.job.is_some() {
            let _ = self.stop();
        }
    }
}

fn write_loop(
    rx: &mut Consumer<f32>,
    mut writer: hound::WavWriter<BufWriter<File>>,
    stop: &AtomicBool,
    shared: &RecordShared,
) -> Result<(), RecordError> {
    const SCALE: f32 = ((1 << (BITS - 1)) - 1) as f32;
    let mut last_flush = Instant::now();
    loop {
        // Read the stop flag before draining, so samples pushed before it
        // was set are always written.
        let stopping = stop.load(Ordering::Acquire);
        let n = rx.slots() & !1; // whole frames only
        if n > 0 {
            let chunk = rx.read_chunk(n).expect("slots are available");
            let (a, b) = chunk.as_slices();
            for &s in a.iter().chain(b) {
                writer.write_sample((s.clamp(-1.0, 1.0) * SCALE).round() as i32)?;
            }
            chunk.commit_all();
            shared.frames.fetch_add((n / 2) as u64, Ordering::Relaxed);
        }
        if stopping {
            break;
        }
        if last_flush.elapsed() >= FLUSH_PERIOD {
            writer.flush()?;
            last_flush = Instant::now();
        }
        std::thread::sleep(WRITER_PERIOD);
    }
    writer.finalize()?;
    Ok(())
}
