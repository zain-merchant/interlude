//! Sound card output through cpal.
//!
//! The stream is built and owned by a dedicated thread, because cpal streams
//! are not `Send` on every platform. Dropping [`AudioOutput`] stops it.

use std::sync::mpsc;
use std::thread::JoinHandle;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use crate::{new_engine, EngineHandle, MAX_BLOCK_FRAMES};

#[derive(Debug, thiserror::Error)]
pub enum OutputError {
    #[error("no audio output device found")]
    NoDevice,
    #[error("audio device error: {0}")]
    Device(String),
}

pub struct AudioOutput {
    stop: Option<mpsc::Sender<()>>,
    thread: Option<JoinHandle<()>>,
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

impl Drop for AudioOutput {
    fn drop(&mut self) {
        self.stop.take();
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
    let (ready_tx, ready_rx) = mpsc::channel();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let thread = std::thread::Builder::new()
        .name("audio-output".into())
        .spawn(move || {
            let result = (|| {
                let host = cpal::default_host();
                let device = host.default_output_device().ok_or(OutputError::NoDevice)?;
                let name = device
                    .description()
                    .map(|d| format!("{d:?}"))
                    .unwrap_or_else(|_| "default".into());
                let default = device
                    .default_output_config()
                    .map_err(|e| OutputError::Device(e.to_string()))?;
                let channels = default.channels();
                let sample_rate = default.sample_rate();
                let config = cpal::StreamConfig {
                    channels,
                    sample_rate,
                    // Ask for a small buffer for low latency; fall back to
                    // the device default if refused.
                    buffer_size: cpal::BufferSize::Default,
                };

                let (mut engine, handle) = new_engine(sample_rate);
                let mut master = vec![0f32; MAX_BLOCK_FRAMES * 2];
                let mut cue = vec![0f32; MAX_BLOCK_FRAMES * 2];
                let ch = channels as usize;

                let stream = device
                    .build_output_stream(
                        config,
                        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
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
                        },
                        |err| eprintln!("audio stream error: {err}"),
                        None,
                    )
                    .map_err(|e| OutputError::Device(e.to_string()))?;
                stream
                    .play()
                    .map_err(|e| OutputError::Device(e.to_string()))?;
                Ok((stream, handle, name, sample_rate, channels))
            })();

            match result {
                Ok((stream, handle, name, sr, ch)) => {
                    let _ = ready_tx.send(Ok((handle, name, sr, ch)));
                    // Park until the AudioOutput is dropped.
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .map_err(|e| OutputError::Device(e.to_string()))?;

    let (handle, device_name, sample_rate, channels) = ready_rx
        .recv()
        .map_err(|_| OutputError::Device("audio thread exited".into()))??;
    Ok((
        AudioOutput {
            stop: Some(stop_tx),
            thread: Some(thread),
            device_name,
            sample_rate,
            channels,
        },
        handle,
    ))
}
