use std::sync::Arc;

use rtrb::{Consumer, Producer, RingBuffer};

use crate::deck::Deck;
use crate::dsp::{EQ_KILL_DB, EQ_MAX_DB};
use crate::fx::{ChannelFx, FX_DEFAULT_BEATS};
use crate::mixer::Mixer;
use crate::record::{new_recorder, RecordTap, Recorder};
use crate::sampler::{Sampler, SAMPLER_SLOTS};
use crate::{Command, RecordError, RecordingStatus, SharedState, Track, NUM_DECKS};

/// Largest block rendered in one pass. Bigger callbacks are split into
/// chunks of this size, so scratch buffers can be allocated up front.
pub const MAX_BLOCK_FRAMES: usize = 1024;

/// Trim range in dB.
pub const GAIN_MIN_DB: f32 = -24.0;
pub const GAIN_MAX_DB: f32 = 12.0;
/// Master gain range in dB.
pub const MASTER_MIN_DB: f32 = -60.0;
pub const MASTER_MAX_DB: f32 = 6.0;

const COMMAND_QUEUE: usize = 1024;
const GARBAGE_QUEUE: usize = 64;

/// The audio-thread half of the engine. See the crate docs.
pub struct Engine {
    decks: [Deck; NUM_DECKS],
    fx: [ChannelFx; NUM_DECKS],
    mixer: Mixer,
    sampler: Sampler,
    record: RecordTap,
    commands: Consumer<Command>,
    garbage: Producer<Arc<Track>>,
    shared: Arc<SharedState>,
    scratch: [Vec<f32>; NUM_DECKS],
    sampler_buf: Vec<f32>,
}

/// The control half of the engine: send commands, read state.
pub struct EngineHandle {
    commands: Producer<Command>,
    garbage: Consumer<Arc<Track>>,
    shared: Arc<SharedState>,
    recorder: Recorder,
}

/// Creates a connected engine (for the audio thread) and handle (for
/// everything else) running at `sample_rate`.
pub fn new_engine(sample_rate: u32) -> (Engine, EngineHandle) {
    let (cmd_tx, cmd_rx) = RingBuffer::new(COMMAND_QUEUE);
    let (gc_tx, gc_rx) = RingBuffer::new(GARBAGE_QUEUE);
    let shared = Arc::new(SharedState::default());
    shared
        .sample_rate
        .store(sample_rate, std::sync::atomic::Ordering::Relaxed);
    shared
        .quantize
        .store(true, std::sync::atomic::Ordering::Relaxed);
    for d in &shared.decks {
        d.rate.store(1.0);
        d.fader.store(1.0);
        d.fx_level.store(0.5);
        d.fx_beats.store(FX_DEFAULT_BEATS);
    }
    shared.sampler.level.store(crate::sampler::DEFAULT_LEVEL);
    let sr = sample_rate as f32;
    let (record, recorder) = new_recorder(sample_rate);
    let engine = Engine {
        decks: std::array::from_fn(|_| Deck::new(sr)),
        fx: std::array::from_fn(|_| ChannelFx::new(sr)),
        mixer: Mixer::new(sr),
        sampler: Sampler::new(sr),
        record,
        commands: cmd_rx,
        garbage: gc_tx,
        shared: shared.clone(),
        scratch: std::array::from_fn(|_| vec![0.0; MAX_BLOCK_FRAMES * 2]),
        sampler_buf: vec![0.0; MAX_BLOCK_FRAMES * 2],
    };
    let handle = EngineHandle {
        commands: cmd_tx,
        garbage: gc_rx,
        shared,
        recorder,
    };
    (engine, handle)
}

impl Engine {
    /// Renders audio. `master` and `cue` are interleaved stereo buffers of
    /// equal length. Real-time safe: no locks, no allocation, no I/O.
    pub fn process(&mut self, master: &mut [f32], cue: &mut [f32]) {
        debug_assert_eq!(master.len(), cue.len());
        self.drain_commands();
        let chunk = MAX_BLOCK_FRAMES * 2;
        for (m, c) in master.chunks_mut(chunk).zip(cue.chunks_mut(chunk)) {
            self.render_block(m, c);
        }
        self.publish();
    }

    fn render_block(&mut self, master: &mut [f32], cue: &mut [f32]) {
        let n = master.len();
        let mut peaks = [0f32; NUM_DECKS];
        for (d, deck) in self.decks.iter_mut().enumerate() {
            let buf = &mut self.scratch[d][..n];
            deck.render(buf);
            // Time effects to the tempo the deck plays at, not the hand on
            // the platter, so a scratch doesn't warp the echo.
            let bpm = deck.beat_info().map(|b| b.bpm * deck.rate.max(0.25));
            peaks[d] = self.fx[d].process(buf, bpm);
        }
        let sampler = &mut self.sampler_buf[..n];
        self.sampler.render(sampler);
        let [a, b] = &self.scratch;
        self.mixer.mix(&[&a[..n], &b[..n]], sampler, master, cue);
        self.record.push(master);
        for (d, p) in peaks.iter().enumerate() {
            let s = &self.shared.decks[d].peak;
            s.store(s.load().max(*p));
        }
    }

