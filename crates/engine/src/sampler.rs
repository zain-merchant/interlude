//! A one-shot sampler: a few slots of short audio, each played from the
//! top when its pad is pressed, straight into the master after the
//! crossfader. Slots share one level.

use std::sync::Arc;

use crate::dsp::Smoothed;
use crate::Track;

/// Number of sampler slots, one per FLX4 pad.
pub const SAMPLER_SLOTS: usize = 8;

/// Longest sample a slot takes, in seconds. Samples live in memory like
/// tracks; this keeps eight of them small.
pub const MAX_SAMPLE_SECS: f64 = 60.0;

/// A stop or retrigger fades the old sound out over this long, so it
/// doesn't click.
const FADE_MS: f32 = 5.0;

#[derive(Debug, Clone, Copy, Default)]
struct Voice {
    /// Position in source frames.
    pos: f64,
    /// Gain while fading out, 1.0 otherwise.
    gain: f32,
    on: bool,
}

#[derive(Default)]
struct Slot {
    sample: Option<Arc<Track>>,
    voice: Voice,
    /// The previous sound fading out after a stop or retrigger.
    tail: Voice,
}

pub(crate) struct Sampler {
    slots: [Slot; SAMPLER_SLOTS],
    level: Smoothed,
    out_rate: f64,
    /// Gain lost per frame while fading out.
    fade_step: f32,
}

impl Sampler {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            slots: Default::default(),
            level: Smoothed::new(DEFAULT_LEVEL * DEFAULT_LEVEL, 10.0, sample_rate),
            out_rate: sample_rate as f64,
            fade_step: 1.0 / (FADE_MS / 1000.0 * sample_rate).max(1.0),
        }
    }

    /// Puts a sample in a slot, stopping what it played. Returns the
    /// sample it held, to be freed off the audio thread.
    pub fn load(&mut self, slot: usize, sample: Option<Arc<Track>>) -> Option<Arc<Track>> {
        let s = self.slots.get_mut(slot)?;
        s.voice = Voice::default();
        s.tail = Voice::default();
        std::mem::replace(&mut s.sample, sample)
    }

    /// Plays a slot from the top. If it's already playing, the old sound
    /// fades out under the new one.
    pub fn play(&mut self, slot: usize) {
        let Some(s) = self.slots.get_mut(slot) else {
            return;
        };
        if s.sample.is_none() {
            return;
        }
        if s.voice.on {
            s.tail = s.voice;
        }
        s.voice = Voice {
            pos: 0.0,
            gain: 1.0,
            on: true,
        };
    }

    /// Stops a slot with a short fade.
    pub fn stop(&mut self, slot: usize) {
        if let Some(s) = self.slots.get_mut(slot) {
            if s.voice.on {
                s.tail = s.voice;
                s.voice.on = false;
            }
        }
    }

    pub fn set_level(&mut self, level: f32) {
        // Squared, like the channel faders.
        let v = level.clamp(0.0, 1.0);
        self.level.set(v * v);
    }

    /// Renders every playing slot into `out` (interleaved stereo).
    pub fn render(&mut self, out: &mut [f32]) {
        out.fill(0.0);
        let mut any = false;
        for s in &mut self.slots {
            let Slot {
                sample: Some(sample),
                voice,
                tail,
            } = s
            else {
                continue;
            };
            let step = sample.sample_rate as f64 / self.out_rate;
            any |= voice.on || tail.on;
            add_voice(voice, &sample.samples, step, None, out);
            add_voice(tail, &sample.samples, step, Some(self.fade_step), out);
        }
        // The level ramps whether or not anything plays, so it never jumps.
        for f in out.as_chunks_mut::<2>().0 {
            let g = self.level.tick();
            if any {
                f[0] *= g;
                f[1] *= g;
            }
        }
    }

    /// Whether each slot holds a sample and is playing, and how far
    /// through it is (0.0..=1.0).
    pub fn slot_state(&self, slot: usize) -> (bool, bool, f64, f64) {
        let s = &self.slots[slot];
        match &s.sample {
            Some(t) => {
                let frames = (t.samples.len() / 2).max(1) as f64;
                (
                    true,
                    s.voice.on,
                    (s.voice.pos / frames).clamp(0.0, 1.0),
                    t.duration_secs(),
                )
            }
            None => (false, false, 0.0, 0.0),
        }
    }
}

/// Sampler level when the app starts, 0.0..=1.0.
pub const DEFAULT_LEVEL: f32 = 0.8;

