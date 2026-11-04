//! Headless engine tests: render audio offline and check what comes out.

use std::sync::Arc;

use dj_engine::{new_engine, Command, DeckId, Engine, EngineHandle, FxKind, SavedCues, Track};

const SR: u32 = 48_000;

fn sine(freq: f32, secs: f32, amp: f32) -> Vec<f32> {
    let n = (SR as f32 * secs) as usize;
    (0..n)
        .flat_map(|i| {
            let v = amp * (2.0 * std::f32::consts::PI * freq * i as f32 / SR as f32).sin();
            [v, v]
        })
        .collect()
}

fn setup() -> (Engine, EngineHandle) {
    new_engine(SR)
}

/// Renders `secs` of audio and returns the master output.
fn render(engine: &mut Engine, secs: f32) -> Vec<f32> {
    let n = (SR as f32 * secs) as usize * 2;
    let mut master = vec![0.0; n];
    let mut cue = vec![0.0; n];
    // Use an awkward block size, like real sound cards sometimes do.
    for (m, c) in master.chunks_mut(2 * 441).zip(cue.chunks_mut(2 * 441)) {
        engine.process(m, c);
    }
    master
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
}

fn load(h: &mut EngineHandle, deck: DeckId, samples: Vec<f32>) {
    h.send(Command::Load {
        deck,
        track: Arc::new(Track::from_stereo(samples, SR)),
    })
    .unwrap();
}

#[test]
fn silent_until_play() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 2.0, 0.5));
    assert_eq!(rms(&render(&mut e, 0.2)), 0.0);
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let out = render(&mut e, 0.5);
    assert!(rms(&out[4800..]) > 0.2, "deck A should be audible");
}

#[test]
fn crossfader_selects_decks() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 3.0, 0.5));
    load(&mut h, DeckId::B, sine(440.0, 3.0, 0.5));
    h.send(Command::Play { deck: DeckId::B }).unwrap();

    h.send(Command::SetCrossfader { value: -1.0 }).unwrap();
    let out = render(&mut e, 0.5);
    assert!(
        rms(&out[out.len() / 2..]) < 1e-3,
        "B should be silent with the crossfader on A"
    );

    h.send(Command::SetCrossfader { value: 1.0 }).unwrap();
    let out = render(&mut e, 0.5);
    assert!(
        rms(&out[out.len() / 2..]) > 0.3,
        "B should be loud with the crossfader on B"
    );
}

#[test]
fn channel_fader_mutes() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 2.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    h.send(Command::SetFader {
        deck: DeckId::A,
        value: 0.0,
    })
    .unwrap();
    let out = render(&mut e, 0.5);
    assert!(rms(&out[out.len() / 2..]) < 1e-3);
}

#[test]
fn rate_changes_speed() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::SetRate {
        deck: DeckId::A,
        rate: 1.5,
    })
    .unwrap();
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 2.0);
    let pos = h.shared().deck(0).position;
    assert!((pos - 3.0).abs() < 0.01, "expected 3.0 s, got {pos}");
}

#[test]
fn resamples_tracks_at_other_rates() {
    let (mut e, mut h) = setup();
    let n = 44_100 * 4;
    let samples: Vec<f32> = (0..n).flat_map(|_| [0.1, 0.1]).collect();
    h.send(Command::Load {
        deck: DeckId::A,
        track: Arc::new(Track::from_stereo(samples, 44_100)),
    })
    .unwrap();
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 1.0);
    let pos = h.shared().deck(0).position;
    assert!(
        (pos - 1.0).abs() < 0.01,
        "a 44.1 kHz track should still play in real time, got {pos}"
    );
}

#[test]
fn stops_at_end_of_track() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 0.5, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 1.0);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!((d.position - 0.5).abs() < 0.001);
}

#[test]
fn cue_button_behaves_like_a_cdj() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let a = DeckId::A;

    // Paused at 2 s: pressing cue sets the cue point there and previews.
    h.send(Command::Seek {
        deck: a,
        seconds: 2.0,
    })
    .unwrap();
    h.send(Command::CuePress { deck: a }).unwrap();
    render(&mut e, 0.5);
    let d = h.shared().deck(0);
    assert!(d.playing, "should preview while held");
    assert!((d.cue - 2.0).abs() < 1e-3);

    // Releasing returns to the cue point and stops.
    h.send(Command::CueRelease { deck: a }).unwrap();
    render(&mut e, 0.1);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!((d.position - 2.0).abs() < 1e-3);

    // Holding cue then pressing play keeps playing after release.
    h.send(Command::CuePress { deck: a }).unwrap();
    h.send(Command::Play { deck: a }).unwrap();
    h.send(Command::CueRelease { deck: a }).unwrap();
    render(&mut e, 1.0);
    let d = h.shared().deck(0);
    assert!(d.playing);
    assert!(d.position > 2.9);

    // Cue while playing jumps back to the cue point and stops.
    h.send(Command::CuePress { deck: a }).unwrap();
    h.send(Command::CueRelease { deck: a }).unwrap();
    render(&mut e, 0.1);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!((d.position - 2.0).abs() < 1e-3);
}

#[test]
fn headphones_hear_cued_deck_only() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 2.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    h.send(Command::SetFader {
        deck: DeckId::A,
        value: 0.0,
    })
    .unwrap();
    h.send(Command::SetPfl {
        deck: DeckId::A,
        on: true,
    })
    .unwrap();
    h.send(Command::SetCueMix { value: 0.0 }).unwrap();

    let n = SR as usize;
    let (mut master, mut cue) = (vec![0.0; n], vec![0.0; n]);
    e.process(&mut master, &mut cue);
    assert!(
        rms(&master[n / 2..]) < 1e-3,
        "master should be silent with the fader down"
    );
    assert!(
        rms(&cue[n / 2..]) > 0.2,
        "headphones should hear the cued deck"
    );
}

#[test]
fn ejected_tracks_are_freed_off_the_audio_thread() {
    let (mut e, mut h) = setup();
    let track = Arc::new(Track::from_stereo(sine(440.0, 1.0, 0.5), SR));
    h.send(Command::Load {
        deck: DeckId::A,
        track: track.clone(),
    })
    .unwrap();
    render(&mut e, 0.01);
    assert_eq!(Arc::strong_count(&track), 2);
    h.send(Command::Eject { deck: DeckId::A }).unwrap();
    render(&mut e, 0.01);
    // The engine has let go but the Arc is waiting in the garbage queue...
    assert_eq!(Arc::strong_count(&track), 2);
    // ...until the control side collects it.
    h.collect_garbage();
    assert_eq!(Arc::strong_count(&track), 1);
}

