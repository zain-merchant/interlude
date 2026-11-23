//! Pad FX: hold a pad and the effect plays, let go and it stops, as on
//! rekordbox's PAD FX pads. One effect per deck at a time; pressing another
//! pad switches to it.
//!
//! The effects work on the deck's output after the track is rendered, so
//! the track itself keeps playing underneath: a roll or a brake lets go
//! back into the track where it would have been, like slip mode.
//!
//! Each deck keeps the last few seconds of its own output in a history
//! buffer. Rolls repeat a slice of it lined up with the beatgrid, and brake
//! and spin back play it slower or backwards. Echo and reverb tails ring
//! out after the pad is let go.
//!
//! Real-time safe: every buffer is allocated in `new`.

use crate::dsp::Smoothed;
use crate::fx::{Echo, Flanger, Reverb, Svf};

/// Tempo used to time effects on a deck with no beatgrid.
const FALLBACK_BPM: f64 = 120.0;
/// Seconds of output kept for rolls, brake and spin back.
const HISTORY_SECS: f32 = 8.0;
/// How long echo and reverb tails ring out after the pad is let go.
const TAIL_SECS: f32 = 6.0;
/// Filter coefficients are recomputed every this many frames.
const SWEEP_UPDATE: u64 = 16;

/// A pad effect. The first eight are PAD FX1's pads, the last eight PAD
/// FX2's, in pad order (top row 1 to 4, bottom row 5 to 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub enum PadFx {
    /// Half-beat echo.
    Echo = 0,
    Reverb = 1,
    /// Cuts the sound in and out on quarter beats.
    Trans = 2,
    /// Repeats the last quarter beat.
    Roll = 3,
    /// High-pass filter rising over four beats.
    HighSweep = 4,
    /// Bit crusher.
    Crush = 5,
    /// Turntable brake: slows to a stop over two beats.
    Brake = 6,
    /// Backspin.
    SpinBack = 7,
    /// One-beat roll.
    Roll1 = 8,
    /// Half-beat roll.
    RollHalf = 9,
    /// Eighth-beat roll.
    RollEighth = 10,
    /// Sixteenth-beat roll.
    RollSixteenth = 11,
    /// Three-quarter-beat echo with long repeats.
    DubEcho = 12,
    /// Cuts in and out on eighth beats.
    TransEighth = 13,
    /// Low-pass filter closing over four beats.
    LowSweep = 14,
    Flanger = 15,
}

/// How an effect sounds, and how long its step is in beats.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Sound {
    Echo { beats: f64, feedback: f32 },
    Reverb,
    Trans { beats: f64 },
    Roll { beats: f64 },
    Sweep { high: bool },
    Crush,
    Brake,
    SpinBack,
    Flanger,
}

impl PadFx {
    pub const ALL: [PadFx; 16] = [
        PadFx::Echo,
        PadFx::Reverb,
        PadFx::Trans,
        PadFx::Roll,
        PadFx::HighSweep,
        PadFx::Crush,
        PadFx::Brake,
        PadFx::SpinBack,
        PadFx::Roll1,
        PadFx::RollHalf,
        PadFx::RollEighth,
        PadFx::RollSixteenth,
        PadFx::DubEcho,
        PadFx::TransEighth,
        PadFx::LowSweep,
        PadFx::Flanger,
    ];

    pub fn from_index(i: usize) -> Option<PadFx> {
        Self::ALL.get(i).copied()
    }

    fn sound(self) -> Sound {
        use PadFx::*;
        match self {
            Echo => Sound::Echo {
                beats: 0.5,
                feedback: 0.55,
            },
            DubEcho => Sound::Echo {
                beats: 0.75,
                feedback: 0.72,
            },
            Reverb => Sound::Reverb,
            Trans => Sound::Trans { beats: 0.25 },
            TransEighth => Sound::Trans { beats: 0.125 },
            Roll => Sound::Roll { beats: 0.25 },
            Roll1 => Sound::Roll { beats: 1.0 },
            RollHalf => Sound::Roll { beats: 0.5 },
            RollEighth => Sound::Roll { beats: 0.125 },
            RollSixteenth => Sound::Roll { beats: 0.0625 },
            HighSweep => Sound::Sweep { high: true },
            LowSweep => Sound::Sweep { high: false },
            Crush => Sound::Crush,
            Brake => Sound::Brake,
            SpinBack => Sound::SpinBack,
            Flanger => Sound::Flanger,
        }
    }
}

