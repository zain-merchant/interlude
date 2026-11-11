//! `dj`: a tiny command-line front end for the engine, useful for testing
//! the engine without the UI.
//!
//!   dj info <file>                         decode a file and show its waveform
//!   dj render <a> <b> <out.wav> [secs]     mix A into B offline and write a WAV
//!   dj play <a> [b]                        play A, then crossfade into B
//!   dj midi [secs]                         print what MIDI controllers send
//!   dj mappings [dir...]                   list controller mappings and how much of each works
//!   dj latency [secs]                      play two decks hard and report audio timing

use std::sync::Arc;
use std::time::{Duration, Instant};

use dj_engine::{new_engine, Command, DeckId, EngineHandle, EqBand, Track};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("info") if args.len() == 2 => info(&args[1]),
        Some("render") if args.len() >= 4 => {
            let secs = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(60.0);
            render(&args[1], &args[2], &args[3], secs)
        }
        Some("play") if args.len() >= 2 => play(&args[1], args.get(2).map(String::as_str)),
        Some("midi") => midi(args.get(1).and_then(|s| s.parse().ok())),
        Some("mappings") => mappings(&args[1..]),
        Some("latency") => latency(args.get(1).and_then(|s| s.parse().ok()).unwrap_or(10)),
        _ => {
            eprintln!(
                "usage:\n  dj info <file>\n  dj render <a> <b> <out.wav> [secs]\n  dj play <a> [b]\n  dj midi [secs]\n  dj mappings [dir...]\n  dj latency [secs]"
            );
            std::process::exit(2);
        }
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

fn load(path: &str) -> Result<Arc<Track>> {
    let t0 = Instant::now();
    let t = Track::load(path)?;
    eprintln!(
        "loaded {} ({:.1} s, {} Hz) in {} ms",
        t.title(),
        t.duration_secs(),
        t.sample_rate,
        t0.elapsed().as_millis()
    );
    Ok(Arc::new(t))
}

fn info(path: &str) -> Result<()> {
    let t = load(path)?;
    const BARS: [char; 8] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    let line: String = t
        .waveform
        .overview(80)
        .iter()
        .map(|b| BARS[(b.peak as usize * 7) / 255])
        .collect();
    println!("{line}");
    match t.beatgrid {
        Some(g) => println!("tempo: {:.2} BPM", g.bpm),
        None => println!("tempo: no clear beat"),
    }
    match t.key {
        Some(k) => println!("key: {} ({})", k.name(), k.camelot()),
        None => println!("key: unknown"),
    }
    Ok(())
}

fn send(h: &mut EngineHandle, cmd: Command) {
    h.send(cmd).expect("engine command queue full");
}

/// The automatic transition used by `render` and `play`: deck B starts
/// `fade` seconds before A ends, with B's bass cut until the midpoint so the
/// two kick drums don't clash.
struct Transition {
    start: f64,
    fade: f64,
}

impl Transition {
    fn new(a: &Track, fade: f64) -> Self {
        Self {
            start: (a.duration_secs() - fade).max(0.0),
            fade,
        }
    }

    /// Applies the transition state for time `t` (seconds since start).
    fn update(&self, h: &mut EngineHandle, t: f64, started_b: &mut bool) {
        if t >= self.start && !*started_b {
            send(h, Command::Play { deck: DeckId::B });
            *started_b = true;
        }
        let x = ((t - self.start) / self.fade).clamp(0.0, 1.0);
        send(
            h,
            Command::SetCrossfader {
                value: (x * 2.0 - 1.0) as f32,
            },
        );
        let low_b = if x < 0.5 { -60.0 } else { 0.0 };
        let low_a = if x < 0.5 { 0.0 } else { -60.0 };
        send(
            h,
            Command::SetEq {
                deck: DeckId::B,
                band: EqBand::Low,
                db: low_b,
            },
        );
        send(
            h,
            Command::SetEq {
                deck: DeckId::A,
                band: EqBand::Low,
                db: low_a,
            },
        );
    }
}

