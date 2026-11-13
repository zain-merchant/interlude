use crate::dsp::{crossfader_gains, db_to_gain, Smoothed};
use crate::limiter::{Delay, Limiter};
use crate::NUM_DECKS;

/// Two-channel DJ mixer: channel faders, crossfader, master gain, a master
/// limiter, and a headphone cue bus with a cue/master blend.
pub(crate) struct Mixer {
    faders: [Smoothed; NUM_DECKS],
    pub pfl: [bool; NUM_DECKS],
    crossfader: Smoothed,
    cue_mix: Smoothed,
    master: Smoothed,
    limiter: Limiter,
    /// Holds the cue bus back by the limiter's look-ahead, so cue and
    /// master stay lined up in the headphones.
    cue_delay: Delay,
}

impl Mixer {
    pub fn new(sample_rate: f32) -> Self {
        let limiter = Limiter::new(sample_rate);
        let cue_delay = Delay::new(limiter.latency());
        Self {
            faders: [Smoothed::new(1.0, 10.0, sample_rate); NUM_DECKS],
            pfl: [false; NUM_DECKS],
            crossfader: Smoothed::new(0.0, 5.0, sample_rate),
            cue_mix: Smoothed::new(0.0, 10.0, sample_rate),
            master: Smoothed::new(1.0, 10.0, sample_rate),
            limiter,
            cue_delay,
        }
    }

    pub fn set_fader(&mut self, deck: usize, value: f32) {
        // Squared so the fader feels closer to a hardware audio-taper fader.
        let v = value.clamp(0.0, 1.0);
        self.faders[deck].set(v * v);
    }

    pub fn set_crossfader(&mut self, value: f32) {
        self.crossfader.set(value.clamp(-1.0, 1.0));
    }

    pub fn set_cue_mix(&mut self, value: f32) {
        self.cue_mix.set(value.clamp(0.0, 1.0));
    }

    /// The deepest master gain reduction since the last call, in dB.
    pub fn take_limiting_db(&mut self) -> f32 {
        self.limiter.take_reduction_db()
    }

    pub fn set_master_db(&mut self, db: f32) {
        self.master.set(db_to_gain(db.clamp(-60.0, 6.0)));
    }

    /// Mixes per-deck buffers (pre-fader) into `master` and `cue`
    /// (interleaved stereo, same length as each deck buffer). `sampler`
    /// joins the master after the crossfader, before master gain.
    pub fn mix(
        &mut self,
        decks: &[&[f32]; NUM_DECKS],
        sampler: &[f32],
        master: &mut [f32],
        cue: &mut [f32],
    ) {
        let any_pfl = self.pfl.iter().any(|&p| p);
        let (master, _) = master.as_chunks_mut::<2>();
        let (cue, _) = cue.as_chunks_mut::<2>();
        for (i, (m, c)) in master.iter_mut().zip(cue.iter_mut()).enumerate() {
            let (xa, xb) = crossfader_gains(self.crossfader.tick());
            let xf = [xa, xb];
            let (mut ml, mut mr, mut cl, mut cr) = (0.0, 0.0, 0.0, 0.0);
            for d in 0..NUM_DECKS {
                let (l, r) = (decks[d][i * 2], decks[d][i * 2 + 1]);
                let g = self.faders[d].tick() * xf[d];
                ml += l * g;
                mr += r * g;
                if self.pfl[d] {
                    cl += l;
                    cr += r;
                }
            }
            ml += sampler[i * 2];
            mr += sampler[i * 2 + 1];
            let mg = self.master.tick();
            let [ll, lr] = self.limiter.process(ml * mg, mr * mg);
            // The limiter keeps the master under full scale; the clamp
            // stays as a last line of defence.
            m[0] = ll.clamp(-1.0, 1.0);
            m[1] = lr.clamp(-1.0, 1.0);
            let [cl, cr] = self.cue_delay.process(cl, cr);

            // With nothing cued, headphones hear the master.
            let blend = if any_pfl { self.cue_mix.tick() } else { 1.0 };
            c[0] = (cl * (1.0 - blend) + m[0] * blend).clamp(-1.0, 1.0);
            c[1] = (cr * (1.0 - blend) + m[1] * blend).clamp(-1.0, 1.0);
        }
    }
}
