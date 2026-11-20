//! Channel effects: a filter knob per channel and one beat effect unit per
//! deck, the set every DJ app and mixer ships.
//!
//! * **Filter**: one knob, centre is off. Left sweeps a low-pass down, right
//!   sweeps a high-pass up (Pioneer's Color FX filter, Serato's and
//!   Traktor's filter knob).
//! * **Beat FX**: echo, reverb, flanger and phaser, timed in beats from the
//!   deck's tempo, with an on switch and a level/depth knob.
//!
//! Echo and reverb are sends: turning them off stops new sound going in and
//! lets the tail ring out, as on a DJM mixer. Flanger and phaser are inserts
//! and fade out at once.
//!
//! Everything here is real-time safe. Buffers are allocated in `new`, on the
//! control side, before the engine reaches the audio thread.

use std::f32::consts::PI;

use crate::dsp::Smoothed;

/// Beat lengths the beat FX steps through, shortest first.
pub const FX_BEATS: [f32; 8] = [0.125, 0.25, 0.5, 0.75, 1.0, 2.0, 4.0, 8.0];
/// Default beat length: one beat.
pub const FX_DEFAULT_BEATS: f32 = 1.0;
/// Tempo used to time effects on a deck with no beatgrid.
const FALLBACK_BPM: f64 = 120.0;
/// Longest echo, in seconds.
const MAX_ECHO_SECS: f32 = 4.0;
/// Below this filter knob position the filter is bypassed.
const FILTER_DEAD_ZONE: f32 = 0.02;
/// Filter coefficients are recomputed every this many frames.
const FILTER_UPDATE: usize = 16;

/// A beat effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "camelCase"))]
pub enum FxKind {
    #[default]
    Echo = 0,
    Reverb = 1,
    Flanger = 2,
    Phaser = 3,
}

impl FxKind {
    pub const ALL: [FxKind; 4] = [
        FxKind::Echo,
        FxKind::Reverb,
        FxKind::Flanger,
        FxKind::Phaser,
    ];

    pub fn from_index(i: u8) -> FxKind {
        Self::ALL.get(i as usize).copied().unwrap_or_default()
    }
}

/// Topology-preserving state-variable filter (Simper/Zavalishin), which
/// stays clean while its cutoff is swept quickly.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct Svf {
    a1: f32,
    a2: f32,
    a3: f32,
    k: f32,
    ic1: [f32; 2],
    ic2: [f32; 2],
}

impl Svf {
    pub(crate) fn set(&mut self, freq: f32, q: f32, sample_rate: f32) {
        let freq = freq.clamp(10.0, sample_rate * 0.45);
        let g = (PI * freq / sample_rate).tan();
        self.k = 1.0 / q;
        self.a1 = 1.0 / (1.0 + g * (g + self.k));
        self.a2 = g * self.a1;
        self.a3 = g * self.a2;
    }

    /// Returns (low-pass, high-pass) for one channel.
    #[inline]
    pub(crate) fn process(&mut self, ch: usize, x: f32) -> (f32, f32) {
        let v3 = x - self.ic2[ch];
        let v1 = self.a1 * self.ic1[ch] + self.a2 * v3;
        let v2 = self.ic2[ch] + self.a2 * self.ic1[ch] + self.a3 * v3;
        self.ic1[ch] = 2.0 * v1 - self.ic1[ch];
        self.ic2[ch] = 2.0 * v2 - self.ic2[ch];
        (v2, x - self.k * v1 - v2)
    }
}

/// The channel filter knob.
#[derive(Debug, Clone)]
struct Filter {
    svf: Svf,
    knob: Smoothed,
    countdown: usize,
    amount: f32,
    high: bool,
    sample_rate: f32,
}

impl Filter {
    fn new(sample_rate: f32) -> Self {
        let mut svf = Svf::default();
        svf.set(20_000.0, 0.8, sample_rate);
        Self {
            svf,
            knob: Smoothed::new(0.0, 30.0, sample_rate),
            countdown: 0,
            amount: 0.0,
            high: false,
            sample_rate,
        }
    }

