use std::fs::File;
use std::path::{Path, PathBuf};

use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

use std::sync::{mpsc, Arc};

use crate::analysis::{detect_beatgrid, Beatgrid, BeatgridBuilder};
use crate::key::{detect_key, Key, KeyBuilder};
use crate::loudness::{measure_loudness, Loudness, LoudnessBuilder};
use crate::waveform::WaveformBuilder;
use crate::Waveform;

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("could not open {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("unsupported or corrupt audio file: {0}")]
    Decode(String),
    #[error("file has no audio track")]
    NoAudio,
}

/// A fully decoded track, held in memory as interleaved stereo `f32`.
///
/// DJ software needs instant random access for cueing, scratching and
/// looping, so we decode the whole file up front (about 10 MB per minute at
/// 44.1 kHz). Load this off the audio thread and pass it to the engine in an
/// `Arc`.
#[derive(Debug)]
pub struct Track {
    pub path: Option<PathBuf>,
    pub sample_rate: u32,
    /// Interleaved stereo: `[l0, r0, l1, r1, ...]`.
    pub samples: Vec<f32>,
    pub waveform: Waveform,
    /// Detected tempo and beat positions, if the track has a clear pulse.
    pub beatgrid: Option<Beatgrid>,
    /// Detected musical key, if the track has clear tonal content.
    pub key: Option<Key>,
    pub loudness: Loudness,
}

/// Interleaved samples decoded before a stretch goes to the analysis
/// threads: about 0.75 s of stereo audio at 44.1 kHz.
const FEED_SAMPLES: usize = 1 << 16;

type Analysis = (Waveform, Option<Beatgrid>, Option<Key>, Loudness);

/// Runs `produce`, which calls `feed` with consecutive stretches of
/// interleaved stereo audio, while four threads analyze that audio for the
/// waveform, beatgrid, key and loudness.
fn analyze_while<R>(
    sample_rate: u32,
    produce: impl FnOnce(&mut dyn FnMut(&[f32])) -> R,
) -> (R, Analysis) {
    // A few stretches in flight at most: if analysis falls behind, decoding
    // waits rather than queueing up a second copy of the track.
    const IN_FLIGHT: usize = 8;
    std::thread::scope(|s| {
        let (wf_tx, wf_rx) = mpsc::sync_channel::<Arc<[f32]>>(IN_FLIGHT);
        let (bg_tx, bg_rx) = mpsc::sync_channel::<Arc<[f32]>>(IN_FLIGHT);
        let (key_tx, key_rx) = mpsc::sync_channel::<Arc<[f32]>>(IN_FLIGHT);
        let (lu_tx, lu_rx) = mpsc::sync_channel::<Arc<[f32]>>(IN_FLIGHT);
        let waveform = s.spawn(move || {
            let mut b = WaveformBuilder::new(sample_rate);
            wf_rx.iter().for_each(|c| b.push(&c));
            b.finish()
        });
        let grid = s.spawn(move || {
            let mut b = BeatgridBuilder::new(sample_rate);
            bg_rx.iter().for_each(|c| b.push(&c));
            b.finish()
        });
        let key = s.spawn(move || {
            let mut b = KeyBuilder::new(sample_rate);
            key_rx.iter().for_each(|c| b.push(&c));
            b.finish()
        });
        let loudness = s.spawn(move || {
            let mut b = LoudnessBuilder::new(sample_rate);
            lu_rx.iter().for_each(|c| b.push(&c));
            b.finish()
        });
        let result = produce(&mut |chunk: &[f32]| {
            if chunk.is_empty() {
                return;
            }
            let chunk: Arc<[f32]> = chunk.into();
            for tx in [&wf_tx, &bg_tx, &key_tx, &lu_tx] {
                let _ = tx.send(chunk.clone());
            }
        });
        drop((wf_tx, bg_tx, key_tx, lu_tx));
        let analysis = (
            waveform.join().unwrap_or_default(),
            grid.join().ok().flatten(),
            key.join().ok().flatten(),
            loudness.join().unwrap_or_default(),
        );
        (result, analysis)
    })
}

