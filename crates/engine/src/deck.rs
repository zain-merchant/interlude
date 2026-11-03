use std::sync::Arc;

use crate::dsp::{db_to_gain, hermite, Eq3, Smoothed};
use crate::{Beatgrid, EqBand, Track};

/// How much of a jog movement a playing deck's nudge moves the play head.
const NUDGE_SCALE: f64 = 0.15;
/// Decay time of a jog nudge, in seconds.
const JOG_BEND_TAU: f64 = 0.08;
/// Each of the scratch follower's two smoothing poles, in seconds. Together
/// they round off the corners of the hand's motion like a platter's inertia,
/// without overshoot.
const SCRATCH_SMOOTH: f64 = 0.004;
/// Extra delay the scratch follower keeps so late hand inputs don't stall
/// the record, in seconds. See `Hand`.
const HAND_CUSHION: f64 = 0.008;
/// The follower never lags the hand by more than this.
const HAND_MAX_LAG: f64 = 0.05;
/// A gap between hand inputs longer than this means the hand was still, and
/// its next move is spread over `HAND_FIRST_MOVE`.
const HAND_IDLE: f64 = 0.05;
const HAND_FIRST_MOVE: f64 = 0.01;
/// Fastest a scratch can play, as a multiple of normal speed.
const SCRATCH_MAX_SPEED: f64 = 10.0;
/// How quickly a playing record gets back up to speed after the hand lets go.
const SPINUP_TAU: f64 = 0.015;

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
    /// Hand on the platter (jog wheel top or a waveform drag).
    pub scratching: bool,
    /// The play head follows the hand. Stays on after a paused deck is
    /// released (or nudged by the outer ring) until it has caught up.
    following: bool,
    hand: Hand,
    /// Play head velocity in source frames per output frame, while following
    /// or spinning back up.
    vel: f64,
    /// A released playing deck is getting back up to speed.
    spinning_up: bool,
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
            following: false,
            hand: Hand::new(out_rate as f64),
            vel: 0.0,
            spinning_up: false,
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
        self.following = false;
        self.spinning_up = false;
        self.vel = 0.0;
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
            if !self.scratching {
                self.following = false;
            }
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
            self.jump_to(self.cue);
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
            self.jump_to(self.cue);
        }
    }

    pub fn seek_secs(&mut self, secs: f64) {
        self.jump_to(secs * self.source_rate());
    }

    /// Moves the play head instantly (seek, cue, sync). A hand on the record
    /// stays on it, at the new spot.
    fn jump_to(&mut self, frames: f64) {
        self.pos = frames.clamp(0.0, self.frames());
        if self.following {
            self.hand.reset(self.pos, 0.0);
            self.vel = 0.0;
        }
        self.spinning_up = false;
    }

    /// The play head starts following the hand from where it is, moving at
    /// its current speed so a spinning record slows down rather than halts.
    fn start_following(&mut self) {
        if self.following {
            return;
        }
        let vel = if self.spinning_up {
            self.vel
        } else if self.playing {
            self.normal_step()
        } else {
            0.0
        };
        self.following = true;
        self.spinning_up = false;
        self.vel = vel;
        self.hand.reset(self.pos, vel);
    }

    pub fn scratch_start(&mut self) {
        if self.track.is_some() {
            self.start_following();
            self.scratching = true;
        }
    }

    /// Hand off the platter. A playing deck spins back up to speed; a paused
    /// one glides to where the hand left it and stops.
    pub fn scratch_end(&mut self) {
        if !self.scratching {
            return;
        }
        self.scratching = false;
        if self.playing {
            self.following = false;
            self.spinning_up = true;
        }
    }

    /// See `Command::ScratchTo`.
    pub fn scratch_to(&mut self, secs: f64, dt: Option<f64>) {
        if self.scratching {
            let target = (secs * self.source_rate()).clamp(0.0, self.frames());
            self.hand.input(target, dt);
        }
    }

    /// See `Command::Jog`.
    pub fn jog(&mut self, secs: f64) {
        if self.track.is_none() {
            return;
        }
        let frames = secs * self.source_rate();
        if self.playing && !self.scratching {
            // An impulse that decays over JOG_BEND_TAU; integrated, it moves
            // the play head by NUDGE_SCALE times the wheel's movement.
            self.jog_bend += secs * NUDGE_SCALE / JOG_BEND_TAU;
            self.jog_bend = self.jog_bend.clamp(-0.5, 0.5);
        } else {
            // Scratching, or turning a paused record: audible either way.
            self.start_following();
            let target = (self.hand.target + frames).clamp(0.0, self.frames());
            self.hand.input(target, None);
        }
    }

    /// Normal playback step in source frames per output frame.
    fn normal_step(&self) -> f64 {
        (self.rate + self.bend + self.jog_bend).max(0.0) * self.source_rate() / self.out_rate
    }

    /// Playback speed (1.0 = normal) when moving: the scratch velocity while
    /// scratching, otherwise the rate plus any nudge.
    pub fn speed(&self) -> f64 {
        if self.following || self.spinning_up {
            self.vel * self.out_rate / self.source_rate()
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
            self.jump_to(self.pos + frames);
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
        let step = self.normal_step();
        let end = frames as f64;
        let max_vel = SCRATCH_MAX_SPEED * track.sample_rate as f64 / self.out_rate;
        let spin = 1.0 - (-1.0 / (SPINUP_TAU * self.out_rate)).exp();

        let sample = |i: i64, ch: usize| -> f32 {
            if i < 0 || i >= frames {
                0.0
            } else {
                samples[i as usize * 2 + ch]
            }
        };

        for frame in out.as_chunks_mut::<2>().0 {
            let (mut l, mut r) = (0.0, 0.0);
            if self.playing || self.following {
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
                if self.following {
                    let to = self.hand.tick();
                    self.vel = (to - self.pos).clamp(-max_vel, max_vel);
                    self.pos = (self.pos + self.vel).clamp(0.0, end);
                } else {
                    if self.spinning_up {
                        self.vel += (step - self.vel) * spin;
                        if (step - self.vel).abs() < 1e-4 {
                            self.spinning_up = false;
                        }
                    }
                    self.pos += if self.spinning_up { self.vel } else { step };
                    if self.pos >= end {
                        self.pos = end;
                        self.playing = false;
                        self.previewing = false;
                        self.spinning_up = false;
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
        let n = out.len() / 2;
        self.hand.elapsed(n);
        // A released paused record stops once it has reached the hand.
        if self.following && !self.scratching && self.hand.settled(self.pos) {
            self.following = false;
            self.pos = self.hand.target;
            self.vel = 0.0;
        }
        if self.jog_bend != 0.0 {
            let n = n as f64;
            self.jog_bend *= (-n / (JOG_BEND_TAU * self.out_rate)).exp();
            if self.jog_bend.abs() < 1e-4 {
                self.jog_bend = 0.0;
            }
        }
        peak
    }
}

/// Where the hand has put the record, turned into smooth motion.
///
/// Hand inputs (jog ticks, mouse moves) reach the audio thread in uneven
/// bursts at block boundaries. Played back as jumps they would buzz at the
/// block rate. Instead each input's movement is laid out over the time it
/// took (by the sender's clock when it has one), queued behind any movement
/// still being played, with a few milliseconds of cushion so late inputs
/// don't stall the record. Two gentle low-pass poles then round off the
/// corners like a platter's inertia. The result never overshoots, so a
/// stopped hand never produces a backwards chirp.
struct Hand {
    /// Latest hand position, source frames.
    target: f64,
    /// The hand as played back, moving towards `target`.
    ramp: f64,
    /// Output frames until `ramp` reaches `target`.
    ramp_left: f64,
    /// Output frames since the last input (arrival time on the audio thread).
    since_input: f64,
    /// The two smoothing poles; `p2` is where the play head should be.
    p1: f64,
    p2: f64,
    smooth: f64,
    out_rate: f64,
}

impl Hand {
    fn new(out_rate: f64) -> Self {
        Self {
            target: 0.0,
            ramp: 0.0,
            ramp_left: 0.0,
            since_input: f64::INFINITY,
            p1: 0.0,
            p2: 0.0,
            smooth: 1.0 - (-1.0 / (SCRATCH_SMOOTH * out_rate)).exp(),
            out_rate,
        }
    }

    /// Puts the hand on the record at `pos` while the play head moves at
    /// `vel` frames per output frame, so it eases to a stop from there.
    fn reset(&mut self, pos: f64, vel: f64) {
        // For the second pole to move at `vel`, the first must lead by
        // vel / smooth. The hand holds the record there: it slides a few
        // milliseconds and stops, without rolling back.
        let lead = pos + vel / self.smooth;
        self.target = lead;
        self.ramp = lead;
        self.p1 = lead;
        self.p2 = pos;
        self.ramp_left = 0.0;
        self.since_input = f64::INFINITY;
    }

    /// The hand moved to `target`. `dt` is the time since its previous
    /// move in seconds, if the sender timed it; otherwise it is measured by
    /// arrival.
    fn input(&mut self, target: f64, dt: Option<f64>) {
        let sr = self.out_rate;
        let dt = match dt {
            Some(dt) => dt * sr,
            None => self.since_input,
        };
        // A hand that was still: assume a typical gap rather than spreading
        // the first move over the whole pause.
        let dt = if dt.is_finite() && dt <= HAND_IDLE * sr {
            dt
        } else {
            HAND_FIRST_MOVE * sr
        };
        if self.ramp_left <= 0.0 {
            self.ramp_left = HAND_CUSHION * sr;
        }
        self.ramp_left = (self.ramp_left + dt).min(HAND_MAX_LAG * sr);
        self.target = target;
        self.since_input = 0.0;
    }

    #[inline]
    fn tick(&mut self) -> f64 {
        if self.ramp_left > 1.0 {
            self.ramp += (self.target - self.ramp) / self.ramp_left;
            self.ramp_left -= 1.0;
        } else {
            self.ramp = self.target;
            self.ramp_left = 0.0;
        }
        self.p1 += (self.ramp - self.p1) * self.smooth;
        self.p2 += (self.p1 - self.p2) * self.smooth;
        self.p2
    }

    fn elapsed(&mut self, frames: usize) {
        self.since_input += frames as f64;
    }

    /// True once the hand is still and the play head has reached it.
    fn settled(&self, pos: f64) -> bool {
        self.ramp_left == 0.0
            && (self.p1 - self.target).abs() < 0.01
            && (pos - self.target).abs() < 0.01
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48_000.0;

    /// Feeds the hand inputs every `every` frames moving at `speed`,
    /// delivered in audio blocks of `block` frames after a pseudo-random
    /// delay of up to `jitter` frames, and returns the per-frame velocity.
    /// `timed` passes the sender's own spacing, like `ScratchTo` does.
    fn run(speed: f64, every: usize, block: usize, jitter: usize, timed: bool) -> Vec<f64> {
        let frames = 96_000;
        let mut h = Hand::new(SR);
        h.reset(0.0, 0.0);
        let mut rng = 12345u32;
        let mut sent: Vec<(usize, usize)> = (1..frames / every)
            .map(|k| {
                rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
                let delay = (rng >> 8) as usize % (jitter + 1);
                (k * every + delay, k * every)
            })
            .collect();
        // Messages arrive in order, even if late.
        for i in 1..sent.len() {
            sent[i].0 = sent[i].0.max(sent[i - 1].0);
        }
        let (mut pos, mut next, mut vel) = (0.0, 0, vec![]);
        for start in (0..frames).step_by(block) {
            while next < sent.len() && sent[next].0 <= start {
                let dt = timed.then_some(every as f64 / SR);
                h.input(sent[next].1 as f64 * speed, dt);
                next += 1;
            }
            for _ in 0..block {
                let p = h.tick();
                vel.push(p - pos);
                pos = p;
            }
            h.elapsed(block);
        }
        vel
    }

    fn ripple(vel: &[f64], speed: f64) -> f64 {
        let tail = &vel[vel.len() / 4..vel.len() * 3 / 4];
        tail.iter().map(|v| (v - speed).abs()).fold(0.0, f64::max) / speed.abs()
    }

    #[test]
    fn jog_ticks_become_steady_motion() {
        // FLX4-ish: a tick message every 2 ms, 512-frame audio blocks.
        let r = ripple(&run(1.0, 96, 512, 0, false), 1.0);
        assert!(r < 0.05, "speed wobbles by {:.1}%", r * 100.0);
    }

    #[test]
    fn mouse_moves_become_steady_motion() {
        // 60 Hz pointer events, up to 6 ms of IPC jitter, 441-frame blocks.
        let r = ripple(&run(-0.7, 800, 441, 288, true), -0.7);
        assert!(r < 0.1, "speed wobbles by {:.1}%", r * 100.0);
    }

    #[test]
    fn a_stopping_hand_never_runs_backwards() {
        let mut h = Hand::new(SR);
        h.reset(0.0, 1.0);
        let mut last = 0.0;
        for _ in 0..4800 {
            let p = h.tick();
            assert!(p >= last - 1e-9, "went backwards");
            last = p;
        }
        assert!(last > 0.0 && last < 0.01 * SR, "eased to a stop at {last}");
    }
}