    fn update(&mut self, knob: f32) {
        let t = ((knob.abs() - FILTER_DEAD_ZONE) / (1.0 - FILTER_DEAD_ZONE)).clamp(0.0, 1.0);
        self.high = knob > 0.0;
        // Exponential sweeps so the knob feels even across its travel. The
        // ends stop short of silence, like a mixer's filter.
        let freq = if self.high {
            20.0 * (8_000.0f32 / 20.0).powf(t)
        } else {
            20_000.0 * (60.0f32 / 20_000.0).powf(t)
        };
        // A little resonance as the filter closes, like a DJM filter.
        self.svf.set(freq, 0.75 + 0.6 * t, self.sample_rate);
        // Fade the filter in over the first few percent of travel, so
        // leaving the centre never clicks.
        self.amount = (t * 25.0).min(1.0);
    }

    #[inline]
    fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        if self.countdown == 0 {
            let k = self.knob.tick();
            self.update(k);
            self.countdown = FILTER_UPDATE;
        } else {
            self.knob.tick();
        }
        self.countdown -= 1;
        let pick = |(lp, hp): (f32, f32), high| if high { hp } else { lp };
        let fl = pick(self.svf.process(0, l), self.high);
        let fr = pick(self.svf.process(1, r), self.high);
        let a = self.amount;
        (l + (fl - l) * a, r + (fr - r) * a)
    }
}

/// A stereo delay line with fractional reads.
#[derive(Debug, Clone)]
pub(crate) struct DelayLine {
    buf: [Vec<f32>; 2],
    write: usize,
}

impl DelayLine {
    fn new(len: usize) -> Self {
        Self {
            buf: [vec![0.0; len.max(4)], vec![0.0; len.max(4)]],
            write: 0,
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.buf[0].len()
    }

    /// Reads `delay` frames behind the write head (linear interpolation).
    #[inline]
    fn read(&self, ch: usize, delay: f32) -> f32 {
        let len = self.len();
        let delay = delay.clamp(1.0, (len - 2) as f32);
        let pos = self.write as f32 + len as f32 - delay;
        let i = pos as usize;
        let t = pos - i as f32;
        let a = self.buf[ch][i % len];
        let b = self.buf[ch][(i + 1) % len];
        a + (b - a) * t
    }

    #[inline]
    fn write(&mut self, l: f32, r: f32) {
        self.buf[0][self.write] = l;
        self.buf[1][self.write] = r;
        self.write = (self.write + 1) % self.len();
    }

    fn clear(&mut self) {
        for b in &mut self.buf {
            b.fill(0.0);
        }
    }
}

/// Tape-style echo: the repeats darken and fade.
#[derive(Debug, Clone)]
pub(crate) struct Echo {
    pub(crate) line: DelayLine,
    /// Delay time in frames, smoothed so tempo and beat changes glide.
    pub(crate) time: Smoothed,
    tone: [f32; 2],
    /// How much of each repeat goes round again.
    pub(crate) feedback: f32,
}

impl Echo {
    const FEEDBACK: f32 = 0.55;
    /// One-pole low-pass coefficient in the feedback path.
    const DAMP: f32 = 0.35;

    pub(crate) fn new(sample_rate: f32) -> Self {
        Self {
            line: DelayLine::new((MAX_ECHO_SECS * sample_rate) as usize + 4),
            time: Smoothed::new(sample_rate * 0.5, 60.0, sample_rate),
            tone: [0.0; 2],
            feedback: Self::FEEDBACK,
        }
    }

    #[inline]
    pub(crate) fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let d = self.time.tick();
        let out = [self.line.read(0, d), self.line.read(1, d)];
        for (t, o) in self.tone.iter_mut().zip(out) {
            *t += (o - *t) * (1.0 - Self::DAMP);
        }
        self.line.write(
            l + self.tone[0] * self.feedback,
            r + self.tone[1] * self.feedback,
        );
        (out[0], out[1])
    }

    pub(crate) fn clear(&mut self) {
        self.line.clear();
        self.tone = [0.0; 2];
    }
}