    fn drain_commands(&mut self) {
        while let Ok(cmd) = self.commands.pop() {
            self.apply(cmd);
        }
    }

    fn apply(&mut self, cmd: Command) {
        use Command::*;
        // Slip watches every deck command: what interrupts playback starts
        // the shadow play head, and the end of the last interruption goes
        // back to it. Going somewhere on purpose never starts one.
        let slip = cmd.deck().map(|d| {
            let deck = &self.decks[d.index()];
            let deliberate = matches!(
                cmd,
                Load { .. } | Eject { .. } | CuePress { .. } | Seek { .. } | RestoreCue { .. }
            );
            (d.index(), deck.pos, deck.live() && !deliberate)
        });
        self.apply_inner(cmd);
        if let Some((i, pos, live)) = slip {
            self.decks[i].update_slip(pos, live);
        }
    }

    fn apply_inner(&mut self, cmd: Command) {
        use Command::*;
        match cmd {
            Load { deck, track } => {
                let duration = track.duration_secs();
                let old = self.decks[deck.index()].load(Some(track));
                self.recycle(old);
                let s = &self.shared.decks[deck.index()];
                s.duration.store(duration);
                s.loaded.store(true, std::sync::atomic::Ordering::Relaxed);
                s.generation
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            Eject { deck } => {
                let old = self.decks[deck.index()].load(None);
                self.recycle(old);
                let s = &self.shared.decks[deck.index()];
                s.duration.store(0.0);
                s.loaded.store(false, std::sync::atomic::Ordering::Relaxed);
                s.generation
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            Play { deck } => self.decks[deck.index()].play(),
            Pause { deck } => self.decks[deck.index()].pause(),
            TogglePlay { deck } => {
                let d = &mut self.decks[deck.index()];
                if d.playing && !d.previewing {
                    d.pause()
                } else {
                    d.play()
                }
            }
            CuePress { deck } => self.decks[deck.index()].cue_press(),
            CueRelease { deck } => self.decks[deck.index()].cue_release(),
            HotCuePress { deck, index } => self.decks[deck.index()].hot_cue_press(index),
            HotCueRelease { deck, index } => self.decks[deck.index()].hot_cue_release(index),
            HotCueClear { deck, index } => self.decks[deck.index()].hot_cue_clear(index),
            LoopToggle { deck } => self.decks[deck.index()].loop_toggle(),
            BeatLoop { deck, beats } => self.decks[deck.index()].beat_loop_toggle(beats),
            LoopScale { deck, factor } => self.decks[deck.index()].loop_scale(factor),
            LoopIn { deck } => self.decks[deck.index()].loop_in_press(),
            LoopOut { deck } => self.decks[deck.index()].loop_out_press(),
            ReloopExit { deck } => self.decks[deck.index()].reloop_exit(),
            BeatJump { deck, beats } => self.decks[deck.index()].beat_jump(beats),
            Seek { deck, seconds } => self.decks[deck.index()].seek_secs(seconds),
            SetCue { deck, seconds } => self.decks[deck.index()].set_cue_secs(seconds),
            RestoreCue {
                deck,
                seconds,
                saved_loop,
            } => self.decks[deck.index()].restore_cue(seconds, saved_loop),
            SetBeatgrid { deck, grid } => self.decks[deck.index()].set_grid(grid),
            SetHotCue {
                deck,
                index,
                seconds,
            } => self.decks[deck.index()].set_hot_cue_secs(index, seconds),
            SetRate { deck, rate } => self.decks[deck.index()].rate = rate.clamp(0.0, 4.0),
            SetBend { deck, bend } => self.decks[deck.index()].bend = bend.clamp(-1.0, 1.0),
            SetKeylock { deck, on } => {
                self.decks[deck.index()].keylock = on;
                self.shared.decks[deck.index()]
                    .keylock
                    .store(on, std::sync::atomic::Ordering::Relaxed);
            }
            SetStems { deck, mask } => self.decks[deck.index()].set_stems(mask),
            SetSlip { deck, on } => self.decks[deck.index()].set_slip(on),
            SetQuantize { on } => {
                for d in &mut self.decks {
                    d.quantize = on;
                }
                self.shared
                    .quantize
                    .store(on, std::sync::atomic::Ordering::Relaxed);
            }
            SetHotCuePlays { on } => {
                for d in &mut self.decks {
                    d.hot_cue_plays = on;
                }
            }
            ScratchStart { deck } => self.decks[deck.index()].scratch_start(),
            ScratchEnd { deck } => self.decks[deck.index()].scratch_end(),
            ScratchTo {
                deck,
                seconds,
                since_last,
            } => self.decks[deck.index()].scratch_to(seconds, since_last),
            Jog { deck, seconds } => self.decks[deck.index()].jog(seconds),
            Sync { deck } => self.sync(deck.index()),
            SetAutoGain { deck, db } => self.decks[deck.index()].set_auto_gain_db(db),
            SetGain { deck, db } => {
                let db = db.clamp(GAIN_MIN_DB, GAIN_MAX_DB);
                self.decks[deck.index()].set_gain_db(db);
                self.shared.decks[deck.index()].gain_db.store(db);
            }
            SetEq { deck, band, db } => {
                let db = db.clamp(EQ_KILL_DB, EQ_MAX_DB);
                self.decks[deck.index()].set_eq_db(band, db);
                self.shared.decks[deck.index()].eq_db[band as usize].store(db);
            }
            SetFilter { deck, value } => {
                let value = value.clamp(-1.0, 1.0);
                self.fx[deck.index()].set_filter(value);
                self.shared.decks[deck.index()].filter.store(value);
            }
            SetFxKind { deck, kind } => {
                self.fx[deck.index()].set_kind(kind);
                self.shared.decks[deck.index()]
                    .fx_kind
                    .store(kind as u8, std::sync::atomic::Ordering::Relaxed);
            }
            SetFxOn { deck, on } => {
                self.fx[deck.index()].set_on(on);
                self.shared.decks[deck.index()]
                    .fx_on
                    .store(on, std::sync::atomic::Ordering::Relaxed);
            }
            SetFxLevel { deck, value } => {
                let value = value.clamp(0.0, 1.0);
                self.fx[deck.index()].set_level(value);
                self.shared.decks[deck.index()].fx_level.store(value);
            }
            SetFxBeats { deck, beats } => {
                let fx = &mut self.fx[deck.index()];
                fx.set_beats(beats);
                self.shared.decks[deck.index()].fx_beats.store(fx.beats());
            }
            SetFader { deck, value } => {
                let value = value.clamp(0.0, 1.0);
                self.mixer.set_fader(deck.index(), value);
                self.shared.decks[deck.index()].fader.store(value);
            }
            SetPfl { deck, on } => {
                self.mixer.pfl[deck.index()] = on;
                self.shared.decks[deck.index()]
                    .pfl
                    .store(on, std::sync::atomic::Ordering::Relaxed);
            }
            SetCrossfader { value } => {
                let value = value.clamp(-1.0, 1.0);
                self.mixer.set_crossfader(value);
                self.shared.crossfader.store(value);
            }
            SetCueMix { value } => {
                let value = value.clamp(0.0, 1.0);
                self.mixer.set_cue_mix(value);
                self.shared.cue_mix.store(value);
            }
            SetMasterGain { db } => {
                let db = db.clamp(MASTER_MIN_DB, MASTER_MAX_DB);
                self.mixer.set_master_db(db);
                self.shared.master_db.store(db);
            }
            LoadSample { slot, sample } => {
                if slot < SAMPLER_SLOTS {
                    let old = self.sampler.load(slot, Some(sample));
                    self.recycle(old);
                } else {
                    self.recycle(Some(sample));
                }
            }
            ClearSample { slot } => {
                let old = self.sampler.load(slot, None);
                self.recycle(old);
            }
            SamplePlay { slot } => self.sampler.play(slot),
            SampleStop { slot } => self.sampler.stop(slot),
            SetSamplerLevel { value } => {
                let value = value.clamp(0.0, 1.0);
                self.sampler.set_level(value);
                self.shared.sampler.level.store(value);
            }
        }
    }

    /// Matches deck `i` to the other deck: tempo first, then beat phase.
    /// Picks the half/double tempo match closest to the current speed, so a
    /// 87 BPM grid syncs to 174 BPM drum & bass without racing.
    fn sync(&mut self, i: usize) {
        let other = 1 - i;
        let (Some(me), Some(them)) = (self.decks[i].beat_info(), self.decks[other].beat_info())
        else {
            return;
        };
        let target_bpm = them.bpm * self.decks[other].rate;
        let candidates = [target_bpm, target_bpm * 2.0, target_bpm / 2.0];
        let rate = candidates
            .iter()
            .map(|t| t / me.bpm)
            .min_by(|a, b| (a - 1.0).abs().total_cmp(&(b - 1.0).abs()))
            .unwrap_or(1.0);
        self.decks[i].rate = rate.clamp(0.0, 4.0);

        // Phase: compare positions in units of the faster of the two beats.
        let my_beat = me.beat;
        let their_beat = them.beat;
        let ratio = (me.bpm * rate) / target_bpm; // ~0.5, 1 or 2
        let (mine, theirs, my_beats_per_unit) = if ratio > 1.5 {
            (my_beat, their_beat * 2.0, 1.0)
        } else if ratio < 0.75 {
            (my_beat * 2.0, their_beat, 0.5)
        } else {
            (my_beat, their_beat, 1.0)
        };
        let mut delta = theirs.fract() - mine.fract();
        delta -= delta.round(); // shortest way: within half a beat
        self.decks[i].shift_beats(delta * my_beats_per_unit);
    }

    /// Hands a dropped track back to the control side to be freed there.
    fn recycle(&mut self, track: Option<Arc<Track>>) {
        if let Some(t) = track {
            // If the queue is somehow full the Arc drops here instead: a rare
            // free on the audio thread is better than leaking a whole track.
            let _ = self.garbage.push(t);
        }
    }

    fn publish(&self) {
        use std::sync::atomic::Ordering::Relaxed;
        for (deck, s) in self.decks.iter().zip(&self.shared.decks) {
            let sr = deck.source_rate();
            s.position.store(deck.pos / sr);
            s.cue.store(deck.cue / sr);
            s.rate.store(deck.rate);
            s.speed.store(deck.speed());
            s.bpm.store(deck.grid().map_or(0.0, |g| g.bpm));
            s.key.store(
                crate::Key::code(deck.track.as_ref().and_then(|t| t.key)),
                Relaxed,
            );
            s.playing.store(deck.playing, Relaxed);
            let secs = |f: Option<f64>| f.map_or(-1.0, |f| f / sr);
            for (slot, cue) in s.hot_cues.iter().zip(deck.hot_cues) {
                slot.store(secs(cue));
            }
            s.loop_in.store(secs(deck.loop_in));
            s.loop_out.store(secs(deck.loop_out));
            s.looping.store(deck.looping, Relaxed);
            s.loop_beats.store(deck.loop_beats);
            s.stems.store(deck.stems, Relaxed);
            s.slip.store(deck.slip, Relaxed);
            s.slip_position.store(secs(deck.slip_pos));
        }
        for (i, s) in self.shared.sampler.slots.iter().enumerate() {
            let (loaded, playing, progress, duration) = self.sampler.slot_state(i);
            s.loaded.store(loaded, Relaxed);
            s.playing.store(playing, Relaxed);
            s.progress.store(progress);
            s.duration.store(duration);
        }
    }

    /// Updates the master peak meters. Called by the output with the final
    /// buffer it hands to the sound card.
    pub fn meter_master(&self, master: &[f32]) {
        let mut p = [0f32; 2];
        for f in master.as_chunks::<2>().0 {
            p[0] = p[0].max(f[0].abs());
            p[1] = p[1].max(f[1].abs());
        }
        for (s, v) in self.shared.master_peak.iter().zip(p) {
            s.store(s.load().max(v));
        }
    }

    pub fn shared(&self) -> &Arc<SharedState> {
        &self.shared
    }
}

impl EngineHandle {
    /// Queues a command for the audio thread. Fails only if the queue is
    /// full (1024 pending commands), which means the audio thread has stalled.
    pub fn send(&mut self, cmd: Command) -> Result<(), Command> {
        self.collect_garbage();
        self.commands
            .push(cmd)
            .map_err(|rtrb::PushError::Full(c)| c)
    }

    /// Frees tracks the audio thread has finished with. Called by `send`, and
    /// worth calling periodically (e.g. from the UI's state poll).
    pub fn collect_garbage(&mut self) {
        while self.garbage.pop().is_ok() {}
    }

    pub fn shared(&self) -> &Arc<SharedState> {
        &self.shared
    }

    /// Starts recording the master output to a 24-bit WAV file at `path`,
    /// creating its folder if needed. Fails if a recording is running or
    /// the file can't be created.
    pub fn start_recording(&mut self, path: &std::path::Path) -> Result<(), RecordError> {
        self.recorder.start(path)
    }

    /// Stops recording and finishes the file.
    pub fn stop_recording(&mut self) -> Result<RecordingStatus, RecordError> {
        self.recorder.stop()
    }

    /// The running (or last) recording. If writing failed, the recording
    /// has stopped and `error` says why.
    pub fn recording(&mut self) -> RecordingStatus {
        self.recorder.status()
    }

    /// Reads and resets the peak meters, for a UI polling at frame rate.
    pub fn take_peaks(&self) -> ([f32; NUM_DECKS], [f32; 2]) {
        let decks = std::array::from_fn(|i| {
            let p = self.shared.decks[i].peak.load();
            self.shared.decks[i].peak.store(0.0);
            p
        });
        let master = std::array::from_fn(|i| {
            let p = self.shared.master_peak[i].load();
            self.shared.master_peak[i].store(0.0);
            p
        });
        (decks, master)
    }
}