/// Last few seconds of a deck's output, indexed by absolute frame.
#[derive(Debug, Clone)]
struct History {
    buf: [Vec<f32>; 2],
    /// Absolute index of the next frame to be written.
    next: u64,
}

impl History {
    fn new(len: usize) -> Self {
        Self {
            buf: [vec![0.0; len.max(16)], vec![0.0; len.max(16)]],
            next: 0,
        }
    }

    fn len(&self) -> usize {
        self.buf[0].len()
    }

    #[inline]
    fn push(&mut self, l: f32, r: f32) {
        let i = (self.next % self.len() as u64) as usize;
        self.buf[0][i] = l;
        self.buf[1][i] = r;
        self.next += 1;
    }

    /// Reads at an absolute (fractional) frame, which must be one already
    /// written and still kept.
    #[inline]
    fn read(&self, pos: f64) -> (f32, f32) {
        let len = self.len() as u64;
        let pos = pos.max(0.0);
        let i = pos as u64;
        let t = (pos - i as f64) as f32;
        let (a, b) = (
            (i % len) as usize,
            ((i + 1).min(self.next - 1) % len) as usize,
        );
        let at = |ch: usize| self.buf[ch][a] + (self.buf[ch][b] - self.buf[ch][a]) * t;
        (at(0), at(1))
    }
}

/// One deck's pad FX.
#[derive(Debug, Clone)]
pub(crate) struct PadFxUnit {
    /// The effect playing, or ringing out.
    active: Option<PadFx>,
    /// Its pad is still held.
    held: bool,
    /// Wet share for effects that replace the sound.
    mix: Smoothed,
    /// Sound going into echo and reverb.
    send: Smoothed,
    /// Frames since the pad was pressed.
    t: u64,
    /// Frames of echo or reverb tail left after letting go.
    tail: u64,
    history: History,
    // Rolls: the slice starts at absolute frame `roll_start`, is
    // `roll_len` frames long, and the press landed `roll_offset` into it.
    roll_start: f64,
    roll_len: f64,
    roll_offset: f64,
    /// Brake and spin back: where in the history playback is.
    read_pos: f64,
    gate: Smoothed,
    svf: Svf,
    crush_hold: [f32; 2],
    echo: Echo,
    reverb: Reverb,
    flanger: Flanger,
    sample_rate: f32,
}

impl PadFxUnit {
    pub fn new(sample_rate: f32) -> Self {
        let mut reverb = Reverb::new(sample_rate);
        reverb.set_beats(4.0);
        Self {
            active: None,
            held: false,
            mix: Smoothed::new(0.0, 3.0, sample_rate),
            send: Smoothed::new(0.0, 6.0, sample_rate),
            t: 0,
            tail: 0,
            history: History::new((HISTORY_SECS * sample_rate) as usize),
            roll_start: 0.0,
            roll_len: 1.0,
            roll_offset: 0.0,
            read_pos: 0.0,
            gate: Smoothed::new(1.0, 1.5, sample_rate),
            svf: Svf::default(),
            crush_hold: [0.0; 2],
            echo: Echo::new(sample_rate),
            reverb,
            flanger: Flanger::new(sample_rate),
            sample_rate,
        }
    }

    /// The effect whose pad is held, for pad lights and the screen.
    pub fn held(&self) -> Option<PadFx> {
        self.active.filter(|_| self.held)
    }

    /// Starts `fx`. The rest is set up on the next block, which knows the
    /// tempo and where the beat is.
    pub fn press(&mut self, fx: PadFx) {
        if self.active != Some(fx) {
            self.echo.clear();
            self.reverb.clear();
            self.flanger.clear();
            self.svf = Svf::default();
            // Start the new effect from the dry sound, so switching
            // effects doesn't jump.
            self.mix = Smoothed::new(0.0, 3.0, self.sample_rate);
        }
        self.active = Some(fx);
        self.held = true;
        self.t = 0;
        self.tail = 0;
        self.roll_len = 0.0; // set up on the first frame
        self.read_pos = self.history.next as f64;
        self.mix.set(1.0);
        self.send.set(1.0);
    }