#[test]
fn decodes_wav_files() {
    let dir = std::env::temp_dir().join(format!("dj-engine-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("tone.wav");
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 44_100,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut w = hound::WavWriter::create(&path, spec).unwrap();
    for i in 0..44_100 {
        let v = (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 44_100.0).sin() * 0.5;
        w.write_sample((v * i16::MAX as f32) as i16).unwrap();
    }
    w.finalize().unwrap();

    let t = Track::load(&path).unwrap();
    assert_eq!(t.sample_rate, 44_100);
    assert_eq!(t.frames(), 44_100);
    assert!((t.duration_secs() - 1.0).abs() < 1e-6);
    assert_eq!(
        t.samples[200], t.samples[201],
        "mono should be copied to both channels"
    );
    assert_eq!(t.title(), "tone");
    assert!(!t.waveform.bins.is_empty());
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn analysis_while_decoding_matches_analysis_after() {
    // A file is analyzed in pieces as it decodes; the result must be the
    // same as analyzing the whole track at once.
    let dir = std::env::temp_dir().join(format!("dj-engine-stream-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("drums.wav");
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: SR,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut w = hound::WavWriter::create(&path, spec).unwrap();
    // Drums over an A minor chord, so there's a tempo and a key to find.
    for (i, v) in drums(124.0, 30.0, 0.1).into_iter().enumerate() {
        let t = (i / 2) as f32 / SR as f32;
        let chord: f32 = [220.0, 261.63, 329.63]
            .iter()
            .map(|f| (2.0 * std::f32::consts::PI * f * t).sin() * 0.1)
            .sum();
        w.write_sample(v + chord).unwrap();
    }
    w.finalize().unwrap();

    let streamed = Track::load(&path).unwrap();
    let whole = Track::from_stereo(streamed.samples.clone(), streamed.sample_rate);
    assert!(streamed.beatgrid.is_some() && streamed.key.is_some());
    assert_eq!(streamed.waveform.bins, whole.waveform.bins);
    assert_eq!(streamed.beatgrid, whole.beatgrid);
    assert_eq!(streamed.key, whole.key);
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn missing_file_is_an_error_not_a_panic() {
    assert!(Track::load("/definitely/not/here.mp3").is_err());
}

/// Kick drum on every beat starting at `offset` seconds, plus off-beat hats.
fn drums(bpm: f64, secs: f64, offset: f64) -> Vec<f32> {
    let n = (SR as f64 * secs) as usize;
    let beat = 60.0 / bpm;
    (0..n)
        .flat_map(|i| {
            let t = i as f64 / SR as f64;
            let mut v = 0.0;
            if t >= offset {
                let bt = (t - offset) % beat;
                let f = 50.0 + 100.0 * (-bt * 30.0).exp();
                v += 0.7 * (2.0 * std::f64::consts::PI * f * bt).sin() * (-bt * 8.0).exp();
                let ht = (t - offset + beat / 2.0) % beat;
                v += 0.1 * (2.0 * std::f64::consts::PI * 9_000.0 * t).sin() * (-ht * 60.0).exp();
            }
            [v as f32, v as f32]
        })
        .collect()
}

#[test]
fn loaded_tracks_get_a_beatgrid() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, drums(126.0, 30.0, 0.2));
    render(&mut e, 0.01);
    let bpm = h.shared().deck(0).bpm;
    assert!((bpm - 126.0).abs() < 0.02, "got {bpm}");
}

#[test]
fn sync_matches_tempo_and_beat_phase() {
    let (mut e, mut h) = setup();
    let (a_bpm, a_off) = (128.0, 0.10);
    let (b_bpm, b_off) = (122.0, 0.31);
    load(&mut h, DeckId::A, drums(a_bpm, 40.0, a_off));
    load(&mut h, DeckId::B, drums(b_bpm, 40.0, b_off));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 3.0);
    h.send(Command::Seek {
        deck: DeckId::B,
        seconds: 5.4,
    })
    .unwrap();
    h.send(Command::Play { deck: DeckId::B }).unwrap();
    h.send(Command::Sync { deck: DeckId::B }).unwrap();
    render(&mut e, 4.0);

    let (a, b) = (h.shared().deck(0), h.shared().deck(1));
    assert!(
        (b.speed * b.bpm - a.speed * a.bpm).abs() < 0.01,
        "tempo {} vs {}",
        b.speed * b.bpm,
        a.speed * a.bpm
    );

    // Both decks should be the same fraction of the way through a beat.
    let phase = |pos: f64, bpm: f64, off: f64| ((pos - off) * bpm / 60.0).rem_euclid(1.0);
    let pa = phase(a.position, a_bpm, a_off);
    let pb = phase(b.position, b_bpm, b_off);
    let mut d = (pa - pb).abs();
    d = d.min(1.0 - d);
    // Within 2% of a beat (about 10 ms).
    assert!(d < 0.02, "phase A {pa:.3} vs B {pb:.3}");
}

#[test]
fn sync_picks_double_time_when_closer() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, drums(87.0, 30.0, 0.0)); // drum & bass, detected as half time
    load(&mut h, DeckId::B, drums(172.0 / 2.0, 30.0, 0.0));
    h.send(Command::Sync { deck: DeckId::B }).unwrap();
    render(&mut e, 0.1);
    let b = h.shared().deck(1);
    assert!((b.rate - 87.0 / 86.0).abs() < 0.001, "rate {}", b.rate);
}

#[test]
fn sync_without_beatgrids_does_nothing() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    load(&mut h, DeckId::B, sine(440.0, 10.0, 0.5));
    h.send(Command::Sync { deck: DeckId::B }).unwrap();
    render(&mut e, 0.1);
    assert_eq!(h.shared().deck(1).rate, 1.0);
}

fn position(h: &EngineHandle, deck: DeckId) -> f64 {
    h.shared().deck(deck.index()).position
}

#[test]
fn scratching_follows_the_jog_wheel() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Seek {
        deck: DeckId::A,
        seconds: 5.0,
    })
    .unwrap();
    h.send(Command::ScratchStart { deck: DeckId::A }).unwrap();
    render(&mut e, 0.05);

    // Hand still: no movement, silence (once the EQ tail dies).
    assert!((position(&h, DeckId::A) - 5.0).abs() < 1e-6);

    // Drag the record back by 0.3 s in small steps, like jog ticks.
    for _ in 0..60 {
        h.send(Command::Jog {
            deck: DeckId::A,
            seconds: -0.005,
        })
        .unwrap();
        render(&mut e, 0.005);
    }
    let out = render(&mut e, 0.15);
    let pos = position(&h, DeckId::A);
    assert!((pos - 4.7).abs() < 0.005, "position {pos}");
    assert!(rms(&out[out.len() / 2..]) < 1e-3, "a still hand is silent");

    // Letting go of a paused deck leaves it where the hand left it.
    h.send(Command::ScratchEnd { deck: DeckId::A }).unwrap();
    render(&mut e, 0.1);
    assert!((position(&h, DeckId::A) - pos).abs() < 1e-6);
}

