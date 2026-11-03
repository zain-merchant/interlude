use std::sync::Arc;

use crate::dsp::{db_to_gain, hermite, Eq3, Smoothed};
use crate::{Beatgrid, EqBand, Track};

/// How much of a jog movement a playing deck's nudge moves the play head.
const NUDGE_SCALE: f64 = 0.15;
/// Decay time of a jog nudge, in seconds.
const JOG_BEND_TAU: f64 = 0.08;
/// Time for the scratch follower to close the gap to the hand.
const SCRATCH_TAU: f64 = 0.012;
/// Velocity smoothing for scratching.
const SCRATCH_SMOOTH: f64 = 0.004;
/// Fastest a scratch can play, as a multiple of normal speed.
const SCRATCH_MAX_SPEED: f64 = 10.0;

/// Where a deck is on its beatgrid.
pub(crate) struct BeatInfo {
    pub bpm: f64,
    /// Fractional beat number at the play head.
    pub beat: f64,
}

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
    /// Temporary tempo push from the jog wheel's outer ring, decaying to 0.
    pub jog_bend: f64,
    /// Hand on the platter: the play head chases `scratch_target`.
    pub scratching: bool,
    scratch_target: f64,
    /// Scratch velocity in source frames per output frame.
    scratch_vel: f64,
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
            jog_bend: 0.0,
            scratching: false,
            scratch_target: 0.0,
            scratch_vel: 0.0,
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
        self.scratching = false;
        self.scratch_vel = 0.0;
        self.jog_bend = 0.0;
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

    pub fn set_cue_secs(&mut self, secs: f64) {
        if self.track.is_some() {
            self.cue = (secs * self.source_rate()).clamp(0.0, self.frames());
        }
    }

    pub fn scratch_start(&mut self) {
        if self.track.is_some() {
            self.scratching = true;
            self.scratch_target = self.pos;
            self.scratch_vel = 0.0;
        }
    }

    pub fn scratch_end(&mut self) {
        self.scratching = false;
    }

    /// See `Command::Jog`.
    pub fn jog(&mut self, secs: f64) {
        let frames = secs * self.source_rate();
        if self.scratching {
            self.scratch_target = (self.scratch_target + frames).clamp(0.0, self.frames());
        } else if self.playing {
            // An impulse that decays over JOG_BEND_TAU; integrated, it moves
            // the play head by NUDGE_SCALE times the wheel's movement.
            self.jog_bend += secs * NUDGE_SCALE / JOG_BEND_TAU;
            self.jog_bend = self.jog_bend.clamp(-0.5, 0.5);
        } else {
            self.pos = (self.pos + frames).clamp(0.0, self.frames());
        }
    }

    /// Playback speed (1.0 = normal) when moving: the scratch velocity while
    /// scratching, otherwise the rate plus any nudge.
    pub fn speed(&self) -> f64 {
        if self.scratching {
            self.scratch_vel * self.out_rate / self.source_rate()
        } else {
            self.rate + self.bend + self.jog_bend
        }
    }

    fn grid(&self) -> Option<Beatgrid> {
        self.track.as_ref().and_then(|t| t.beatgrid)
    }

    pub fn beat_info(&self) -> Option<BeatInfo> {
        let g = self.grid()?;
        Some(BeatInfo {
            bpm: g.bpm,
            beat: g.beat_at(self.pos / self.source_rate()),
        })
    }

    /// Moves the play head by a (fractional) number of beats.
    pub fn shift_beats(&mut self, beats: f64) {
        if let Some(g) = self.grid() {
            let frames = beats * g.beat_length() * self.source_rate();
            self.pos = (self.pos + frames).clamp(0.0, self.frames());
        }
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
        let ratio = track.sample_rate as f64 / self.out_rate;
        let step = (self.rate + self.bend + self.jog_bend).max(0.0) * ratio;
        let end = frames as f64;
        // Per-frame coefficients for the scratch follower: a spring pulling
        // the velocity towards closing the gap to the hand within
        // SCRATCH_TAU, smoothed over SCRATCH_SMOOTH so jog ticks blur into
        // continuous motion.
        let pull = 1.0 / (SCRATCH_TAU * self.out_rate);
        let smooth = 1.0 / (SCRATCH_SMOOTH * self.out_rate);
        let max_vel = SCRATCH_MAX_SPEED * ratio;

        let sample = |i: i64, ch: usize| -> f32 {
            if i < 0 || i >= frames {
                0.0
            } else {
                samples[i as usize * 2 + ch]
            }
        };

        for frame in out.as_chunks_mut::<2>().0 {
            let (mut l, mut r) = (0.0, 0.0);
            if self.playing || self.scratching {
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
                if self.scratching {
                    let want = (self.scratch_target - self.pos) * pull;
                    self.scratch_vel += (want - self.scratch_vel) * smooth;
                    self.scratch_vel = self.scratch_vel.clamp(-max_vel, max_vel);
                    self.pos = (self.pos + self.scratch_vel).clamp(0.0, end);
                } else {
                    self.pos += step;
                    if self.pos >= end {
                        self.pos = end;
                        self.playing = false;
                        self.previewing = false;
                    }
                }
            }
            // Keep the EQ running on silence so its tail rings out naturally.
            let (l, r) = self.eq.process(l, r);
            let g = self.gain.tick();
            frame[0] = l * g;
            frame[1] = r * g;
            peak = peak.max(frame[0].abs()).max(frame[1].abs());
        }
        if self.jog_bend != 0.0 {
            let n = (out.len() / 2) as f64;
            self.jog_bend *= (-n / (JOG_BEND_TAU * self.out_rate)).exp();
            if self.jog_bend.abs() < 1e-4 {
                self.jog_bend = 0.0;
            }
        }
        peak
    }
}