    /// Lets go of `fx`. Letting go of a pad that isn't the one playing
    /// does nothing, so two pads held and one let go keeps the other.
    pub fn release(&mut self, fx: PadFx) {
        if self.active == Some(fx) && self.held {
            self.held = false;
            self.mix.set(0.0);
            self.send.set(0.0);
            self.tail = (TAIL_SECS * self.sample_rate) as u64;
        }
    }

    /// Lets go of whatever is playing, e.g. when the track changes.
    pub fn release_all(&mut self) {
        if let Some(fx) = self.active {
            self.release(fx);
        }
    }

    /// Processes a block in place. `bpm` is the tempo the deck plays at and
    /// `beat` where it is on its beatgrid, both `None` with no beatgrid.
    pub fn process(&mut self, buf: &mut [f32], bpm: Option<f64>, beat: Option<f64>) {
        let Some(fx) = self.active else {
            for f in buf.as_chunks::<2>().0 {
                self.history.push(f[0], f[1]);
            }
            return;
        };
        let bpm = bpm.filter(|b| *b > 1.0).unwrap_or(FALLBACK_BPM);
        let beat_frames = 60.0 / bpm * self.sample_rate as f64;
        let sound = fx.sound();
        let max_lag = (self.history.len() - 4) as f64;

        if let Sound::Echo { beats, feedback } = sound {
            let frames = (beats * beat_frames) as f32;
            self.echo
                .time
                .set(frames.clamp(1.0, self.echo.line.len() as f32 - 4.0));
            self.echo.feedback = feedback;
            if self.t == 0 {
                self.echo.time.snap();
            }
        }

        for (i, f) in buf.as_chunks_mut::<2>().0.iter_mut().enumerate() {
            let (l, r) = (f[0], f[1]);
            self.history.push(l, r);
            let now = self.history.next - 1;
            let beat_now = beat.map(|b| b + i as f64 / beat_frames);
            let mix = self.mix.tick();
            let send = self.send.tick();

            let (ol, or) = match sound {
                Sound::Echo { .. } => {
                    let (wl, wr) = self.echo.process(l * send, r * send);
                    (l + wl * 0.8, r + wr * 0.8)
                }
                Sound::Reverb => {
                    let (wl, wr) = self.reverb.process(l * send, r * send);
                    (l + wl * 0.7, r + wr * 0.7)
                }
                _ => {
                    let (wl, wr) = self.insert(sound, l, r, now, beat_now, beat_frames, max_lag);
                    (l + (wl - l) * mix, r + (wr - r) * mix)
                }
            };
            f[0] = ol;
            f[1] = or;
            self.t += 1;
            if !self.held {
                self.tail = self.tail.saturating_sub(1);
            }
        }

        // Done once the pad is up and the effect has faded or rung out.
        if !self.held {
            let sends = matches!(sound, Sound::Echo { .. } | Sound::Reverb);
            let done = if sends {
                self.tail == 0
            } else {
                self.mix.target() == 0.0 && self.mix.tick() == 0.0
            };
            if done {
                self.active = None;
            }
        }
    }