#[test]
fn scratching_a_playing_deck_holds_it_then_resumes() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 1.0);
    h.send(Command::ScratchStart { deck: DeckId::A }).unwrap();
    render(&mut e, 0.1);
    let held = position(&h, DeckId::A);
    render(&mut e, 0.5);
    assert!(
        (position(&h, DeckId::A) - held).abs() < 1e-3,
        "hand stops the record"
    );
    h.send(Command::ScratchEnd { deck: DeckId::A }).unwrap();
    render(&mut e, 0.5);
    let moved = position(&h, DeckId::A) - held;
    assert!(
        (moved - 0.5).abs() < 0.02,
        "playback resumes, moved {moved}"
    );
}

#[test]
fn jog_scrubs_when_paused_and_nudges_when_playing() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Jog {
        deck: DeckId::A,
        seconds: 1.5,
    })
    .unwrap();
    // Turning a paused record is audible, and it stops where it was turned to.
    let out = render(&mut e, 0.5);
    assert!(rms(&out) > 0.05, "paused jog is audible");
    assert!((position(&h, DeckId::A) - 1.5).abs() < 1e-6);
    assert!(rms(&render(&mut e, 0.1)) < 1e-3, "and silent once it stops");

    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 0.5);
    let before = position(&h, DeckId::A);
    // Spin the outer ring through 1 s of audio over 0.5 s.
    for _ in 0..100 {
        h.send(Command::Jog {
            deck: DeckId::A,
            seconds: 0.01,
        })
        .unwrap();
        render(&mut e, 0.005);
    }
    render(&mut e, 1.0);
    let ahead = position(&h, DeckId::A) - before - 1.5;
    // A nudge moves the beat a fraction of the wheel's travel, then fades.
    assert!(ahead > 0.1 && ahead < 0.2, "nudged {ahead}");
    assert!(
        (h.shared().deck(0).speed - 1.0).abs() < 1e-3,
        "nudge has faded"
    );
}

#[test]
fn filter_knob_low_passes_the_channel() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(6_000.0, 3.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let dry = rms(&render(&mut e, 0.5)[9_600..]);
    h.send(Command::SetFilter {
        deck: DeckId::A,
        value: -0.9,
    })
    .unwrap();
    let wet = rms(&render(&mut e, 0.5)[24_000..]);
    assert!(wet < dry * 0.05, "filter left {wet} of {dry}");
    assert!((h.shared().deck(0).filter + 0.9).abs() < 1e-6);
}

#[test]
fn echo_is_timed_to_the_beatgrid_and_reported() {
    let (mut e, mut h) = setup();
    // A short click at the start of a silent track with a 120 BPM grid.
    let mut samples = vec![0.0; SR as usize * 4 * 2];
    for v in &mut samples[..960] {
        *v = 0.5;
    }
    let mut t = Track::from_stereo(samples, SR);
    t.beatgrid = Some(dj_engine::Beatgrid {
        bpm: 120.0,
        first_beat: 0.0,
    });
    h.send(Command::Load {
        deck: DeckId::A,
        track: Arc::new(t),
    })
    .unwrap();
    for cmd in [
        Command::SetFxKind {
            deck: DeckId::A,
            kind: FxKind::Echo,
        },
        Command::SetFxBeats {
            deck: DeckId::A,
            beats: 0.5,
        },
        Command::SetFxLevel {
            deck: DeckId::A,
            value: 1.0,
        },
        Command::SetFxOn {
            deck: DeckId::A,
            on: true,
        },
    ] {
        h.send(cmd).unwrap();
    }
    render(&mut e, 0.05);
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let out = render(&mut e, 1.0);
    // Half a beat at 120 BPM is 0.25 s.
    let at = |secs: f32| {
        let i = (secs * SR as f32) as usize * 2;
        rms(&out[i..i + 960])
    };
    assert!(at(0.25) > 0.1, "no echo after half a beat");
    assert!(at(0.15) < 0.01, "echo arrived early");
    let fx = h.shared().deck(0).fx;
    assert!(fx.on && fx.kind == FxKind::Echo && fx.beats == 0.5 && fx.level == 1.0);
}

#[test]
fn records_the_master_output_to_wav() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 3.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let dir = std::env::temp_dir().join(format!("oss-dj-rec-{}", std::process::id()));
    let path = dir.join("nested").join("set.wav");
    h.start_recording(&path).unwrap();
    assert!(
        h.start_recording(&path).is_err(),
        "second start should fail"
    );
    let master = render(&mut e, 1.0);
    // Give the writer a moment, as a real audio callback would.
    std::thread::sleep(std::time::Duration::from_millis(50));
    assert!(h.recording().active);
    let done = h.stop_recording().unwrap();
    assert!(!done.active);
    assert!(
        (done.seconds - 1.0).abs() < 1e-3,
        "recorded {} s",
        done.seconds
    );
    assert_eq!(done.dropped_seconds, 0.0);

    let mut wav = hound::WavReader::open(&path).unwrap();
    let spec = wav.spec();
    assert_eq!(
        (spec.channels, spec.sample_rate, spec.bits_per_sample),
        (2, SR, 24)
    );
    let samples: Vec<f32> = wav
        .samples::<i32>()
        .map(|s| s.unwrap() as f32 / 8_388_607.0)
        .collect();
    assert_eq!(samples.len(), master.len());
    let err = samples
        .iter()
        .zip(&master)
        .fold(0f32, |m, (a, b)| m.max((a - b).abs()));
    assert!(err < 1e-5, "file differs from master by {err}");

    // Nothing is recorded once stopped.
    render(&mut e, 0.2);
    assert!(h.stop_recording().is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn set_cue_moves_the_cue_point_without_playing() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let a = DeckId::A;
    h.send(Command::SetCue {
        deck: a,
        seconds: 3.5,
    })
    .unwrap();
    h.send(Command::Seek {
        deck: a,
        seconds: 6.0,
    })
    .unwrap();
    let out = render(&mut e, 0.2);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!((d.cue - 3.5).abs() < 1e-3);
    assert!((d.position - 6.0).abs() < 1e-3);
    assert!(rms(&out) < 1e-6, "setting a cue must not make a sound");

    // Past the end clamps to the track's length.
    h.send(Command::SetCue {
        deck: a,
        seconds: 99.0,
    })
    .unwrap();
    render(&mut e, 0.05);
    assert!((h.shared().deck(0).cue - 10.0).abs() < 1e-3);
}

