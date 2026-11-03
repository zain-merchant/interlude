//! Headless engine tests: render audio offline and check what comes out.

use std::sync::Arc;

use dj_engine::{new_engine, Command, DeckId, Engine, EngineHandle, FxKind, Track};

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
    render(&mut e, 0.01);
    assert!((position(&h, DeckId::A) - 1.5).abs() < 1e-6);

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