/// Lowpass-feedback comb filter for the reverb.
#[derive(Debug, Clone)]
struct Comb {
    buf: Vec<f32>,
    i: usize,
    store: f32,
}

impl Comb {
    fn new(len: usize) -> Self {
        Self {
            buf: vec![0.0; len.max(1)],
            i: 0,
            store: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x: f32, feedback: f32, damp: f32) -> f32 {
        let y = self.buf[self.i];
        self.store = y * (1.0 - damp) + self.store * damp;
        self.buf[self.i] = x + self.store * feedback;
        self.i = (self.i + 1) % self.buf.len();
        y
    }
}

#[derive(Debug, Clone)]
struct Allpass {
    buf: Vec<f32>,
    i: usize,
}

impl Allpass {
    fn new(len: usize) -> Self {
        Self {
            buf: vec![0.0; len.max(1)],
            i: 0,
        }
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let b = self.buf[self.i];
        self.buf[self.i] = x + b * 0.5;
        self.i = (self.i + 1) % self.buf.len();
        b - x
    }
}

/// Schroeder-Moorer reverb with the well-known Freeverb tunings. The beat
/// length sets the decay: longer beats, bigger room.
#[derive(Debug, Clone)]
pub(crate) struct Reverb {
    combs: [Vec<Comb>; 2],
    allpasses: [Vec<Allpass>; 2],
    feedback: Smoothed,
}

impl Reverb {
    const COMBS: [usize; 8] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const ALLPASSES: [usize; 4] = [556, 441, 341, 225];
    const SPREAD: usize = 23;
    const DAMP: f32 = 0.3;
    const INPUT: f32 = 0.015;
    const WET: f32 = 3.0;

    pub(crate) fn new(sample_rate: f32) -> Self {
        let scale = sample_rate / 44_100.0;
        let len = |n: usize, ch: usize| ((n + ch * Self::SPREAD) as f32 * scale) as usize;
        Self {
            combs: std::array::from_fn(|ch| {
                Self::COMBS.iter().map(|&n| Comb::new(len(n, ch))).collect()
            }),
            allpasses: std::array::from_fn(|ch| {
                Self::ALLPASSES
                    .iter()
                    .map(|&n| Allpass::new(len(n, ch)))
                    .collect()
            }),
            feedback: Smoothed::new(0.84, 200.0, sample_rate),
        }
    }

    /// Maps a beat length to the comb feedback (room size).
    pub(crate) fn set_beats(&mut self, beats: f32) {
        let t = (beats.max(0.125).log2() + 3.0) / 6.0; // 1/8 beat → 0, 8 beats → 1
        self.feedback.set(0.70 + 0.27 * t.clamp(0.0, 1.0));
    }

    #[inline]
    pub(crate) fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let fb = self.feedback.tick();
        let input = (l + r) * Self::INPUT;
        let mut out = [0.0f32; 2];
        for ((o, combs), allpasses) in out.iter_mut().zip(&mut self.combs).zip(&mut self.allpasses)
        {
            let mut acc = 0.0;
            for c in combs {
                acc += c.process(input, fb, Self::DAMP);
            }
            for a in allpasses {
                acc = a.process(acc);
            }
            *o = acc * Self::WET;
        }
        (out[0], out[1])
    }

    pub(crate) fn clear(&mut self) {
        for c in self.combs.iter_mut().flatten() {
            c.buf.fill(0.0);
            c.store = 0.0;
        }
        for a in self.allpasses.iter_mut().flatten() {
            a.buf.fill(0.0);
        }
    }
}

/// Jet-plane sweep: a short delay modulated over the beat length.
#[derive(Debug, Clone)]
pub(crate) struct Flanger {
    line: DelayLine,
    sample_rate: f32,
}

impl Flanger {
    const MIN_MS: f32 = 0.6;
    const MAX_MS: f32 = 6.0;
    const FEEDBACK: f32 = 0.6;

    pub(crate) fn new(sample_rate: f32) -> Self {
        Self {
            line: DelayLine::new((Self::MAX_MS * 0.002 * sample_rate) as usize + 8),
            sample_rate,
        }
    }