#[test]
fn restored_cues_put_the_deck_back_at_its_cue_without_playing() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let mut hot_cues = [None; dj_engine::HOT_CUES];
    hot_cues[0] = Some(1.0);
    hot_cues[2] = Some(7.25);
    hot_cues[3] = Some(42.0); // past the end: dropped
    let cues = SavedCues {
        cue: 2.5,
        hot_cues,
        saved_loop: Some((4.0, 6.0)),
    };
    for cmd in cues.commands(DeckId::A) {
        h.send(cmd).unwrap();
    }
    let out = render(&mut e, 0.2);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!(rms(&out) < 1e-6, "restoring cues must not make a sound");
    assert!((d.cue - 2.5).abs() < 1e-3);
    assert!((d.position - 2.5).abs() < 1e-3);
    assert!((d.hot_cues[0].unwrap() - 1.0).abs() < 1e-3);
    assert_eq!(d.hot_cues[1], None);
    assert!((d.hot_cues[2].unwrap() - 7.25).abs() < 1e-3);
    assert_eq!(d.hot_cues[3], None);
    assert!((d.loop_in.unwrap() - 4.0).abs() < 1e-3);
    assert!((d.loop_out.unwrap() - 6.0).abs() < 1e-3);
    assert!(!d.looping, "a restored loop waits for reloop");
}

#[test]
fn processing_an_empty_block_applies_commands_but_holds_position() {
    // While the audio device is gone, the output thread calls `process` with
    // empty buffers so queued commands still land and decks stay put.
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 0.5);
    let before = h.shared().deck(0).position;
    h.send(Command::SetFader {
        deck: DeckId::A,
        value: 0.25,
    })
    .unwrap();
    for _ in 0..10 {
        e.process(&mut [], &mut []);
    }
    let d = h.shared().deck(0);
    assert_eq!(d.position, before);
    assert!((d.fader - 0.25).abs() < 1e-6);
}

/// Frequency of a (roughly) pure tone, from its upward zero crossings.
fn pitch_of(stereo: &[f32]) -> f32 {
    let left: Vec<f32> = stereo.iter().step_by(2).copied().collect();
    let ups: Vec<usize> = (1..left.len())
        .filter(|&i| left[i - 1] < 0.0 && left[i] >= 0.0)
        .collect();
    let (first, last) = (ups[0], ups[ups.len() - 1]);
    (ups.len() - 1) as f32 * SR as f32 / (last - first) as f32
}

#[test]
fn keylock_changes_tempo_but_not_pitch() {
    for keylock in [false, true] {
        let (mut e, mut h) = setup();
        load(&mut h, DeckId::A, sine(440.0, 6.0, 0.5));
        h.send(Command::SetKeylock {
            deck: DeckId::A,
            on: keylock,
        })
        .unwrap();
        h.send(Command::SetRate {
            deck: DeckId::A,
            rate: 1.08,
        })
        .unwrap();
        h.send(Command::Play { deck: DeckId::A }).unwrap();
        let out = render(&mut e, 2.0);
        // The play head moves at the new tempo either way.
        let pos = position(&h, DeckId::A);
        assert!(
            (pos - 2.16).abs() < 0.002,
            "keylock {keylock}: position {pos}"
        );
        assert!(h.shared().deck(0).keylock == keylock);
        let f = pitch_of(&out[SR as usize..]);
        let expect = if keylock { 440.0 } else { 440.0 * 1.08 };
        assert!(
            (f - expect).abs() < expect * 0.003,
            "keylock {keylock}: pitch {f} Hz, expected {expect}"
        );
    }
}

#[test]
fn keylock_keeps_pitch_when_slowed_and_resampled() {
    // A 44.1 kHz track on a 48 kHz engine, slowed down 6%.
    let (mut e, mut h) = setup();
    let n = 44_100 * 6;
    let tone: Vec<f32> = (0..n)
        .flat_map(|i| {
            let v = 0.5 * (std::f32::consts::TAU * 330.0 * i as f32 / 44_100.0).sin();
            [v, v]
        })
        .collect();
    h.send(Command::Load {
        deck: DeckId::A,
        track: Arc::new(Track::from_stereo(tone, 44_100)),
    })
    .unwrap();
    h.send(Command::SetKeylock {
        deck: DeckId::A,
        on: true,
    })
    .unwrap();
    h.send(Command::SetRate {
        deck: DeckId::A,
        rate: 0.94,
    })
    .unwrap();
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let out = render(&mut e, 2.0);
    let f = pitch_of(&out[SR as usize..]);
    assert!((f - 330.0).abs() < 1.0, "pitch {f} Hz");
    assert!((position(&h, DeckId::A) - 1.88).abs() < 0.002);
}

#[test]
fn keylock_is_smooth() {
    // A steady tone should come out steady: no dips where grains overlap,
    // and no clicks when keylock turns on or off mid-play.
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(220.0, 8.0, 0.5));
    h.send(Command::SetRate {
        deck: DeckId::A,
        rate: 1.05,
    })
    .unwrap();
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let mut out = render(&mut e, 0.5);
    for on in [true, false, true] {
        h.send(Command::SetKeylock {
            deck: DeckId::A,
            on,
        })
        .unwrap();
        out.extend(render(&mut e, 1.0));
    }
    let start = SR as usize / 10; // skip the EQ and gain settling in
    let left: Vec<f32> = out.iter().step_by(2).skip(start).copied().collect();
    // The mixer scales the level, so measure the steady amplitude first.
    let amp = left.iter().fold(0f32, |m, v| m.max(v.abs()));
    // Largest step between samples of a sine this loud at 231 Hz.
    let max_step = amp * std::f32::consts::TAU * 231.0 / SR as f32;
    for i in 1..left.len() {
        let step = (left[i] - left[i - 1]).abs();
        assert!(step < max_step * 1.2, "click at frame {i}: step {step}");
    }
    let windows: Vec<f32> = left.chunks(SR as usize / 50).map(rms).collect();
    let mean = windows.iter().sum::<f32>() / windows.len() as f32;
    for (k, r) in windows.iter().enumerate() {
        assert!(
            (r - mean).abs() < mean * 0.04,
            "level wobbles in window {k}: rms {r}"
        );
    }
}