/// Mixes one voice into `out`, reading `samples` at `step` source frames
/// per output frame with linear interpolation. A fading voice loses
/// `fade` of gain per frame and stops at silence.
fn add_voice(v: &mut Voice, samples: &[f32], step: f64, fade: Option<f32>, out: &mut [f32]) {
    if !v.on {
        return;
    }
    let frames = samples.len() / 2;
    for f in out.as_chunks_mut::<2>().0 {
        let i = v.pos as usize;
        if i + 1 >= frames {
            v.on = false;
            return;
        }
        let t = v.pos.fract() as f32;
        let (a, b) = (&samples[i * 2..i * 2 + 2], &samples[i * 2 + 2..i * 2 + 4]);
        f[0] += (a[0] + (b[0] - a[0]) * t) * v.gain;
        f[1] += (a[1] + (b[1] - a[1]) * t) * v.gain;
        v.pos += step;
        if let Some(fade) = fade {
            v.gain -= fade;
            if v.gain <= 0.0 {
                v.on = false;
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(frames: usize, value: f32) -> Arc<Track> {
        Arc::new(Track {
            path: None,
            sample_rate: 48_000,
            samples: vec![value; frames * 2],
            waveform: Default::default(),
            beatgrid: None,
            key: None,
            loudness: Default::default(),
        })
    }

    fn sampler() -> Sampler {
        let mut s = Sampler::new(48_000.0);
        s.level = Smoothed::new(1.0, 10.0, 48_000.0);
        s
    }

    #[test]
    fn plays_once_then_stops() {
        let mut s = sampler();
        s.load(0, Some(sample(100, 0.5)));
        let mut out = vec![0.0; 512];
        s.render(&mut out);
        assert!(out.iter().all(|&x| x == 0.0), "silent until pressed");
        s.play(0);
        s.render(&mut out);
        assert_eq!(out[0], 0.5);
        assert_eq!(out[2 * 98], 0.5);
        assert_eq!(out[2 * 150], 0.0, "stops at the end");
        assert!(!s.slot_state(0).1);
    }

    #[test]
    fn slots_mix_together() {
        let mut s = sampler();
        s.load(0, Some(sample(1000, 0.25)));
        s.load(7, Some(sample(1000, 0.5)));
        s.play(0);
        s.play(7);
        s.play(3); // empty: nothing
        let mut out = vec![0.0; 64];
        s.render(&mut out);
        assert_eq!(out[10], 0.75);
        assert!(s.slot_state(7).1 && !s.slot_state(3).0);
    }

    #[test]
    fn stop_and_retrigger_fade_without_a_jump() {
        let mut s = sampler();
        s.load(0, Some(sample(48_000, 0.5)));
        s.play(0);
        let mut out = vec![0.0; 2 * 300];
        s.render(&mut out);
        s.stop(0);
        s.render(&mut out);
        // Fades from full to silence over 5 ms (240 frames).
        assert!(out[0] > 0.49 && out[0] <= 0.5);
        assert!(out[2 * 120] > 0.2 && out[2 * 120] < 0.3);
        assert_eq!(out[2 * 250], 0.0);
        assert!(!s.slot_state(0).1);

        // Retrigger: the new sound starts at once while the old fades.
        s.play(0);
        s.render(&mut out);
        s.play(0);
        s.render(&mut out);
        assert!(out[0] > 0.99, "old and new overlap: {}", out[0]);
        assert_eq!(out[2 * 250], 0.5);
        assert!(s.slot_state(0).2 > 0.0);
    }

    #[test]
    fn resamples_to_the_output_rate() {
        let mut s = Sampler::new(96_000.0);
        s.level = Smoothed::new(1.0, 10.0, 96_000.0);
        s.load(1, Some(sample(100, 0.5)));
        s.play(1);
        let mut out = vec![0.0; 2 * 400];
        s.render(&mut out);
        // 100 frames at 48 kHz last about 200 frames at 96 kHz.
        let heard = out.chunks(2).filter(|f| f[0] != 0.0).count();
        assert!((197..=200).contains(&heard), "{heard}");
    }

    #[test]
    fn loading_replaces_and_returns_the_old_sample() {
        let mut s = sampler();
        let a = sample(10, 0.1);
        assert!(s.load(2, Some(a.clone())).is_none());
        s.play(2);
        let old = s.load(2, None).expect("old sample back");
        assert!(Arc::ptr_eq(&old, &a));
        assert_eq!(s.slot_state(2), (false, false, 0.0, 0.0));
        assert!(s.load(SAMPLER_SLOTS, None).is_none());
    }
}