    #[inline]
    pub(crate) fn process(&mut self, l: f32, r: f32, lfo: f32) -> (f32, f32) {
        let ms = Self::MIN_MS + (Self::MAX_MS - Self::MIN_MS) * lfo;
        let d = ms * 0.001 * self.sample_rate;
        let out = [self.line.read(0, d), self.line.read(1, d)];
        self.line
            .write(l + out[0] * Self::FEEDBACK, r + out[1] * Self::FEEDBACK);
        (out[0], out[1])
    }

    pub(crate) fn clear(&mut self) {
        self.line.clear();
    }
}

/// Four-stage phaser swept over the beat length.
#[derive(Debug, Clone, Copy, Default)]
struct Phaser {
    z: [[f32; Self::STAGES]; 2],
    last: [f32; 2],
    coeff: f32,
    countdown: usize,
}

impl Phaser {
    const STAGES: usize = 4;
    const FEEDBACK: f32 = 0.5;
    const MIN_HZ: f32 = 250.0;
    const MAX_HZ: f32 = 3_500.0;

    #[inline]
    fn process(&mut self, l: f32, r: f32, lfo: f32, sample_rate: f32) -> (f32, f32) {
        if self.countdown == 0 {
            let f = Self::MIN_HZ * (Self::MAX_HZ / Self::MIN_HZ).powf(lfo);
            let t = (PI * f / sample_rate).tan();
            self.coeff = (t - 1.0) / (t + 1.0);
            self.countdown = FILTER_UPDATE;
        }
        self.countdown -= 1;
        let a = self.coeff;
        let mut out = [l, r];
        for (ch, o) in out.iter_mut().enumerate() {
            let mut x = *o + self.last[ch] * Self::FEEDBACK;
            for z in &mut self.z[ch] {
                let y = a * x + *z;
                *z = x - a * y;
                x = y;
            }
            self.last[ch] = x;
            *o = x;
        }
        (out[0], out[1])
    }

    fn clear(&mut self) {
        *self = Self::default();
    }
}

/// One deck's effect chain: filter, then beat FX. Runs post-EQ, pre-fader.
#[derive(Debug, Clone)]
pub(crate) struct ChannelFx {
    filter: Filter,
    kind: FxKind,
    /// Effect waiting for the current one to fade out.
    next_kind: Option<FxKind>,
    on: bool,
    beats: f32,
    /// Sound going into the effect: follows `on`.
    send: Smoothed,
    /// Level/depth knob.
    level: Smoothed,
    /// Fades the wet signal out while the effect type changes.
    switch: Smoothed,
    lfo_phase: f64,
    echo: Echo,
    reverb: Reverb,
    flanger: Flanger,
    phaser: Phaser,
    sample_rate: f32,
}

impl ChannelFx {
    pub fn new(sample_rate: f32) -> Self {
        let mut fx = Self {
            filter: Filter::new(sample_rate),
            kind: FxKind::Echo,
            next_kind: None,
            on: false,
            beats: FX_DEFAULT_BEATS,
            send: Smoothed::new(0.0, 8.0, sample_rate),
            level: Smoothed::new(0.5, 20.0, sample_rate),
            switch: Smoothed::new(1.0, 4.0, sample_rate),
            lfo_phase: 0.0,
            echo: Echo::new(sample_rate),
            reverb: Reverb::new(sample_rate),
            flanger: Flanger::new(sample_rate),
            phaser: Phaser::default(),
            sample_rate,
        };
        fx.reverb.set_beats(fx.beats);
        fx
    }

    /// Filter knob: -1.0 full low-pass, 0.0 off, 1.0 full high-pass.
    pub fn set_filter(&mut self, value: f32) {
        self.filter.knob.set(value.clamp(-1.0, 1.0));
    }

    pub fn set_kind(&mut self, kind: FxKind) {
        if kind != self.kind {
            self.next_kind = Some(kind);
            self.switch.set(0.0);
        } else {
            self.next_kind = None;
            self.switch.set(1.0);
        }
    }