#[test]
fn loaded_tracks_get_a_key() {
    // An A minor chord, held.
    let n = SR as usize * 20;
    let notes = [110.0, 220.0, 261.63, 329.63];
    let chord: Vec<f32> = (0..n)
        .flat_map(|i| {
            let t = i as f32 / SR as f32;
            let v: f32 = notes
                .iter()
                .map(|f| 0.1 * (std::f32::consts::TAU * f * t).sin())
                .sum();
            [v, v]
        })
        .collect();
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, chord);
    render(&mut e, 0.05);
    let key = h.shared().deck(0).key.expect("no key");
    assert_eq!(key.name(), "Am");
}

/// Sends `ScratchTo` like a mouse drag: an update every `every` seconds,
/// moving `speed` seconds of audio per second. Returns the rendered audio.
fn drag(
    e: &mut Engine,
    h: &mut EngineHandle,
    from: f64,
    speed: f64,
    every: f32,
    secs: f32,
) -> Vec<f32> {
    let mut out = vec![];
    let steps = (secs / every).round() as usize;
    for k in 1..=steps {
        h.send(Command::ScratchTo {
            deck: DeckId::A,
            seconds: from + speed * (k as f32 * every) as f64,
            since_last: Some(every as f64),
        })
        .unwrap();
        out.extend(render(e, every));
    }
    out
}

#[test]
fn dragging_a_waveform_scratches_audibly_both_ways() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Seek {
        deck: DeckId::A,
        seconds: 5.0,
    })
    .unwrap();
    // Not scratching: ScratchTo does nothing.
    h.send(Command::ScratchTo {
        deck: DeckId::A,
        seconds: 2.0,
        since_last: None,
    })
    .unwrap();
    render(&mut e, 0.05);
    assert!((position(&h, DeckId::A) - 5.0).abs() < 1e-6);

    h.send(Command::ScratchStart { deck: DeckId::A }).unwrap();
    // Forward at normal speed with 60 Hz pointer events: plays at ~1x.
    let fwd = drag(&mut e, &mut h, 5.0, 1.0, 1.0 / 60.0, 0.5);
    assert!(rms(&fwd[fwd.len() / 2..]) > 0.2, "forward drag is audible");
    let speed = h.shared().deck(0).speed;
    assert!((speed - 1.0).abs() < 0.15, "forward speed {speed}");

    // Then backwards at half speed: reverse playback.
    let at = position(&h, DeckId::A);
    let back = drag(&mut e, &mut h, 5.5, -0.5, 1.0 / 60.0, 0.5);
    assert!(
        rms(&back[back.len() / 2..]) > 0.1,
        "backward drag is audible"
    );
    let speed = h.shared().deck(0).speed;
    assert!((speed + 0.5).abs() < 0.1, "backward speed {speed}");
    assert!(position(&h, DeckId::A) < at);

    // Letting go of a paused deck: it glides to the hand and stops there.
    h.send(Command::ScratchEnd { deck: DeckId::A }).unwrap();
    render(&mut e, 0.2);
    assert!((position(&h, DeckId::A) - 5.25).abs() < 1e-6);
    assert!(!h.shared().deck(0).playing);
    assert!(rms(&render(&mut e, 0.1)) < 1e-3);
}

#[test]
fn releasing_a_scratched_playing_deck_resumes_play() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    render(&mut e, 1.0);
    h.send(Command::ScratchStart { deck: DeckId::A }).unwrap();
    // Pull the record back half a second.
    drag(&mut e, &mut h, 1.0, -1.0, 1.0 / 120.0, 0.5);
    render(&mut e, 0.1);
    assert!(h.shared().deck(0).playing, "still playing under the hand");
    assert!(h.shared().deck(0).speed.abs() < 1e-3, "held still");
    h.send(Command::ScratchEnd { deck: DeckId::A }).unwrap();
    render(&mut e, 0.2);
    let speed = h.shared().deck(0).speed;
    assert!((speed - 1.0).abs() < 1e-3, "back up to speed: {speed}");
}

fn send(h: &mut EngineHandle, cmd: Command) {
    h.send(cmd).unwrap();
}

/// A loaded, analyzed 120 BPM track on deck A: one beat is 0.5 s.
fn beat_track() -> (Engine, EngineHandle) {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, drums(120.0, 30.0, 0.0));
    render(&mut e, 0.01);
    let bpm = h.shared().deck(0).bpm;
    assert!((bpm - 120.0).abs() < 0.05, "got {bpm}");
    (e, h)
}

#[test]
fn hot_cues_set_jump_and_preview() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 2.0,
        },
    );
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert_eq!(d.hot_cues[0].map(|c| (c * 1000.0).round()), Some(2000.0));
    assert!(!d.playing, "setting a hot cue doesn't start playback");

    // Paused: play from the hot cue while held, back on release.
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 5.0,
        },
    );
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    render(&mut e, 0.5);
    let d = h.shared().deck(0);
    assert!(d.playing);
    assert!((d.position - 2.5).abs() < 0.02, "{}", d.position);
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(!d.playing);
    assert!((d.position - 2.0).abs() < 1e-3);

    // Playing: jump and keep playing after release.
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 6.0,
        },
    );
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.5);
    let d = h.shared().deck(0);
    assert!(d.playing);
    assert!((d.position - 2.5).abs() < 0.02, "{}", d.position);

    send(&mut h, Command::HotCueClear { deck: a, index: 0 });
    render(&mut e, 0.01);
    assert_eq!(h.shared().deck(0).hot_cues, [None; dj_engine::HOT_CUES]);
}

#[test]
fn beat_loop_wraps_on_the_grid() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 4.1,
        },
    );
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::LoopToggle { deck: a });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.looping);
    assert_eq!(d.loop_beats, 4.0);
    let (i, o) = (d.loop_in.unwrap(), d.loop_out.unwrap());
    assert!(
        (i - 4.0).abs() < 0.03,
        "starts on the nearest beat, got {i}"
    );
    assert!((o - i - 2.0).abs() < 1e-3, "four beats at 120 BPM");

    // Long after the loop's end, still inside it.
    render(&mut e, 5.0);
    let p = h.shared().deck(0).position;
    assert!(p >= i && p < o, "{p} outside {i}..{o}");

    // Halving keeps the start and pulls the play head inside.
    send(
        &mut h,
        Command::LoopScale {
            deck: a,
            factor: 0.5,
        },
    );
    render(&mut e, 0.3);
    let d = h.shared().deck(0);
    assert_eq!(d.loop_beats, 2.0);
    assert!((d.loop_out.unwrap() - i - 1.0).abs() < 1e-3);
    assert!(d.position >= i && d.position < i + 1.0);

    // Out of the loop: playback carries on past it.
    send(&mut h, Command::LoopToggle { deck: a });
    render(&mut e, 1.5);
    let d = h.shared().deck(0);
    assert!(!d.looping);
    assert!(d.position > i + 1.0);
    assert!(d.loop_in.is_some(), "the loop is kept for reloop");

    // Reloop jumps back in.
    send(&mut h, Command::ReloopExit { deck: a });
    render(&mut e, 0.1);
    let d = h.shared().deck(0);
    assert!(d.looping);
    assert!(d.position >= i && d.position < i + 1.0);
}