    /// One frame of an effect that replaces the sound. `now` is the
    /// absolute index of this frame in the history.
    #[allow(clippy::too_many_arguments)]
    #[inline]
    fn insert(
        &mut self,
        sound: Sound,
        l: f32,
        r: f32,
        now: u64,
        beat: Option<f64>,
        beat_frames: f64,
        max_lag: f64,
    ) -> (f32, f32) {
        match sound {
            Sound::Roll { beats } => {
                if self.roll_len == 0.0 {
                    let len = (beats * beat_frames).clamp(64.0, max_lag / 2.0);
                    // Line the slice up with the beatgrid: if the press
                    // came a third of the way into a quarter beat, the
                    // slice started a third of a slice ago.
                    let offset = beat.map_or(0.0, |b| (b / beats).rem_euclid(1.0) * len);
                    self.roll_len = len;
                    self.roll_offset = offset.min(len - 1.0);
                    self.roll_start = now as f64 - self.roll_offset;
                }
                let len = self.roll_len;
                let pos = (self.t as f64 + self.roll_offset) % len;
                let first = self.t as f64 + self.roll_offset < len;
                let (wl, wr) = self.history.read(self.roll_start + pos);
                // Short fades at each end of the slice, so repeats don't
                // click. The first pass is the live sound, so it only
                // fades out.
                let edge = (len / 4.0).min(96.0);
                let fade_in = if first { 1.0 } else { (pos / edge).min(1.0) };
                let g = fade_in.min(((len - pos) / edge).min(1.0)) as f32;
                (wl * g, wr * g)
            }
            Sound::Trans { beats } => {
                let phase = match beat {
                    Some(b) => (b / beats).rem_euclid(1.0),
                    None => (self.t as f64 / (beats * beat_frames)).rem_euclid(1.0),
                };
                self.gate.set(if phase < 0.5 { 1.0 } else { 0.0 });
                let g = self.gate.tick();
                (l * g, r * g)
            }
            Sound::Sweep { high } => {
                if self.t.is_multiple_of(SWEEP_UPDATE) {
                    let u = (self.t as f64 / (4.0 * beat_frames)).min(1.0) as f32;
                    let freq = if high {
                        30.0 * (6_000.0f32 / 30.0).powf(u)
                    } else {
                        18_000.0 * (250.0f32 / 18_000.0).powf(u)
                    };
                    self.svf.set(freq, 0.9 + 0.8 * u, self.sample_rate);
                }
                let pick = |(lp, hp): (f32, f32)| if high { hp } else { lp };
                (pick(self.svf.process(0, l)), pick(self.svf.process(1, r)))
            }
            Sound::Crush => {
                const STEP: u64 = 6;
                const LEVELS: f32 = 12.0;
                if self.t.is_multiple_of(STEP) {
                    self.crush_hold = [l, r].map(|x| (x * LEVELS).round() / LEVELS);
                }
                (self.crush_hold[0], self.crush_hold[1])
            }
            Sound::Brake | Sound::SpinBack => {
                let brake = sound == Sound::Brake;
                let secs = if brake { 2.0 } else { 1.5 } * beat_frames / self.sample_rate as f64;
                let len = secs.clamp(0.3, 2.5) * self.sample_rate as f64;
                let u = (self.t as f64 / len).min(1.0);
                // Brake: slows from full speed to a stop. Spin back: thrown
                // backwards at three times speed, slowing as it goes.
                let (speed, gain) = if brake {
                    (1.0 - u, (1.0 - u).sqrt())
                } else {
                    (-3.0 * (1.0 - u), (1.0 - u).powf(1.5))
                };
                let lag = now as f64 - self.read_pos;
                if u >= 1.0 || lag > max_lag {
                    return (0.0, 0.0);
                }
                let (wl, wr) = self.history.read(self.read_pos);
                self.read_pos += speed;
                (wl * gain as f32, wr * gain as f32)
            }
            Sound::Flanger => {
                let period = 2.0 * beat_frames;
                let phase = (self.t as f64 / period).fract();
                let lfo = (1.0 - (2.0 * phase - 1.0).abs()) as f32;
                let (wl, wr) = self.flanger.process(l, r, lfo);
                (0.5 * (l + wl), 0.5 * (r + wr))
            }
            Sound::Echo { .. } | Sound::Reverb => (l, r),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const SR: f32 = 48_000.0;
    /// 120 BPM: a beat is 24,000 frames.
    const BEAT: usize = 24_000;

    fn sine(freq: f32, frames: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let v = 0.5 * (2.0 * PI * freq * i as f32 / SR).sin();
                [v, v]
            })
            .collect()
    }