    pub fn set_on(&mut self, on: bool) {
        self.on = on;
        self.send.set(if on { 1.0 } else { 0.0 });
    }

    pub fn set_level(&mut self, value: f32) {
        self.level.set(value.clamp(0.0, 1.0));
    }

    pub fn beats(&self) -> f32 {
        self.beats
    }

    pub fn set_beats(&mut self, beats: f32) {
        self.beats = beats.clamp(FX_BEATS[0], FX_BEATS[FX_BEATS.len() - 1]);
        self.reverb.set_beats(self.beats);
    }

    /// Processes a block in place. `bpm` is the deck's current tempo, or
    /// `None` if it has no beatgrid. Returns the block's peak level.
    pub fn process(&mut self, buf: &mut [f32], bpm: Option<f64>) -> f32 {
        let bpm = bpm.filter(|b| *b > 1.0).unwrap_or(FALLBACK_BPM);
        let beat_secs = 60.0 / bpm;
        let period = beat_secs * self.beats as f64;
        let echo_frames = (period as f32 * self.sample_rate)
            .min(self.echo.line.len() as f32 - 4.0)
            .max(1.0);
        self.echo.time.set(echo_frames);
        // Flanger and phaser sweep over at least a beat, so short beat
        // settings don't turn into vibrato.
        let lfo_step = 1.0 / (period.max(beat_secs) * self.sample_rate as f64);

        let mut peak = 0f32;
        for f in buf.as_chunks_mut::<2>().0 {
            let (mut l, mut r) = self.filter.process(f[0], f[1]);

            let send = self.send.tick();
            let level = self.level.tick();
            let switch = self.switch.tick();
            if let Some(k) = self.next_kind {
                if switch < 1e-3 {
                    self.change_kind(k);
                }
            }
            // Triangle LFO, 0..1.
            self.lfo_phase = (self.lfo_phase + lfo_step).fract();
            let lfo = (1.0 - (2.0 * self.lfo_phase - 1.0).abs()) as f32;

            match self.kind {
                FxKind::Echo => {
                    let (wl, wr) = self.echo.process(l * send, r * send);
                    let g = level * switch;
                    l += wl * g;
                    r += wr * g;
                }
                FxKind::Reverb => {
                    let (wl, wr) = self.reverb.process(l * send, r * send);
                    let g = level * switch;
                    l += wl * g;
                    r += wr * g;
                }
                FxKind::Flanger | FxKind::Phaser => {
                    let (wl, wr) = if self.kind == FxKind::Flanger {
                        self.flanger.process(l, r, lfo)
                    } else {
                        self.phaser.process(l, r, lfo, self.sample_rate)
                    };
                    // Half dry, half swept: the classic deep notches.
                    let mix = 0.5 * level * send * switch;
                    l += (wl - l) * mix;
                    r += (wr - r) * mix;
                }
            }
            f[0] = l;
            f[1] = r;
            peak = peak.max(l.abs()).max(r.abs());
        }
        peak
    }

