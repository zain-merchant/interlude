//! Headless engine tests: render audio offline and check what comes out.

use std::sync::Arc;

use dj_engine::{new_engine, Command, DeckId, Engine, EngineHandle, Track};

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