fn render(a: &str, b: &str, out: &str, max_secs: f64) -> Result<()> {
    let (ta, tb) = (load(a)?, load(b)?);
    let sr = 44_100;
    let (mut engine, mut h) = new_engine(sr);
    let fade = 16.0f64.min(ta.duration_secs() / 2.0);
    let tr = Transition::new(&ta, fade);
    send(
        &mut h,
        Command::Load {
            deck: DeckId::A,
            track: ta.clone(),
        },
    );
    send(
        &mut h,
        Command::Load {
            deck: DeckId::B,
            track: tb.clone(),
        },
    );
    send(&mut h, Command::Play { deck: DeckId::A });

    let total = (tr.start + fade + 10.0).min(max_secs.max(1.0));
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: sr,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut w = hound::WavWriter::create(out, spec)?;
    let block = 512;
    let (mut m, mut c) = (vec![0.0f32; block * 2], vec![0.0f32; block * 2]);
    let mut started_b = false;
    let t0 = Instant::now();
    let mut t = 0.0;
    while t < total {
        tr.update(&mut h, t, &mut started_b);
        engine.process(&mut m, &mut c);
        for s in &m {
            w.write_sample((s * i16::MAX as f32) as i16)?;
        }
        t += block as f64 / sr as f64;
    }
    w.finalize()?;
    eprintln!(
        "rendered {total:.1} s to {out} in {} ms ({:.0}x real time)",
        t0.elapsed().as_millis(),
        total / t0.elapsed().as_secs_f64()
    );
    Ok(())
}

fn play(a: &str, b: Option<&str>) -> Result<()> {
    let (output, mut h) = dj_engine::output::start_default()?;
    eprintln!(
        "output: {} at {} Hz, {} channels{}",
        output.device_name,
        output.sample_rate,
        output.channels,
        if output.channels >= 4 {
            " (headphone cue on 3-4)"
        } else {
            ""
        }
    );
    let ta = load(a)?;
    send(
        &mut h,
        Command::Load {
            deck: DeckId::A,
            track: ta.clone(),
        },
    );
    send(&mut h, Command::SetCrossfader { value: -1.0 });
    let tr = match b {
        Some(b) => {
            let tb = load(b)?;
            send(
                &mut h,
                Command::Load {
                    deck: DeckId::B,
                    track: tb,
                },
            );
            Some(Transition::new(&ta, 16.0f64.min(ta.duration_secs() / 2.0)))
        }
        None => None,
    };
    send(&mut h, Command::Play { deck: DeckId::A });

    let t0 = Instant::now();
    let mut started_b = false;
    loop {
        std::thread::sleep(Duration::from_millis(50));
        let t = t0.elapsed().as_secs_f64();
        if let Some(tr) = &tr {
            tr.update(&mut h, t, &mut started_b);
        }
        let (da, db) = (h.shared().deck(0), h.shared().deck(1));
        eprint!(
            "\rA {:6.1}/{:.1}  B {:6.1}/{:.1}   ",
            da.position, da.duration, db.position, db.duration
        );
        if !da.playing && !db.playing && t > 0.5 {
            eprintln!();
            return Ok(());
        }
    }
}

