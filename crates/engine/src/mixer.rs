use crate::dsp::{crossfader_gains, db_to_gain, Smoothed};
use crate::NUM_DECKS;

/// Two-channel DJ mixer: channel faders, crossfader, master gain, and a
/// headphone cue bus with a cue/master blend.
pub(crate) struct Mixer {
    faders: [Smoothed; NUM_DECKS],
    pub pfl: [bool; NUM_DECKS],
    crossfader: Smoothed,
    cue_mix: Smoothed,
    master: Smoothed,
}

impl Mixer {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            faders: [Smoothed::new(1.0, 10.0, sample_rate); NUM_DECKS],
            pfl: [false; NUM_DECKS],
            crossfader: Smoothed::new(0.0, 5.0, sample_rate),
            cue_mix: Smoothed::new(0.0, 10.0, sample_rate),
            master: Smoothed::new(1.0, 10.0, sample_rate),
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

    pub fn set_master_db(&mut self, db: f32) {
        self.master.set(db_to_gain(db.clamp(-60.0, 6.0)));
    }

    /// Mixes per-deck buffers (pre-fader) into `master` and `cue`
    /// (interleaved stereo, same length as each deck buffer).
    pub fn mix(&mut self, decks: &[&[f32]; NUM_DECKS], master: &mut [f32], cue: &mut [f32]) {
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
            let mg = self.master.tick();
            // Hard clip as a last line of defence; a proper limiter comes later.
            m[0] = (ml * mg).clamp(-1.0, 1.0);
            m[1] = (mr * mg).clamp(-1.0, 1.0);

            // With nothing cued, headphones hear the master.
            let blend = if any_pfl { self.cue_mix.tick() } else { 1.0 };
            c[0] = (cl * (1.0 - blend) + m[0] * blend).clamp(-1.0, 1.0);
            c[1] = (cr * (1.0 - blend) + m[1] * blend).clamp(-1.0, 1.0);
        }
    }
}