impl Track {
    /// Builds a track from interleaved stereo samples and analyzes its
    /// waveform, tempo, key and loudness.
    pub fn from_stereo(samples: Vec<f32>, sample_rate: u32) -> Self {
        // The analyses only read the samples, so run them side by side:
        // loading takes as long as the slowest, not all of them.
        let (waveform, beatgrid, key, loudness) = std::thread::scope(|s| {
            let key = s.spawn(|| detect_key(&samples, sample_rate));
            let waveform = s.spawn(|| Waveform::analyze(&samples, sample_rate));
            let loudness = s.spawn(|| measure_loudness(&samples, sample_rate));
            let grid = detect_beatgrid(&samples, sample_rate);
            let waveform = waveform.join().unwrap_or_default();
            (
                waveform,
                grid,
                key.join().ok().flatten(),
                loudness.join().unwrap_or_default(),
            )
        });
        Self {
            path: None,
            sample_rate,
            samples,
            waveform,
            beatgrid,
            key,
            loudness,
        }
    }

    /// Decodes an audio file (MP3, AAC/M4A, FLAC, WAV, AIFF, OGG, ALAC).
    pub fn load(path: impl AsRef<Path>) -> Result<Self, LoadError> {
        let path = path.as_ref();
        let mut opened = Decoding::open(path)?;
        let stream_rate = opened.stream_rate;
        // Analyze while decoding: each new stretch of audio goes to the
        // analysis threads as soon as it's decoded, so they finish soon
        // after the last packet instead of starting then.
        let (stereo, sample_rate, analysis) = if stream_rate > 0 {
            let (result, analysis) = analyze_while(stream_rate, |feed| opened.run(feed));
            let (stereo, sample_rate) = result?;
            (stereo, sample_rate, Some(analysis))
        } else {
            let (stereo, sample_rate) = opened.run(&mut |_| {})?;
            (stereo, sample_rate, None)
        };
        let mut track = match analysis {
            // The rate changed mid-file (or wasn't known up front): analyze
            // again at the rate the audio really has.
            Some((waveform, beatgrid, key, loudness)) if sample_rate == stream_rate => Track {
                path: None,
                sample_rate,
                samples: stereo,
                waveform,
                beatgrid,
                key,
                loudness,
            },
            _ => Track::from_stereo(stereo, sample_rate),
        };
        track.path = Some(path.to_owned());
        Ok(track)
    }
}

/// What the library knows about a track it hasn't loaded: its length,
/// tempo, key and loudness.
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub struct TrackSummary {
    /// Seconds.
    pub duration: f64,
    /// Detected tempo, if the track has a clear pulse.
    pub bpm: Option<f64>,
    pub key: Option<Key>,
    pub loudness: Loudness,
}

impl TrackSummary {
    pub fn of(track: &Track) -> Self {
        Self {
            duration: track.duration_secs(),
            bpm: track.beatgrid.map(|g| g.bpm),
            key: track.key,
            loudness: track.loudness,
        }
    }

    /// Decodes and analyzes a file for the library, without keeping the
    /// audio or building a waveform. Runs tempo, key and loudness one after
    /// the other on the calling thread, so background analysis stays on one
    /// core.
    pub fn analyze(path: impl AsRef<Path>) -> Result<Self, LoadError> {
        let (stereo, sample_rate) = decode(path.as_ref())?;
        Ok(Self {
            duration: stereo.len() as f64 / 2.0 / sample_rate as f64,
            bpm: detect_beatgrid(&stereo, sample_rate).map(|g| g.bpm),
            key: detect_key(&stereo, sample_rate),
            loudness: measure_loudness(&stereo, sample_rate),
        })
    }
}

/// Decodes a file to interleaved stereo `f32` and its sample rate.
fn decode(path: &Path) -> Result<(Vec<f32>, u32), LoadError> {
    Decoding::open(path)?.run(&mut |_| {})
}