/// Plays two decks at the heaviest settings (keylock, pitch, an effect) on
/// the real output, quietly, and prints the stream's timing every second:
/// buffer size, the driver's output latency, the slowest render and any
/// late callbacks. Set `OSS_DJ_BUFFER_FRAMES` to try other buffer sizes.
fn latency(secs: u64) -> Result<()> {
    let (output, mut h) = dj_engine::output::start_preferring(&["DDJ-FLX4"])?;
    let sr = output.sample_rate;
    eprintln!("output: {} at {sr} Hz", output.device_name);
    let tone: Vec<f32> = (0..sr as usize * 60)
        .flat_map(|i| {
            let v = (i as f32 * 220.0 * std::f32::consts::TAU / sr as f32).sin() * 0.5;
            [v, v]
        })
        .collect();
    let track = Arc::new(Track::from_stereo(tone, sr));
    send(&mut h, Command::SetMasterGain { db: -40.0 });
    for deck in DeckId::ALL {
        send(
            &mut h,
            Command::Load {
                deck,
                track: track.clone(),
            },
        );
        send(&mut h, Command::SetRate { deck, rate: 1.04 });
        send(&mut h, Command::SetKeylock { deck, on: true });
        send(&mut h, Command::SetFxOn { deck, on: true });
        send(&mut h, Command::Play { deck });
    }
    for _ in 0..secs {
        std::thread::sleep(Duration::from_secs(1));
        let s = output.stats();
        let budget = s.buffer_frames as f64 / sr as f64 * 1e6;
        println!(
            "buffer {} frames ({:.1} ms), output latency {:.1} ms, slowest render {} µs ({:.0}% of budget), late callbacks {}",
            s.buffer_frames,
            budget / 1000.0,
            s.output_latency_ms,
            s.max_render_us,
            s.max_render_us as f64 / budget * 100.0,
            s.late_callbacks
        );
    }
    Ok(())
}

/// Lists the controller mappings found in `dirs` (or the default folders)
/// and how much of each Mixxx mapping works here.
fn mappings(dirs: &[String]) -> Result<()> {
    let dirs: Vec<std::path::PathBuf> = if dirs.is_empty() {
        dj_controller::Catalog::default_dirs()
    } else {
        dirs.iter().map(Into::into).collect()
    };
    let catalog = dj_controller::Catalog::load(&dirs);
    for e in catalog.entries() {
        match e.preset() {
            None => println!("{:48} built in", e.name),
            Some(p) => {
                let c = p.coverage();
                println!(
                    "{:48} {:4}/{:<4} controls  {:4}/{:<4} LEDs  {:5} script bindings (not run yet)",
                    e.name, c.supported, c.controls, c.outputs_supported, c.outputs, c.scripted
                );
            }
        }
    }
    if catalog.entries().len() == 1 {
        eprintln!("no Mixxx mappings found in:");
        for d in &dirs {
            eprintln!("  {}", d.display());
        }
    }
    Ok(())
}

/// Prints every MIDI message from every connected device, with what the
/// matching controller mapping would do with it. For checking a mapping
/// against real hardware.
fn midi(secs: Option<f64>) -> Result<()> {
    use std::sync::Mutex;

    let ports = dj_controller::midi::input_port_names();
    if ports.is_empty() {
        return Err("no MIDI inputs found; is the controller plugged in?".into());
    }
    for p in &ports {
        eprintln!("listening to {p}");
    }
    let t0 = Instant::now();
    let catalog = dj_controller::Catalog::load(&dj_controller::Catalog::default_dirs());
    let mut mappings = std::collections::HashMap::new();
    for p in &ports {
        if let Some(e) = catalog.find(p) {
            eprintln!("{p}: mapping {:?}", e.name);
            mappings.insert(p.clone(), e.create());
        }
    }
    let mappings = Mutex::new(mappings);
    let state = dj_controller::State::default();
    let _conns = dj_controller::midi::monitor_all(move |port, msg| {
        let hex: Vec<String> = msg.iter().map(|b| format!("{b:02X}")).collect();
        let mut meaning = String::new();
        if let Ok(mut ms) = mappings.lock() {
            if let Some(m) = ms.get_mut(port) {
                meaning = format!("{:?}", m.handle(msg, &state));
            }
        }
        println!(
            "{:9.3}  {port}  {}  {meaning}",
            t0.elapsed().as_secs_f64(),
            hex.join(" ")
        );
    });
    std::thread::sleep(Duration::from_secs_f64(
        secs.unwrap_or(f64::MAX / 4.0).min(1e9),
    ));
    Ok(())
}
