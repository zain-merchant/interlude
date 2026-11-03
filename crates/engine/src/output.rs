//! Sound card output through cpal.
//!
//! The stream is built and owned by a dedicated thread, because cpal streams
//! are not `Send` on every platform. Dropping [`AudioOutput`] stops it.
//!
//! The same thread watches the stream. If the device disappears (a USB
//! cable is pulled), the engine stops rendering, so every deck holds its
//! place, and the thread waits for that device to come back and carries on
//! from where it left off. [`AudioOutput::status`] says which of the two is
//! happening, and [`AudioOutput::use_default`] gives up waiting and moves to
//! the system's default output instead.

use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use crate::{new_engine, Engine, EngineHandle, MAX_BLOCK_FRAMES};

#[derive(Debug, thiserror::Error)]
pub enum OutputError {
    #[error("no audio output device found")]
    NoDevice,
    #[error("audio device error: {0}")]
    Device(String),
}

/// Whether the output is playing, or waiting for its device to come back.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(
    feature = "serde",
    serde(
        tag = "state",
        rename_all = "camelCase",
        rename_all_fields = "camelCase"
    )
)]
pub enum OutputStatus {
    Connected {
        device: String,
        sample_rate: u32,
    },
    /// The device went away. Decks are held until it returns, or until
    /// [`AudioOutput::use_default`] switches to `fallback`.
    Lost {
        device: String,
        /// The system default output, if there is one to switch to.
        fallback: Option<String>,
    },
}

enum Msg {
    UseDefault,
}

