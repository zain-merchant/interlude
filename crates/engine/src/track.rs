use std::fs::File;
use std::path::{Path, PathBuf};

use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

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
}

impl Track {
    /// Builds a track from interleaved stereo samples and analyzes its waveform.
    pub fn from_stereo(samples: Vec<f32>, sample_rate: u32) -> Self {
        let waveform = Waveform::analyze(&samples, sample_rate);
        Self {
            path: None,
            sample_rate,
            samples,
            waveform,
        }
    }

    /// Decodes an audio file (MP3, AAC/M4A, FLAC, WAV, AIFF, OGG, ALAC).
    pub fn load(path: impl AsRef<Path>) -> Result<Self, LoadError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|source| LoadError::Io {
            path: path.to_owned(),
            source,
        })?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let mut format = symphonia::default::get_probe()
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
        let mut sample_rate = params.sample_rate.unwrap_or(0);
        let mut decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|e| LoadError::Decode(e.to_string()))?;

        let mut stereo: Vec<f32> = Vec::new();
        let mut packet_buf: Vec<f32> = Vec::new();
        loop {
            let packet = match format.next_packet() {
                Ok(Some(p)) => p,
                Ok(None) => break,
                Err(SymphoniaError::IoError(e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break
                }
                Err(e) => return Err(LoadError::Decode(e.to_string())),
            };
            if packet.track_id != track_id {
                continue;
            }
            match decoder.decode(&packet) {
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
                }
                // A corrupt packet is skipped, like every player does.
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(e) => return Err(LoadError::Decode(e.to_string())),
            }
        }

        if sample_rate == 0 || stereo.is_empty() {
            return Err(LoadError::NoAudio);
        }
        let mut track = Track::from_stereo(stereo, sample_rate);
        track.path = Some(path.to_owned());
        Ok(track)
    }

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
