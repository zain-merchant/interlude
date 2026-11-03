use std::sync::Arc;

use crate::dsp::{db_to_gain, hermite, Eq3, Smoothed};
use crate::{EqBand, Track};

/// One deck's playback state. Lives on the audio thread.
pub(crate) struct Deck {
    pub track: Option<Arc<Track>>,
    /// Play head in source frames (fractional, for varispeed).
    pub pos: f64,
    pub playing: bool,
    /// Cue point in source frames.
    pub cue: f64,
    /// True while the cue button is held to preview from the cue point.
    pub previewing: bool,
    pub rate: f64,
    pub bend: f64,
    gain: Smoothed,
    eq: Eq3,
    out_rate: f64,
}

impl Deck {
    pub fn new(out_rate: f32) -> Self {
        Self {
            track: None,
            pos: 0.0,
            playing: false,
            cue: 0.0,
            previewing: false,
            rate: 1.0,
            bend: 0.0,
            gain: Smoothed::new(1.0, 10.0, out_rate),
            eq: Eq3::new(out_rate),
            out_rate: out_rate as f64,
        }
    }

    /// Replaces the track and returns the old one so the caller can free it
    /// off the audio thread.
    pub fn load(&mut self, track: Option<Arc<Track>>) -> Option<Arc<Track>> {
        self.pos = 0.0;
        self.cue = 0.0;
        self.playing = false;
        self.previewing = false;
        self.eq.reset();
        std::mem::replace(&mut self.track, track)
    }

    fn frames(&self) -> f64 {
        self.track.as_ref().map_or(0.0, |t| t.frames() as f64)
    }

    pub fn source_rate(&self) -> f64 {
        self.track
            .as_ref()
            .map_or(self.out_rate, |t| t.sample_rate as f64)
    }

    pub fn play(&mut self) {
        if self.track.is_some() && self.pos < self.frames() {
            self.playing = true;
            // Pressing play during a cue preview keeps the deck playing
            // after the cue button is released.
            self.previewing = false;
        }
    }

    pub fn pause(&mut self) {
        self.playing = false;
        self.previewing = false;
    }

    /// CDJ-style cue:
    /// * playing: jump back to the cue point and stop;
    /// * paused away from the cue point: set the cue point here, then preview;
    /// * paused on the cue point: preview while the button is held.
    pub fn cue_press(&mut self) {
        if self.track.is_none() {
            return;
        }
        if self.playing && !self.previewing {
            self.pos = self.cue;
            self.playing = false;
            return;
        }
        if (self.pos - self.cue).abs() > 1.0 {
            self.cue = self.pos;
        }
        self.playing = true;
        self.previewing = true;
    }

    pub fn cue_release(&mut self) {
        if self.previewing {
            self.previewing = false;
            self.playing = false;
            self.pos = self.cue;
        }
    }

    pub fn seek_secs(&mut self, secs: f64) {
        self.pos = (secs * self.source_rate()).clamp(0.0, self.frames());
    }

    pub fn set_gain_db(&mut self, db: f32) {
        self.gain.set(db_to_gain(db.clamp(-24.0, 12.0)));
    }

    pub fn set_eq_db(&mut self, band: EqBand, db: f32) {
        self.eq.set_band_db(band as usize, db);
    }

    /// Renders `out.len() / 2` stereo frames, post-EQ and post-trim, pre-fader.
    /// Returns the block's peak level.
    pub fn render(&mut self, out: &mut [f32]) -> f32 {
        let mut peak = 0f32;
        let Some(track) = self.track.as_ref() else {
            out.fill(0.0);
            return 0.0;
        };
        let samples = &track.samples[..];
        let frames = track.frames() as i64;
        let step = (self.rate + self.bend).max(0.0) * track.sample_rate as f64 / self.out_rate;

        let sample = |i: i64, ch: usize| -> f32 {
            if i < 0 || i >= frames {
                0.0
            } else {
                samples[i as usize * 2 + ch]
            }
        };

        for frame in out.chunks_exact_mut(2) {
            let (mut l, mut r) = (0.0, 0.0);
            if self.playing {
                let i = self.pos.floor() as i64;
                let t = (self.pos - i as f64) as f32;
                l = hermite(
                    t,
                    sample(i - 1, 0),
                    sample(i, 0),
                    sample(i + 1, 0),
                    sample(i + 2, 0),
                );
                r = hermite(
                    t,
                    sample(i - 1, 1),
                    sample(i, 1),
                    sample(i + 1, 1),
                    sample(i + 2, 1),
                );
                self.pos += step;
                if self.pos >= frames as f64 {
                    self.pos = frames as f64;
                    self.playing = false;
                    self.previewing = false;
                }
            }
            // Keep the EQ running on silence so its tail rings out naturally.
            let (l, r) = self.eq.process(l, r);
            let g = self.gain.tick();
            frame[0] = l * g;
            frame[1] = r * g;
            peak = peak.max(frame[0].abs()).max(frame[1].abs());
        }
        peak
    }
}