pub struct AudioOutput {
    msgs: Option<mpsc::Sender<Msg>>,
    thread: Option<JoinHandle<()>>,
    status: Arc<Mutex<OutputStatus>>,
    stats: Arc<Stats>,
    /// The device the output first opened.
    pub device_name: String,
    /// The engine's sample rate. A reconnected device runs at the same rate.
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioOutput {
    pub fn status(&self) -> OutputStatus {
        self.status.lock().expect("status lock").clone()
    }

    /// How the stream is running: buffer size, latency and timing.
    pub fn stats(&self) -> OutputStats {
        self.stats.snapshot()
    }

    /// Stops waiting for a lost device and plays through the system default
    /// output instead. Does nothing while connected.
    pub fn use_default(&self) {
        if let Some(tx) = &self.msgs {
            let _ = tx.send(Msg::UseDefault);
        }
    }
}

impl Drop for AudioOutput {
    fn drop(&mut self) {
        // Closing the channel tells the thread to stop.
        self.msgs.take();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// Opens the default output device and starts an engine on it.
///
/// Master goes to channels 1-2. On a device with 4 or more channels (most
/// DJ controllers and interfaces), the headphone cue goes to channels 3-4.
pub fn start_default() -> Result<(AudioOutput, EngineHandle), OutputError> {
    start_preferring(&[])
}

/// Frames per callback asked of the device. Commands (a play press, a
/// fader move) take effect at the start of the next callback, and a
/// callback's audio is heard one buffer later, so this sets how quickly the
/// app answers: 128 frames is 2.7 ms at 48 kHz. The device's own default is
/// often 512 (10.7 ms). Set `OSS_DJ_BUFFER_FRAMES` to override, or to 0 to
/// use the device default.
pub const TARGET_BUFFER_FRAMES: u32 = 128;

/// Timing of the running stream, measured on the audio thread.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct OutputStats {
    /// Frames in the last callback.
    pub buffer_frames: u32,
    /// From a callback starting to its first sample reaching the speakers,
    /// as the driver predicts it, in ms. 0 if the driver doesn't say.
    pub output_latency_ms: f32,
    /// Longest time spent rendering one callback, in µs.
    pub max_render_us: u32,
    /// Callbacks that came more than one and a half buffers after the one
    /// before: a sign the system starved the audio thread and it may have
    /// dropped out.
    pub late_callbacks: u64,
}

#[derive(Debug, Default)]
struct Stats {
    buffer_frames: AtomicU32,
    latency_us: AtomicU32,
    max_render_us: AtomicU32,
    late: AtomicU64,
}

impl Stats {
    fn snapshot(&self) -> OutputStats {
        OutputStats {
            buffer_frames: self.buffer_frames.load(Ordering::Relaxed),
            output_latency_ms: self.latency_us.load(Ordering::Relaxed) as f32 / 1000.0,
            max_render_us: self.max_render_us.load(Ordering::Relaxed),
            late_callbacks: self.late.load(Ordering::Relaxed),
        }
    }
}

fn target_buffer_frames() -> u32 {
    std::env::var("OSS_DJ_BUFFER_FRAMES")
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(TARGET_BUFFER_FRAMES)
}

/// The buffer size to ask for: the target, kept inside what the device
/// supports. `None` means leave it to the device.
fn buffer_size(supported: &cpal::SupportedBufferSize, target: u32) -> cpal::BufferSize {
    match (supported, target) {
        (_, 0) => cpal::BufferSize::Default,
        (cpal::SupportedBufferSize::Range { min, max }, t) if min <= max => {
            cpal::BufferSize::Fixed(t.clamp(*min, *max))
        }
        _ => cpal::BufferSize::Fixed(target),
    }
}

/// What the error callback saw, read by the watching thread.
const OK: u8 = 0;
const GONE: u8 = 1;
const REBUILD: u8 = 2;

/// How often the watching thread checks on the stream.
const TICK: Duration = Duration::from_millis(250);
/// A stream whose callback hasn't run for this long is treated as lost, for
/// backends that go quiet instead of reporting an error.
const STALL: Duration = Duration::from_secs(2);

/// A running stream and what the watching thread needs to keep an eye on it.
struct Live {
    _stream: cpal::Stream,
    id: Option<cpal::DeviceId>,
    name: String,
    channels: u16,
    callbacks: Arc<AtomicU64>,
    event: Arc<AtomicU8>,
}

fn label(d: &cpal::Device) -> String {
    d.description()
        .map(|d| d.to_string())
        .unwrap_or_else(|_| "default".into())
}

/// The system default output as a concrete device. A stream built from the
/// default device itself may silently follow the system to a new default
/// (from a DJ interface to laptop speakers, mid-set); a concrete device
/// reports that it went away instead, so the app can say so.
fn default_device(host: &cpal::Host) -> Option<cpal::Device> {
    let d = host.default_output_device()?;
    d.id()
        .ok()
        .and_then(|id| host.device_by_id(&id))
        .or(Some(d))
}

/// Opens `device` at `sample_rate` and renders `engine` into it.
fn open(
    device: &cpal::Device,
    sample_rate: u32,
    engine: &Arc<Mutex<Engine>>,
    stats: &Arc<Stats>,
) -> Result<Live, OutputError> {
    let default = device
        .default_output_config()
        .map_err(|e| OutputError::Device(e.to_string()))?;
    let channels = default.channels();
    let wanted = buffer_size(default.buffer_size(), target_buffer_frames());
    // Some drivers refuse a fixed size they claimed to support; the device
    // default always works.
    match open_with(device, channels, sample_rate, wanted, engine, stats) {
        Err(e) if wanted != cpal::BufferSize::Default => {
            eprintln!("audio: {wanted:?} refused ({e}); using the device default");
            open_with(
                device,
                channels,
                sample_rate,
                cpal::BufferSize::Default,
                engine,
                stats,
            )
        }
        r => r,
    }
}

fn open_with(
    device: &cpal::Device,
    channels: u16,
    sample_rate: u32,
    buffer_size: cpal::BufferSize,
    engine: &Arc<Mutex<Engine>>,
    stats: &Arc<Stats>,
) -> Result<Live, OutputError> {
    let config = cpal::StreamConfig {
        channels,
        sample_rate,
        buffer_size,
    };
    stats.max_render_us.store(0, Ordering::Relaxed);

    let callbacks = Arc::new(AtomicU64::new(0));
    let event = Arc::new(AtomicU8::new(OK));
    let mut master = vec![0f32; MAX_BLOCK_FRAMES * 2];
    let mut cue = vec![0f32; MAX_BLOCK_FRAMES * 2];
    let ch = channels as usize;
    let engine = engine.clone();
    let (count, ev) = (callbacks.clone(), event.clone());
    let stats = stats.clone();
    let mut last_callback: Option<cpal::StreamInstant> = None;

    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [f32], info: &cpal::OutputCallbackInfo| {
                let started = Instant::now();
                count.fetch_add(1, Ordering::Relaxed);
                let frames = (data.len() / ch.max(1)) as u32;
                let ts = info.timestamp();
                if let Some(prev) = last_callback {
                    let gap = ts.callback.duration_since(prev).as_secs_f64();
                    if gap * sample_rate as f64 > frames as f64 * 1.5 {
                        stats.late.fetch_add(1, Ordering::Relaxed);
                    }
                }
                last_callback = Some(ts.callback);
                stats.buffer_frames.store(frames, Ordering::Relaxed);
                let latency = ts.playback.duration_since(ts.callback).as_micros();
                stats
                    .latency_us
                    .store(latency.min(u32::MAX as u128) as u32, Ordering::Relaxed);
                // Only one stream exists at a time and the watching thread
                // only takes the lock while no stream is running, so this
                // never waits; it is a single atomic swap.
                let Ok(mut engine) = engine.try_lock() else {
                    data.fill(0.0);
                    return;
                };
                for out in data.chunks_mut(MAX_BLOCK_FRAMES * ch) {
                    let frames = out.len() / ch;
                    let (m, c) = (&mut master[..frames * 2], &mut cue[..frames * 2]);
                    engine.process(m, c);
                    engine.meter_master(m);
                    for (i, f) in out.chunks_exact_mut(ch).enumerate() {
                        f.fill(0.0);
                        f[0] = m[i * 2];
                        if ch > 1 {
                            f[1] = m[i * 2 + 1];
                        }
                        if ch >= 4 {
                            f[2] = c[i * 2];
                            f[3] = c[i * 2 + 1];
                        }
                    }
                }
                let us = started.elapsed().as_micros().min(u32::MAX as u128) as u32;
                stats.max_render_us.fetch_max(us, Ordering::Relaxed);
            },
            move |err| match err.kind() {
                cpal::ErrorKind::DeviceNotAvailable => ev.store(GONE, Ordering::Relaxed),
                cpal::ErrorKind::StreamInvalidated => ev.store(REBUILD, Ordering::Relaxed),
                _ => eprintln!("audio stream error: {err}"),
            },
            None,
        )
        .map_err(|e| OutputError::Device(e.to_string()))?;
    stream
        .play()
        .map_err(|e| OutputError::Device(e.to_string()))?;
    Ok(Live {
        _stream: stream,
        id: device.id().ok(),
        name: label(device),
        channels,
        callbacks,
        event,
    })
}

/// Like [`start_default`], but uses the first output device whose name
/// contains one of `preferred` (case-insensitive), such as a DJ
/// controller's built-in sound card, when one is plugged in.
pub fn start_preferring(preferred: &[&str]) -> Result<(AudioOutput, EngineHandle), OutputError> {
    let preferred: Vec<String> = preferred.iter().map(|p| p.to_lowercase()).collect();
    let (ready_tx, ready_rx) = mpsc::channel();
    let (msg_tx, msg_rx) = mpsc::channel::<Msg>();
    let status = Arc::new(Mutex::new(OutputStatus::Connected {
        device: String::new(),
        sample_rate: 0,
    }));
    let status2 = status.clone();
    let stats = Arc::new(Stats::default());
    let stats2 = stats.clone();

    let thread = std::thread::Builder::new()
        .name("audio-output".into())
        .spawn(move || {
            let host = cpal::default_host();
            let first = (|| {
                let wanted = host.output_devices().ok().and_then(|mut all| {
                    all.find(|d| {
                        let name = label(d).to_lowercase();
                        preferred.iter().any(|p| name.contains(p))
                    })
                });
                let device = wanted
                    .or_else(|| default_device(&host))
                    .ok_or(OutputError::NoDevice)?;
                let sample_rate = device
                    .default_output_config()
                    .map_err(|e| OutputError::Device(e.to_string()))?
                    .sample_rate();
                let (engine, handle) = new_engine(sample_rate);
                let engine = Arc::new(Mutex::new(engine));
                let live = open(&device, sample_rate, &engine, &stats2)?;
                Ok((engine, handle, live, sample_rate))
            })();
            let (engine, handle, live, sample_rate) = match first {
                Ok(v) => v,
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            let set = |s: OutputStatus| *status2.lock().expect("status lock") = s;
            set(OutputStatus::Connected {
                device: live.name.clone(),
                sample_rate,
            });
            let _ = ready_tx.send(Ok((handle, live.name.clone(), sample_rate, live.channels)));
            watch(&host, live, sample_rate, &engine, &stats2, &msg_rx, set);
        })
        .map_err(|e| OutputError::Device(e.to_string()))?;

    let (handle, device_name, sample_rate, channels) = ready_rx
        .recv()
        .map_err(|_| OutputError::Device("audio thread exited".into()))??;
    Ok((
        AudioOutput {
            msgs: Some(msg_tx),
            thread: Some(thread),
            status,
            stats,
            device_name,
            sample_rate,
            channels,
        },
        handle,
    ))
}

/// Keeps the output running until the [`AudioOutput`] is dropped:
/// watches the live stream, and when its device goes away, holds the decks
/// and waits for it (or for [`Msg::UseDefault`]).
fn watch(
    host: &cpal::Host,
    mut live: Live,
    sample_rate: u32,
    engine: &Arc<Mutex<Engine>>,
    stats: &Arc<Stats>,
    msgs: &mpsc::Receiver<Msg>,
    set: impl Fn(OutputStatus),
) {
    loop {
        // Connected: watch for an error or a stall.
        let mut seen = live.callbacks.load(Ordering::Relaxed);
        let mut last = Instant::now();
        let lost = loop {
            match msgs.recv_timeout(TICK) {
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Ok(Msg::UseDefault) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            let n = live.callbacks.load(Ordering::Relaxed);
            if n != seen {
                seen = n;
                last = Instant::now();
            }
            match live.event.swap(OK, Ordering::Relaxed) {
                GONE => break true,
                REBUILD => break false,
                _ if last.elapsed() > STALL => break true,
                _ => {}
            }
        };
        let (id, name) = (live.id.clone(), live.name.clone());
        drop(live);

        if !lost {
            // Same device, new settings (its sample rate changed, say).
            let found = id.as_ref().and_then(|id| host.device_by_id(id));
            if let Some(Ok(l)) = found.map(|d| open(&d, sample_rate, engine, stats)) {
                live = l;
                continue;
            }
        }

        // Lost: wait for the device to come back.
        eprintln!("audio device {name} went away; waiting for it to return");
        let fallback = || default_device(host).map(|d| label(&d));
        let mut offered = fallback();
        set(OutputStatus::Lost {
            device: name.clone(),
            fallback: offered.clone(),
        });
        let mut use_default = false;
        live = loop {
            // No stream is running, so take the engine here: apply queued
            // commands (fader moves, loads) without advancing any deck, so
            // the queue never fills and every deck stays where it was.
            if let Ok(mut e) = engine.lock() {
                e.process(&mut [], &mut []);
            }
            match msgs.recv_timeout(Duration::from_millis(500)) {
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Ok(Msg::UseDefault) => use_default = true,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            let device = if use_default {
                default_device(host)
            } else {
                host.output_devices().ok().and_then(|mut all| {
                    all.find(|d| d.id().ok() == id || (id.is_none() && label(d) == name))
                })
            };
            if let Some(d) = device {
                match open(&d, sample_rate, engine, stats) {
                    Ok(l) => break l,
                    Err(e) => eprintln!("can't reopen {}: {e}", label(&d)),
                }
            }
            let now = fallback();
            if now != offered {
                offered = now;
                set(OutputStatus::Lost {
                    device: name.clone(),
                    fallback: offered.clone(),
                });
            }
        };
        set(OutputStatus::Connected {
            device: live.name.clone(),
            sample_rate,
        });
    }
}