/// An opened audio file, ready to decode.
struct Decoding {
    format: Box<dyn symphonia::core::formats::FormatReader>,
    decoder: Box<dyn symphonia::core::codecs::audio::AudioDecoder>,
    track_id: u32,
    /// The sample rate the container declares, or 0 if it doesn't.
    stream_rate: u32,
    /// Frames the container says it holds, with a little slack, or 0.
    expected: usize,
}

impl Decoding {
    fn open(path: &Path) -> Result<Self, LoadError> {
        let file = File::open(path).map_err(|source| LoadError::Io {
            path: path.to_owned(),
            source,
        })?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let format = symphonia::default::get_probe()
            .probe(
                &hint,
                mss,
                FormatOptions::default(),
                MetadataOptions::default(),
            )
            .map_err(|e| LoadError::Decode(e.to_string()))?;
        let track = format
            .default_track(TrackType::Audio)
            .ok_or(LoadError::NoAudio)?;
        let track_id = track.id;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|p| p.audio())
            .ok_or(LoadError::NoAudio)?;
        let stream_rate = params.sample_rate.unwrap_or(0);
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|e| LoadError::Decode(e.to_string()))?;
        let expected = track
            .num_frames
            .and_then(|n| usize::try_from(n).ok())
            .map(|n| n + n / 100 + stream_rate as usize)
            .unwrap_or(0);
        Ok(Self {
            format,
            decoder,
            track_id,
            stream_rate,
            expected,
        })
    }

    /// Decodes the whole file, handing each new stretch of audio to `feed`
    /// as it goes. Returns interleaved stereo and its sample rate.
    fn run(&mut self, feed: &mut dyn FnMut(&[f32])) -> Result<(Vec<f32>, u32), LoadError> {
        let mut sample_rate = self.stream_rate;
        // Size the buffer once from the container's frame count when it has
        // one. Growing by doubling instead copies the track several times
        // and can leave half of it as unused capacity.
        let mut stereo: Vec<f32> = Vec::with_capacity(self.expected.saturating_mul(2));
        let mut packet_buf: Vec<f32> = Vec::new();
        let mut sent = 0;
        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(p)) => p,
                Ok(None) => break,
                Err(SymphoniaError::IoError(e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break
                }
                Err(e) => return Err(LoadError::Decode(e.to_string())),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            match self.decoder.decode(&packet) {
                Ok(buf) => {
                    let channels = buf.spec().channels().count().max(1);
                    sample_rate = buf.spec().rate();
                    packet_buf.resize(buf.samples_interleaved(), 0.0);
                    buf.copy_to_slice_interleaved(&mut packet_buf);
                    stereo.reserve(buf.frames() * 2);
                    for frame in packet_buf.chunks_exact(channels) {
                        let (l, r) = if channels == 1 {
                            (frame[0], frame[0])
                        } else {
                            (frame[0], frame[1])
                        };
                        stereo.push(l);
                        stereo.push(r);
                    }
                    if stereo.len() - sent >= FEED_SAMPLES {
                        feed(&stereo[sent..]);
                        sent = stereo.len();
                    }
                }
                // A corrupt packet is skipped, like every player does.
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(e) => return Err(LoadError::Decode(e.to_string())),
            }
        }
        feed(&stereo[sent..]);

        if sample_rate == 0 || stereo.is_empty() {
            return Err(LoadError::NoAudio);
        }
        // Give back spare capacity (from a missing or low frame count): it
        // would otherwise stay allocated for as long as the track is loaded.
        if stereo.capacity() > stereo.len() + stereo.len() / 50 {
            stereo.shrink_to_fit();
        }
        Ok((stereo, sample_rate))
    }
}

impl Track {
    pub fn frames(&self) -> usize {
        self.samples.len() / 2
    }

    pub fn duration_secs(&self) -> f64 {
        self.frames() as f64 / self.sample_rate as f64
    }

    /// Display name: the file name without extension.
    pub fn title(&self) -> String {
        self.path
            .as_ref()
            .and_then(|p| p.file_stem())
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Untitled".into())
    }
}