    /// A ramp, so every frame is different and repeats are easy to spot.
    fn ramp(frames: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let v = (i % 100_000) as f32 / 100_000.0;
                [v, v]
            })
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    /// Runs `buf` through in 512-frame blocks, at 120 BPM from beat 0.
    fn run(fx: &mut PadFxUnit, buf: &mut [f32], start_frame: usize) {
        let mut frame = start_frame;
        for c in buf.chunks_mut(1024) {
            let beat = frame as f64 / BEAT as f64;
            fx.process(c, Some(120.0), Some(beat));
            frame += c.len() / 2;
        }
    }

    #[test]
    fn idle_is_transparent() {
        let mut fx = PadFxUnit::new(SR);
        let input = sine(440.0, 9_600);
        let mut out = input.clone();
        run(&mut fx, &mut out, 0);
        assert_eq!(out, input);
    }

    #[test]
    fn every_effect_is_bounded_and_lets_go_cleanly() {
        for pad in PadFx::ALL {
            let mut fx = PadFxUnit::new(SR);
            let mut warm = sine(220.0, BEAT);
            run(&mut fx, &mut warm, 0);
            fx.press(pad);
            let mut held = sine(220.0, 2 * BEAT);
            run(&mut fx, &mut held, BEAT);
            let peak = held.iter().fold(0f32, |p, v| p.max(v.abs()));
            assert!(peak.is_finite() && peak < 3.0, "{pad:?} peaked at {peak}");
            assert_eq!(fx.held(), Some(pad));
            fx.release(pad);
            assert_eq!(fx.held(), None);
            // Tails ring out, then the deck is back to the dry sound.
            let mut after = sine(220.0, 8 * BEAT * 2);
            run(&mut fx, &mut after, 3 * BEAT);
            assert!(fx.active.is_none(), "{pad:?} never finished");
            let input = sine(220.0, 1_000);
            let mut out = input.clone();
            run(&mut fx, &mut out, 0);
            assert_eq!(out, input, "{pad:?} still changes the sound");
        }
    }

    #[test]
    fn roll_repeats_its_slice_on_the_grid() {
        let mut fx = PadFxUnit::new(SR);
        let input = ramp(4 * BEAT);
        let mut out = input.clone();
        // Press a tenth of the way into beat 2, with a quarter-beat roll.
        let press = 2 * BEAT + BEAT / 10;
        run(&mut fx, &mut out[..press * 2], 0);
        fx.press(PadFx::Roll);
        let rest = &mut out[press * 2..];
        run(&mut fx, rest, press);
        let slice = BEAT / 4;
        let grid = 2 * BEAT + (BEAT / 10 / slice) * slice;
        // After the mix has faded in, a frame mid-slice two slices later
        // repeats the frame from the slice that started on the grid.
        let probe = grid + 2 * slice + slice / 2;
        let src = grid + slice / 2;
        assert!((out[probe * 2] - input[src * 2]).abs() < 1e-3);
        // And it's the live sound until then.
        assert!((out[(press + 200) * 2] - input[(press + 200) * 2]).abs() < 1e-3);
    }

    #[test]
    fn trans_cuts_on_quarter_beats() {
        let mut fx = PadFxUnit::new(SR);
        fx.press(PadFx::Trans);
        let mut out = sine(440.0, BEAT);
        run(&mut fx, &mut out, 0);
        let q = BEAT / 4;
        let on = &out[(q / 8) * 2..(q / 2 - q / 8) * 2];
        let off = &out[(q / 2 + q / 8) * 2..(q - q / 8) * 2];
        assert!(rms(on) > 0.3, "open half is quiet");
        assert!(rms(off) < 0.01, "closed half lets sound through");
    }

    #[test]
    fn brake_comes_to_a_stop() {
        let mut fx = PadFxUnit::new(SR);
        let mut warm = sine(440.0, BEAT);
        run(&mut fx, &mut warm, 0);
        fx.press(PadFx::Brake);
        let mut out = sine(440.0, 3 * BEAT);
        run(&mut fx, &mut out, BEAT);
        // Two beats to stop, then silence while held.
        assert!(rms(&out[..BEAT / 4]) > 0.2);
        assert!(rms(&out[(2 * BEAT + 500) * 2..]) < 1e-3);
    }

    #[test]
    fn echo_rings_out_after_letting_go() {
        let mut fx = PadFxUnit::new(SR);
        fx.press(PadFx::Echo);
        let mut buf = sine(440.0, BEAT);
        run(&mut fx, &mut buf, 0);
        fx.release(PadFx::Echo);
        let mut tail = vec![0.0; BEAT * 2];
        run(&mut fx, &mut tail, BEAT);
        assert!(rms(&tail) > 0.05, "echo tail was cut");
    }

    #[test]
    fn letting_go_of_another_pad_keeps_the_held_one() {
        let mut fx = PadFxUnit::new(SR);
        fx.press(PadFx::Roll);
        fx.press(PadFx::Crush);
        fx.release(PadFx::Roll);
        assert_eq!(fx.held(), Some(PadFx::Crush));
    }
}