#[test]
fn beat_loop_pads_toggle_their_size() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 3.0,
        },
    );
    send(
        &mut h,
        Command::BeatLoop {
            deck: a,
            beats: 1.0,
        },
    );
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.looping);
    assert_eq!(d.loop_beats, 1.0);
    send(
        &mut h,
        Command::BeatLoop {
            deck: a,
            beats: 8.0,
        },
    );
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.looping);
    assert!((d.loop_out.unwrap() - d.loop_in.unwrap() - 4.0).abs() < 1e-3);
    send(
        &mut h,
        Command::BeatLoop {
            deck: a,
            beats: 8.0,
        },
    );
    render(&mut e, 0.01);
    assert!(!h.shared().deck(0).looping);
}

#[test]
fn manual_loop_in_and_out() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 1.0,
        },
    );
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::LoopIn { deck: a });
    render(&mut e, 0.75);
    send(&mut h, Command::LoopOut { deck: a });
    render(&mut e, 2.0);
    let d = h.shared().deck(0);
    assert!(d.looping);
    let (i, o) = (d.loop_in.unwrap(), d.loop_out.unwrap());
    assert!(
        (i - 1.0).abs() < 1e-3 && (o - 1.75).abs() < 0.02,
        "{i}..{o}"
    );
    assert!(d.position >= i && d.position < o);
}

#[test]
fn loop_wrap_does_not_click() {
    let (mut e, mut h) = setup();
    // 440 Hz doesn't fit a 0.3 s loop a whole number of times, so a hard
    // wrap would jump between unrelated points of the wave.
    load(&mut h, DeckId::A, sine(441.3, 10.0, 0.5));
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 1.0,
        },
    );
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::LoopIn { deck: a });
    render(&mut e, 0.3);
    send(&mut h, Command::LoopOut { deck: a });
    let out = render(&mut e, 1.5);
    let step = out
        .chunks(2)
        .collect::<Vec<_>>()
        .windows(2)
        .map(|w| (w[1][0] - w[0][0]).abs())
        .fold(0f32, f32::max);
    // A clean 441 Hz sine at 0.5 moves at most ~0.029 per sample.
    assert!(step < 0.05, "largest sample step {step}");
}

#[test]
fn beat_jump_moves_by_beats_and_carries_the_loop() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 10.0,
        },
    );
    send(
        &mut h,
        Command::BeatJump {
            deck: a,
            beats: 4.0,
        },
    );
    render(&mut e, 0.01);
    assert!((position(&h, a) - 12.0).abs() < 1e-3);
    send(
        &mut h,
        Command::BeatJump {
            deck: a,
            beats: -8.0,
        },
    );
    render(&mut e, 0.01);
    assert!((position(&h, a) - 8.0).abs() < 1e-3);

    send(&mut h, Command::LoopToggle { deck: a });
    send(
        &mut h,
        Command::BeatJump {
            deck: a,
            beats: 4.0,
        },
    );
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.looping, "jumping moves the loop instead of leaving it");
    assert!((d.loop_in.unwrap() - 10.0).abs() < 0.03, "{:?}", d.loop_in);
    assert!(d.position >= d.loop_in.unwrap() && d.position < d.loop_out.unwrap());
}

#[test]
fn loops_and_jumps_need_a_beatgrid() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 10.0, 0.5));
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 2.0,
        },
    );
    send(&mut h, Command::LoopToggle { deck: a });
    send(
        &mut h,
        Command::BeatJump {
            deck: a,
            beats: 4.0,
        },
    );
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(!d.looping);
    assert!((d.position - 2.0).abs() < 1e-3);
}

#[test]
fn loading_a_track_clears_cues_and_loops() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(&mut h, Command::HotCuePress { deck: a, index: 3 });
    send(&mut h, Command::LoopToggle { deck: a });
    send(
        &mut h,
        Command::LoopScale {
            deck: a,
            factor: 2.0,
        },
    );
    render(&mut e, 0.01);
    assert!(h.shared().deck(0).hot_cues[3].is_some());
    load(&mut h, a, sine(440.0, 3.0, 0.5));
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.hot_cues.iter().all(Option::is_none));
    assert!(!d.looping && d.loop_in.is_none());
    assert_eq!(d.loop_beats, dj_engine::DEFAULT_LOOP_BEATS);
}

fn seek(h: &mut EngineHandle, seconds: f64) {
    send(
        h,
        Command::Seek {
            deck: DeckId::A,
            seconds,
        },
    );
}

#[test]
fn quantized_hot_cues_snap_and_keep_the_beat() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    assert!(h.shared().mixer().quantize, "quantize starts on");

    // Set at 2.1 s: snaps to the beat at 2.0 s.
    seek(&mut h, 2.1);
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let cue = h.shared().deck(0).hot_cues[0].unwrap();
    assert!((cue - 2.0).abs() < 0.03, "snapped to the beat, got {cue}");

    // Playing 0.2 s (0.4 beats) past a beat: the jump lands 0.2 s past the
    // cue, so the music stays in time.
    seek(&mut h, 6.2 + (cue - 2.0));
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let p = h.shared().deck(0).position;
    assert!((p - (cue + 0.21)).abs() < 0.01, "kept the beat phase: {p}");
}

#[test]
fn hot_cues_are_exact_with_quantize_off() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(&mut h, Command::SetQuantize { on: false });
    seek(&mut h, 2.1);
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(!h.shared().mixer().quantize);
    assert!((d.hot_cues[0].unwrap() - 2.1).abs() < 1e-3);

    seek(&mut h, 6.2);
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    let p = h.shared().deck(0).position;
    assert!((p - 2.11).abs() < 0.01, "jumped right to the cue: {p}");
}

#[test]
fn quantized_manual_loops_land_on_beats() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    seek(&mut h, 4.1);
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::LoopIn { deck: a });
    render(&mut e, 0.95);
    send(&mut h, Command::LoopOut { deck: a });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    let (i, o) = (d.loop_in.unwrap(), d.loop_out.unwrap());
    assert!(d.looping);
    assert!((i - 4.0).abs() < 0.03, "in on the beat, got {i}");
    assert!((o - i - 1.0).abs() < 1e-3, "two beats long, got {i}..{o}");
    assert_eq!(d.loop_beats, 2.0);
    // Pressed 0.05 s past the out point: wrapped as the loop would have.
    assert!(
        (d.position - (i + 0.06)).abs() < 0.02,
        "wrapped in time: {}",
        d.position
    );
}