    /// Swaps effects once the old one has faded out. Clearing the new one's
    /// buffers is a memset, not an allocation.
    fn change_kind(&mut self, kind: FxKind) {
        match kind {
            FxKind::Echo => self.echo.clear(),
            FxKind::Reverb => self.reverb.clear(),
            FxKind::Flanger => self.flanger.clear(),
            FxKind::Phaser => self.phaser.clear(),
        }
        self.kind = kind;
        self.next_kind = None;
        self.switch.set(1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn sine(freq: f32, n: usize) -> Vec<f32> {
        (0..n)
            .flat_map(|i| {
                let v = 0.5 * (2.0 * PI * freq * i as f32 / SR).sin();
                [v, v]
            })
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    fn run(fx: &mut ChannelFx, buf: &mut [f32]) {
        for c in buf.chunks_mut(512) {
            fx.process(c, Some(120.0));
        }
    }

    /// Output RMS / input RMS for a sine through the filter at `knob`.
    fn filter_gain(freq: f32, knob: f32) -> f32 {
        let mut fx = ChannelFx::new(SR);
        fx.set_filter(knob);
        let mut warm = vec![0.0; 9_600];
        run(&mut fx, &mut warm);
        let input = sine(freq, 48_000);
        let mut out = input.clone();
        run(&mut fx, &mut out);
        rms(&out[48_000..]) / rms(&input[48_000..])
    }

    #[test]
    fn filter_centre_is_transparent() {
        let input = sine(1_000.0, 4_800);
        let mut out = input.clone();
        let mut fx = ChannelFx::new(SR);
        run(&mut fx, &mut out);
        assert_eq!(input, out);
    }

    #[test]
    fn filter_left_cuts_highs_right_cuts_lows() {
        assert!(filter_gain(8_000.0, -0.8) < 0.05);
        assert!(filter_gain(60.0, -0.8) > 0.7);
        assert!(filter_gain(60.0, 0.8) < 0.05);
        assert!(filter_gain(8_000.0, 0.8) > 0.7);
    }

    #[test]
    fn echo_repeats_after_one_beat() {
        let mut fx = ChannelFx::new(SR);
        fx.set_level(1.0);
        fx.set_on(true);
        let mut warm = vec![0.0; 4_800];
        run(&mut fx, &mut warm);
        // A 10 ms click, then silence; at 120 BPM one beat is 0.5 s.
        let mut buf = vec![0.0; 48_000 * 2];
        for v in &mut buf[..960] {
            *v = 0.5;
        }
        run(&mut fx, &mut buf);
        let beat = 24_000 * 2;
        assert!(rms(&buf[beat..beat + 960]) > 0.2, "no echo at one beat");
        assert!(rms(&buf[beat / 2..beat / 2 + 960]) < 0.01, "echo too early");
    }

    #[test]
    fn echo_tail_rings_out_after_switching_off() {
        let mut fx = ChannelFx::new(SR);
        fx.set_level(1.0);
        fx.set_on(true);
        let mut buf = sine(440.0, 24_000);
        run(&mut fx, &mut buf);
        fx.set_on(false);
        // Silence in: the tail still comes out for a while.
        let mut tail = vec![0.0; 48_000];
        run(&mut fx, &mut tail);
        assert!(rms(&tail) > 0.05, "echo tail was cut");
    }

    #[test]
    fn every_effect_stays_finite_and_bounded() {
        for kind in FxKind::ALL {
            for beats in FX_BEATS {
                let mut fx = ChannelFx::new(SR);
                fx.set_kind(kind);
                fx.set_beats(beats);
                fx.set_level(1.0);
                fx.set_on(true);
                fx.set_filter(-0.5);
                let mut buf = sine(220.0, 96_000);
                run(&mut fx, &mut buf);
                let peak = buf.iter().fold(0f32, |p, v| p.max(v.abs()));
                assert!(
                    peak.is_finite() && peak < 4.0,
                    "{kind:?} at {beats} beats peaked at {peak}"
                );
            }
        }
    }

    #[test]
    fn flanger_changes_the_sound_and_off_restores_it() {
        let mut fx = ChannelFx::new(SR);
        fx.set_kind(FxKind::Flanger);
        fx.set_level(1.0);
        fx.set_on(true);
        let input = sine(3_000.0, 48_000);
        let mut out = input.clone();
        run(&mut fx, &mut out);
        let diff: Vec<f32> = out.iter().zip(&input).map(|(a, b)| a - b).collect();
        assert!(rms(&diff) > 0.05);
        fx.set_on(false);
        let mut settle = vec![0.0; 19_200];
        run(&mut fx, &mut settle);
        let mut out = input.clone();
        run(&mut fx, &mut out);
        assert_eq!(out, input);
    }

    #[test]
    fn switching_effect_takes_effect() {
        let mut fx = ChannelFx::new(SR);
        fx.set_kind(FxKind::Reverb);
        let mut buf = vec![0.0; 4_800];
        run(&mut fx, &mut buf);
        assert_eq!(fx.kind, FxKind::Reverb);
    }
}
