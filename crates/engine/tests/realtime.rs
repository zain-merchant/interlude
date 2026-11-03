//! Guards the real-time rule: `Engine::process` must never allocate or free
//! memory, because the allocator can take a lock and cause a dropout.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::sync::Arc;

use dj_engine::{new_engine, Beatgrid, Command, DeckId, EqBand, Track};

struct CountingAlloc;

thread_local! {
    static TRACKING: Cell<bool> = const { Cell::new(false) };
    static COUNT: Cell<usize> = const { Cell::new(0) };
}

unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if TRACKING.with(|t| t.get()) {
            COUNT.with(|c| c.set(c.get() + 1));
        }
        System.alloc(layout)
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if TRACKING.with(|t| t.get()) {
            COUNT.with(|c| c.set(c.get() + 1));
        }
        System.dealloc(ptr, layout)
    }
}

#[global_allocator]
static ALLOC: CountingAlloc = CountingAlloc;

#[test]
fn process_does_not_allocate() {
    let (mut engine, mut h) = new_engine(48_000);
    let tone: Vec<f32> = (0..48_000 * 2)
        .map(|i| ((i / 2) as f32 * 0.05).sin() * 0.5)
        .collect();
    // Give both tracks grids so the sync path runs too.
    let with_grid = |samples: Vec<f32>, sr: u32, bpm: f64| {
        let mut t = Track::from_stereo(samples, sr);
        t.beatgrid = Some(Beatgrid {
            bpm,
            first_beat: 0.1,
        });
        Arc::new(t)
    };
    let a = with_grid(tone.clone(), 44_100, 124.0);
    let b = with_grid(tone, 48_000, 128.0);
    let mut master = vec![0.0; 2048];
    let mut cue = vec![0.0; 2048];

    // Every kind of command, including loading over an existing track.
    let commands = vec![
        Command::Load {
            deck: DeckId::A,
            track: a.clone(),
        },
        Command::Load {
            deck: DeckId::B,
            track: b.clone(),
        },
        Command::Play { deck: DeckId::A },
        Command::Play { deck: DeckId::B },
        Command::SetRate {
            deck: DeckId::A,
            rate: 1.06,
        },
        Command::SetBend {
            deck: DeckId::B,
            bend: 0.04,
        },
        Command::SetEq {
            deck: DeckId::A,
            band: EqBand::Low,
            db: -60.0,
        },
        Command::SetGain {
            deck: DeckId::B,
            db: 3.0,
        },
        Command::SetFader {
            deck: DeckId::A,
            value: 0.7,
        },
        Command::SetCrossfader { value: 0.3 },
        Command::SetPfl {
            deck: DeckId::A,
            on: true,
        },
        Command::SetCueMix { value: 0.5 },
        Command::Jog {
            deck: DeckId::A,
            seconds: 0.01,
        },
        Command::ScratchStart { deck: DeckId::B },
        Command::Jog {
            deck: DeckId::B,
            seconds: -0.02,
        },
        Command::ScratchTo {
            deck: DeckId::B,
            seconds: 0.3,
            since_last: Some(0.01),
        },
        Command::ScratchEnd { deck: DeckId::B },
        Command::SetMasterGain { db: -3.0 },
        Command::CuePress { deck: DeckId::B },
        Command::CueRelease { deck: DeckId::B },
        Command::Seek {
            deck: DeckId::A,
            seconds: 0.5,
        },
        Command::Sync { deck: DeckId::B },
        Command::Sync { deck: DeckId::A },
        Command::Load {
            deck: DeckId::A,
            track: b.clone(),
        },
        Command::Eject { deck: DeckId::B },
        Command::TogglePlay { deck: DeckId::A },
    ];
    for cmd in commands {
        h.send(cmd).unwrap();
    }

    TRACKING.with(|t| t.set(true));
    for _ in 0..200 {
        engine.process(&mut master, &mut cue);
        engine.meter_master(&master);
    }
    TRACKING.with(|t| t.set(false));

    let n = COUNT.with(|c| c.get());
    assert_eq!(n, 0, "Engine::process allocated or freed {n} times");
}