#[test]
fn unquantized_beat_loops_start_at_the_play_head() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(&mut h, Command::SetQuantize { on: false });
    seek(&mut h, 4.1);
    send(&mut h, Command::LoopToggle { deck: a });
    render(&mut e, 0.01);
    let d = h.shared().deck(0);
    assert!(d.looping);
    assert!((d.loop_in.unwrap() - 4.1).abs() < 1e-3);
    assert!((d.loop_out.unwrap() - 6.1).abs() < 1e-3);
}

#[test]
fn a_beatgrid_fixed_by_hand_replaces_the_detected_one_until_the_next_load() {
    let (mut e, mut h) = setup();
    let gridded = || {
        let mut t = Track::from_stereo(sine(440.0, 20.0, 0.5), SR);
        t.beatgrid = Some(dj_engine::Beatgrid {
            bpm: 120.0,
            first_beat: 0.0,
        });
        Arc::new(t)
    };
    let a = DeckId::A;
    h.send(Command::Load {
        deck: a,
        track: gridded(),
    })
    .unwrap();
    render(&mut e, 0.05);
    assert_eq!(h.shared().deck(0).bpm, 120.0);

    // Halved, with the downbeat moved: beat jumps follow the new grid.
    h.send(Command::SetBeatgrid {
        deck: a,
        grid: Some(dj_engine::Beatgrid {
            bpm: 60.0,
            first_beat: 0.25,
        }),
    })
    .unwrap();
    h.send(Command::BeatJump {
        deck: a,
        beats: 4.0,
    })
    .unwrap();
    render(&mut e, 0.05);
    let d = h.shared().deck(0);
    assert_eq!(d.bpm, 60.0);
    assert!(
        (d.position - 4.0).abs() < 1e-3,
        "4 beats at 60 BPM, got {}",
        d.position
    );

    // Nonsense is ignored; None goes back to the detected grid.
    h.send(Command::SetBeatgrid {
        deck: a,
        grid: Some(dj_engine::Beatgrid {
            bpm: f64::NAN,
            first_beat: 0.0,
        }),
    })
    .unwrap();
    render(&mut e, 0.05);
    assert_eq!(h.shared().deck(0).bpm, 60.0);
    h.send(Command::SetBeatgrid {
        deck: a,
        grid: None,
    })
    .unwrap();
    render(&mut e, 0.05);
    assert_eq!(h.shared().deck(0).bpm, 120.0);

    // A new load starts from its own detected grid.
    h.send(Command::SetBeatgrid {
        deck: a,
        grid: Some(dj_engine::Beatgrid {
            bpm: 90.0,
            first_beat: 0.0,
        }),
    })
    .unwrap();
    h.send(Command::Load {
        deck: a,
        track: gridded(),
    })
    .unwrap();
    render(&mut e, 0.05);
    assert_eq!(h.shared().deck(0).bpm, 120.0);
}

#[test]
fn sampler_plays_into_the_master_past_the_crossfader() {
    let (mut e, mut h) = setup();
    h.send(Command::LoadSample {
        slot: 3,
        sample: Arc::new(Track::from_stereo(sine(880.0, 0.3, 0.5), SR)),
    })
    .unwrap();
    // Decks off air: the sampler doesn't care.
    h.send(Command::SetCrossfader { value: 1.0 }).unwrap();
    h.send(Command::SetFader {
        deck: DeckId::A,
        value: 0.0,
    })
    .unwrap();
    assert_eq!(rms(&render(&mut e, 0.1)), 0.0, "silent until pressed");
    h.send(Command::SamplePlay { slot: 3 }).unwrap();
    let out = render(&mut e, 0.5);
    assert!(rms(&out[..SR as usize / 5]) > 0.2, "the sample plays");
    assert_eq!(rms(&out[SR as usize..]), 0.0, "once");
    let slot = e.shared().sampler().slots[3];
    assert!(slot.loaded && !slot.playing);
    assert!((slot.duration - 0.3).abs() < 1e-3);

    // Level 0 mutes it.
    h.send(Command::SetSamplerLevel { value: 0.0 }).unwrap();
    render(&mut e, 0.3);
    h.send(Command::SamplePlay { slot: 3 }).unwrap();
    assert!(e.shared().sampler().level == 0.0);
    assert!(rms(&render(&mut e, 0.2)) < 1e-4);

    h.send(Command::ClearSample { slot: 3 }).unwrap();
    render(&mut e, 0.01);
    assert!(!e.shared().sampler().slots[3].loaded);
}

#[test]
fn stems_mute_and_solo() {
    use dj_engine::stems::{STORED_BASS, STORED_DRUMS, STORED_VOCALS};
    use dj_engine::Stems;

    let (mut e, mut h) = setup();
    // A mix of two tones: "vocals" at 880 Hz and "bass" at 110 Hz.
    let vocals = sine(880.0, 2.0, 0.3);
    let bass = sine(110.0, 2.0, 0.3);
    let mix: Vec<f32> = vocals.iter().zip(&bass).map(|(a, b)| a + b).collect();
    let track = Track::from_stereo(mix, SR);
    let stems = Stems::new(track.frames());
    for f in 0..track.frames() {
        stems.write(f, STORED_VOCALS, vocals[f * 2], vocals[f * 2 + 1]);
        stems.write(f, STORED_BASS, bass[f * 2], bass[f * 2 + 1]);
        stems.write(f, STORED_DRUMS, 0.0, 0.0);
    }
    for b in 0..stems.blocks() {
        stems.mark_ready(b);
    }
    track.stems.set(Arc::new(stems)).unwrap();
    h.send(Command::Load {
        deck: DeckId::A,
        track: Arc::new(track),
    })
    .unwrap();
    h.send(Command::SetCrossfader { value: -1.0 }).unwrap();
    h.send(Command::Play { deck: DeckId::A }).unwrap();
    let full = rms(&render(&mut e, 0.3)[4800..]);

    // Vocals off: only the bass is left, about 1/√2 of the level.
    h.send(Command::SetStems {
        deck: DeckId::A,
        mask: 0b1110,
    })
    .unwrap();
    let out = render(&mut e, 0.3);
    let no_vocals = rms(&out[4800..]);
    assert!(
        (no_vocals / full - 0.707).abs() < 0.05,
        "{no_vocals} vs {full}"
    );
    // The change fades in rather than clicking: no sample jumps far.
    let jump = out
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .fold(0.0, f32::max);
    assert!(jump < 0.1, "jump {jump}");

    // Only drums (silent here): nothing.
    h.send(Command::SetStems {
        deck: DeckId::A,
        mask: 0b1000,
    })
    .unwrap();
    assert!(rms(&render(&mut e, 0.3)[4800..]) < 1e-3);

    // All back on: the original again.
    h.send(Command::SetStems {
        deck: DeckId::A,
        mask: 0b1111,
    })
    .unwrap();
    let back = rms(&render(&mut e, 0.3)[4800..]);
    assert!((back / full - 1.0).abs() < 0.01);
    assert_eq!(h.shared().deck(0).stems, 0b1111);
}

