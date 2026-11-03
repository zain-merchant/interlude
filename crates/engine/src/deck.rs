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

/// Hot cue slots per deck, one per performance pad.
pub const HOT_CUES: usize = 8;
/// Shortest and longest loop and beat jump size, in beats.
pub const MIN_LOOP_BEATS: f64 = 1.0 / 32.0;
pub const MAX_LOOP_BEATS: f64 = 64.0;
/// Loop size a freshly loaded deck starts with, in beats.
pub const DEFAULT_LOOP_BEATS: f64 = 4.0;
/// Shortest manual loop, in seconds, for tracks without a beatgrid.
const MIN_LOOP_SECS: f64 = 0.01;
/// A jump while playing (a loop wrapping, a hot cue, a beat jump)
/// crossfades from the old position over this many output frames, so it
/// doesn't click.
const JUMP_FADE_FRAMES: u32 = 128;

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
    /// True while the cue button or a hot cue is held to preview.
    pub previewing: bool,
    /// Where a held preview returns to on release.
    preview_return: f64,
    /// The hot cue holding the preview, or `None` for the main cue.
    preview_hot: Option<usize>,
    /// Hot cue positions in source frames.
    pub hot_cues: [Option<f64>; HOT_CUES],
    /// Loop points in source frames. A loop can be stored but not active,
    /// so reloop can jump back into it.
    pub loop_in: Option<f64>,
    pub loop_out: Option<f64>,
    /// True while playback wraps from `loop_out` back to `loop_in`.
    pub looping: bool,
    /// Size of the next beat loop and of beat jumps, in beats.
    pub loop_beats: f64,
    /// During a jump crossfade: the old position, still sounding, and how
    /// many frames of the fade are left.
    fade_from: f64,
    fade_left: u32,
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
            preview_return: 0.0,
            preview_hot: None,
            hot_cues: [None; HOT_CUES],
            loop_in: None,
            loop_out: None,
            looping: false,
            loop_beats: DEFAULT_LOOP_BEATS,
            fade_from: 0.0,
            fade_left: 0,
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
        self.preview_hot = None;
        self.hot_cues = [None; HOT_CUES];
        self.loop_in = None;
        self.loop_out = None;
        self.looping = false;
        self.loop_beats = DEFAULT_LOOP_BEATS;
        self.fade_left = 0;
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
            self.preview_hot = None;
        }
    }

    pub fn pause(&mut self) {
        self.playing = false;
        self.previewing = false;
        self.preview_hot = None;
    }

    /// CDJ-style cue:
    /// * playing: jump back to the cue point and stop;
    /// * paused away from the cue point: set the cue point here, then preview;
    /// * paused on the cue point: preview while the button is held.
    pub fn cue_press(&mut self) {
        // A hot cue preview owns the deck until its pad is released.
        if self.track.is_none() || self.preview_hot.is_some() {
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
        self.preview_return = self.cue;
    }

    pub fn cue_release(&mut self) {
        if self.previewing && self.preview_hot.is_none() {
            self.end_preview();
        }
    }

    fn end_preview(&mut self) {
        self.previewing = false;
        self.preview_hot = None;
        self.playing = false;
        self.fade_left = 0;
        self.pos = self.preview_return;
    }

    /// Moves the play head. While playing, the old position fades out
    /// under the new one so the jump doesn't click.
    fn jump(&mut self, to: f64) {
        if self.playing && !self.scratching {
            self.fade_from = self.pos;
            self.fade_left = JUMP_FADE_FRAMES;
        }
        self.pos = to.clamp(0.0, self.frames());
    }

    /// Leaves the active loop if `at` is outside it.
    fn leave_loop_if_outside(&mut self, at: f64) {
        if let (true, Some(i), Some(o)) = (self.looping, self.loop_in, self.loop_out) {
            if at < i || at >= o {
                self.looping = false;
            }
        }
    }

    pub fn seek_secs(&mut self, secs: f64) {
        let to = (secs * self.source_rate()).clamp(0.0, self.frames());
        self.leave_loop_if_outside(to);
        self.jump(to);
    }

    /// Hot cue pad pressed. An empty hot cue is set at the play head. A
    /// set one is jumped to: a playing deck keeps playing from there, a
    /// paused deck plays from it while the pad is held, like the cue
    /// button.
    pub fn hot_cue_press(&mut self, n: usize) {
        if self.track.is_none() || n >= HOT_CUES {
            return;
        }
        let Some(at) = self.hot_cues[n] else {
            self.hot_cues[n] = Some(self.pos);
            return;
        };
        self.leave_loop_if_outside(at);
        self.jump(at);
        if !self.playing || self.previewing {
            self.playing = true;
            self.previewing = true;
            self.preview_hot = Some(n);
            self.preview_return = at;
        }
    }

    pub fn hot_cue_release(&mut self, n: usize) {
        if self.previewing && self.preview_hot == Some(n) {
            self.end_preview();
        }
    }

    pub fn hot_cue_clear(&mut self, n: usize) {
        if let Some(c) = self.hot_cues.get_mut(n) {
            *c = None;
        }
    }

    /// Source frames in `beats` beats, if the track has a beatgrid.
    fn beat_frames(&self, beats: f64) -> Option<f64> {
        self.grid()
            .map(|g| beats * g.beat_length() * self.source_rate())
    }

    /// Length of the stored loop in source frames.
    fn loop_len(&self) -> Option<f64> {
        Some(self.loop_out? - self.loop_in?)
    }

    /// Shortest loop allowed, in source frames.
    fn min_loop(&self) -> f64 {
        self.beat_frames(MIN_LOOP_BEATS)
            .unwrap_or(MIN_LOOP_SECS * self.source_rate())
            .max(MIN_LOOP_SECS * self.source_rate())
    }

    /// Takes the loop size from a loop's length when it's a power-of-two
    /// number of beats, so the size shown matches the loop playing.
    fn adopt_loop_size(&mut self, len: f64) {
        if let Some(beat) = self.beat_frames(1.0) {
            let beats = len / beat;
            let p = beats.log2().round().exp2();
            if (beats / p - 1.0).abs() < 0.01 {
                self.loop_beats = p.clamp(MIN_LOOP_BEATS, MAX_LOOP_BEATS);
            }
        }
    }

    /// Starts a loop of `beats` beats at the nearest beat (or the nearest
    /// fraction of a beat, for loops under one beat). An active loop keeps
    /// its start and changes length. Needs a beatgrid.
    pub fn beat_loop(&mut self, beats: f64) {
        let Some(g) = self.grid() else { return };
        if self.track.is_none() {
            return;
        }
        let beats = beats.clamp(MIN_LOOP_BEATS, MAX_LOOP_BEATS);
        let sr = self.source_rate();
        let len = beats * g.beat_length() * sr;
        self.loop_beats = beats;
        if self.looping {
            self.resize_loop(len);
            return;
        }
        let unit = beats.min(1.0);
        let start_beat = (g.beat_at(self.pos / sr) / unit).round() * unit;
        let start = (g.time_of_beat(start_beat) * sr).max(0.0);
        if start + len > self.frames() {
            return;
        }
        self.loop_in = Some(start);
        self.loop_out = Some(start + len);
        self.looping = true;
    }

    /// Pad in beat loop mode: a loop of that size, or out of it if it's
    /// the one playing.
    pub fn beat_loop_toggle(&mut self, beats: f64) {
        let current = self
            .loop_len()
            .zip(self.beat_frames(1.0))
            .map(|(len, beat)| len / beat);
        if self.looping && current.is_some_and(|b| (b - beats).abs() < 1e-3) {
            self.looping = false;
        } else {
            self.beat_loop(beats);
        }
    }

    /// The loop button: out of the active loop, or into a new beat loop of
    /// the deck's loop size.
    pub fn loop_toggle(&mut self) {
        if self.looping {
            self.looping = false;
        } else {
            self.beat_loop(self.loop_beats);
        }
    }

    /// Changes the active loop's length, keeping its start, and brings the
    /// play head back inside if the loop got shorter.
    fn resize_loop(&mut self, len: f64) {
        let Some(start) = self.loop_in else { return };
        if len < self.min_loop() - 1e-6 || start + len > self.frames() {
            return;
        }
        self.loop_out = Some(start + len);
        if self.looping && self.pos >= start + len {
            self.jump(start + (self.pos - start) % len);
        }
    }

    /// Halves (0.5) or doubles (2.0) the loop size, and the active loop
    /// with it.
    pub fn loop_scale(&mut self, factor: f64) {
        if factor.is_nan() || factor <= 0.0 {
            return;
        }
        if let (true, Some(len)) = (self.looping, self.loop_len()) {
            let before = self.loop_out;
            self.resize_loop(len * factor);
            if self.loop_out != before {
                self.loop_beats = (self.loop_beats * factor).clamp(MIN_LOOP_BEATS, MAX_LOOP_BEATS);
                self.adopt_loop_size(len * factor);
            }
        } else {
            self.loop_beats = (self.loop_beats * factor).clamp(MIN_LOOP_BEATS, MAX_LOOP_BEATS);
        }
    }

    /// Sets the loop in point at the play head. The loop starts when the
    /// out point is set.
    pub fn loop_in_press(&mut self) {
        if self.track.is_some() {
            self.loop_in = Some(self.pos);
            self.loop_out = None;
            self.looping = false;
        }
    }

    /// Sets the loop out point at the play head and starts looping.
    pub fn loop_out_press(&mut self) {
        let Some(start) = self.loop_in else { return };
        if self.pos - start < self.min_loop() {
            return;
        }
        let len = self.pos - start;
        self.loop_out = Some(self.pos);
        self.looping = true;
        self.adopt_loop_size(len);
        self.jump(start);
    }

    /// Out of the active loop, or back into the last one.
    pub fn reloop_exit(&mut self) {
        if self.looping {
            self.looping = false;
        } else if let (Some(start), Some(_)) = (self.loop_in, self.loop_out) {
            self.looping = true;
            self.jump(start);
        }
    }

    /// Moves the play head by `beats` (negative is back). An active loop
    /// moves along with it. Needs a beatgrid.
    pub fn beat_jump(&mut self, beats: f64) {
        let Some(d) = self.beat_frames(beats) else {
            return;
        };
        if self.track.is_none() {
            return;
        }
        if let (true, Some(i), Some(o)) = (self.looping, self.loop_in, self.loop_out) {
            let d = d.clamp(-i, self.frames() - o);
            self.loop_in = Some(i + d);
            self.loop_out = Some(o + d);
            self.jump(self.pos + d);
        } else {
            self.jump(self.pos + d);
        }
    }

    pub fn scratch_start(&mut self) {
        if self.track.is_some() {
            self.scratching = true;
            self.fade_left = 0;
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
        let read = |pos: f64| -> (f32, f32) {
            let i = pos.floor() as i64;
            let t = (pos - i as f64) as f32;
            let ch = |c| {
                hermite(
                    t,
                    sample(i - 1, c),
                    sample(i, c),
                    sample(i + 1, c),
                    sample(i + 2, c),
                )
            };
            (ch(0), ch(1))
        };
        // The active loop, as (in, length).
        let wrap = match (self.looping, self.loop_in, self.loop_out) {
            (true, Some(i), Some(o)) if o > i => Some((i, o - i)),
            _ => None,
        };

        for frame in out.as_chunks_mut::<2>().0 {
            let (mut l, mut r) = (0.0, 0.0);
            if self.playing || self.scratching {
                (l, r) = read(self.pos);
                if self.fade_left > 0 {
                    // Linear crossfade from the old position to the new.
                    let w = self.fade_left as f32 / JUMP_FADE_FRAMES as f32;
                    let (ol, or) = read(self.fade_from);
                    l += (ol - l) * w;
                    r += (or - r) * w;
                    self.fade_from += step;
                    self.fade_left -= 1;
                }
                if self.scratching {
                    let want = (self.scratch_target - self.pos) * pull;
                    self.scratch_vel += (want - self.scratch_vel) * smooth;
                    self.scratch_vel = self.scratch_vel.clamp(-max_vel, max_vel);
                    self.pos = (self.pos + self.scratch_vel).clamp(0.0, end);
                } else {
                    let before = self.pos;
                    self.pos += step;
                    if let Some((start, len)) = wrap {
                        let out = start + len;
                        if before < out && self.pos >= out {
                            self.fade_from = self.pos;
                            self.fade_left = JUMP_FADE_FRAMES;
                            self.pos -= len;
                        }
                    }
                    if self.pos >= end {
                        self.pos = end;
                        self.playing = false;
                        self.previewing = false;
                        self.preview_hot = None;
                        self.fade_left = 0;
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