#[test]
fn auto_gain_matches_loudness_and_trim_works_on_top() {
    use dj_engine::loudness::TARGET_LUFS;
    // A loud track and one 12 dB quieter, with room to be turned up.
    let (mut e, mut h) = setup();
    let mut level = |amp: f32, trim: f32| {
        let t = Arc::new(Track::from_stereo(sine(1_000.0, 3.0, amp), SR));
        let db = t.loudness.gain_db(TARGET_LUFS);
        h.send(Command::Load {
            deck: DeckId::A,
            track: t,
        })
        .unwrap();
        h.send(Command::SetAutoGain {
            deck: DeckId::A,
            db,
        })
        .unwrap();
        h.send(Command::SetGain {
            deck: DeckId::A,
            db: trim,
        })
        .unwrap();
        h.send(Command::Play { deck: DeckId::A }).unwrap();
        let out = render(&mut e, 1.0);
        rms(&out[out.len() / 2..])
    };
    let loud = level(0.5, 0.0);
    let quiet = level(0.125, 0.0);
    assert!((loud / quiet - 1.0).abs() < 0.02, "{loud} vs {quiet}");
    // Trim adds to it: +6 dB is twice the level.
    let trimmed = level(0.125, 6.0);
    assert!((trimmed / quiet - 2.0).abs() < 0.05, "{trimmed} vs {quiet}");
}

fn slip_on(h: &mut EngineHandle, deck: DeckId) {
    send(h, Command::SetSlip { deck, on: true });
}

fn near(h: &EngineHandle, deck: DeckId, secs: f64, what: &str) {
    let at = position(h, deck);
    assert!((at - secs).abs() < 0.02, "{what}: at {at}, expected {secs}");
}

#[test]
fn slip_scratch_picks_up_where_the_track_would_be() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 20.0, 0.5));
    let a = DeckId::A;
    slip_on(&mut h, a);
    send(&mut h, Command::Play { deck: a });
    render(&mut e, 1.0);
    send(&mut h, Command::ScratchStart { deck: a });
    render(&mut e, 0.5);
    let d = h.shared().deck(0);
    assert!(d.slip);
    assert!(d.position < 1.1, "the hand holds the record");
    let shadow = d.slip_position.expect("slip is holding");
    assert!((shadow - 1.5).abs() < 0.02, "shadow keeps time: {shadow}");
    send(&mut h, Command::ScratchEnd { deck: a });
    render(&mut e, 0.5);
    near(&h, a, 2.0, "back in time after letting go");
    assert_eq!(h.shared().deck(0).slip_position, None);
}

#[test]
fn slip_loop_exits_in_time() {
    let (mut e, mut h) = beat_track();
    let a = DeckId::A;
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 10.0,
        },
    );
    slip_on(&mut h, a);
    send(&mut h, Command::Play { deck: a });
    send(&mut h, Command::LoopToggle { deck: a });
    render(&mut e, 5.0);
    let d = h.shared().deck(0);
    assert!(d.looping && d.position < 12.0, "looping a 2 s loop");
    send(&mut h, Command::LoopToggle { deck: a });
    render(&mut e, 0.01);
    near(&h, a, 15.01, "out of the loop where the track would be");
    assert!(!h.shared().deck(0).looping);
}

#[test]
fn slip_hot_cue_rolls_while_held() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 20.0, 0.5));
    let a = DeckId::A;
    // Land exactly on the hot cue rather than in phase with the beat.
    send(&mut h, Command::SetQuantize { on: false });
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 2.0,
        },
    );
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    send(
        &mut h,
        Command::Seek {
            deck: a,
            seconds: 8.0,
        },
    );
    slip_on(&mut h, a);
    send(&mut h, Command::Play { deck: a });
    render(&mut e, 0.5);
    send(&mut h, Command::HotCuePress { deck: a, index: 0 });
    render(&mut e, 0.5);
    near(&h, a, 2.5, "plays from the hot cue while held");
    send(&mut h, Command::HotCueRelease { deck: a, index: 0 });
    render(&mut e, 0.01);
    near(&h, a, 9.01, "back in time on release");
    assert!(h.shared().deck(0).playing);
}

#[test]
fn slip_pause_resumes_in_time_and_cue_cancels_it() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 20.0, 0.5));
    let a = DeckId::A;
    slip_on(&mut h, a);
    send(&mut h, Command::Play { deck: a });
    render(&mut e, 1.0);
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 1.0);
    near(&h, a, 1.0, "paused");
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 0.01);
    near(&h, a, 2.01, "resumes where the track would be");

    // The cue button stops at the cue point, with no slip to come back to.
    send(&mut h, Command::CuePress { deck: a });
    send(&mut h, Command::CueRelease { deck: a });
    render(&mut e, 0.5);
    let d = h.shared().deck(0);
    assert!(!d.playing && d.slip_position.is_none());
    near(&h, a, 0.0, "at the cue point");
}

#[test]
fn turning_slip_off_mid_slip_stays_put() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 20.0, 0.5));
    let a = DeckId::A;
    slip_on(&mut h, a);
    send(&mut h, Command::Play { deck: a });
    render(&mut e, 1.0);
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 1.0);
    send(&mut h, Command::SetSlip { deck: a, on: false });
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 0.01);
    near(&h, a, 1.01, "plays on from where it paused");
}

#[test]
fn without_slip_a_pause_is_just_a_pause() {
    let (mut e, mut h) = setup();
    load(&mut h, DeckId::A, sine(440.0, 20.0, 0.5));
    let a = DeckId::A;
    send(&mut h, Command::Play { deck: a });
    render(&mut e, 1.0);
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 1.0);
    assert_eq!(h.shared().deck(0).slip_position, None);
    send(&mut h, Command::TogglePlay { deck: a });
    render(&mut e, 0.01);
    near(&h, a, 1.01, "plays on from where it paused");
}
