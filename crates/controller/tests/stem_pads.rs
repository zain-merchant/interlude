//! The DDJ-800's and DDJ-FLX6's KEYBOARD pads play stems, at the notes their
//! makers' MIDI lists give for them. Neither has been tried on the hardware.

use std::path::Path;

use dj_controller::official::{Dir, Table};
use dj_controller::{Action, Catalog, Mapping, State};
use dj_engine::{Command, Stem, ALL_STEMS};

const NAMES: [&str; 2] = ["Pioneer-DDJ-800", "Pioneer-DDJ-FLX6"];
/// SHIFT + HOT CUE, which chooses KEYBOARD.
const KEYBOARD: u8 = 0x69;

fn state() -> State {
    let mut s = State::default();
    for d in &mut s.decks {
        d.loaded = true;
        d.rate = 1.0;
        d.speed = 1.0;
        d.bpm = 120.0;
        d.duration = 300.0;
        d.position = 60.0;
        d.loop_beats = 4.0;
        d.stems = ALL_STEMS;
    }
    s
}

fn table(name: &str) -> Table {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    Table::load(&root.join(format!("official/{name}.tsv"))).unwrap()
}

/// The mapping, with KEYBOARD chosen on both decks.
fn keyboard(name: &str, s: &State) -> Box<dyn Mapping> {
    let cat = Catalog::load(&[Catalog::source_mappings_dir().unwrap()]);
    let file = format!("{name}.midi.xml");
    let entry = cat
        .entries()
        .iter()
        .find(|e| {
            e.preset()
                .and_then(|p| p.path.as_ref())
                .is_some_and(|p| p.ends_with(&file))
        })
        .unwrap_or_else(|| panic!("no {name}"));
    let mut m = entry.create();
    m.poll(s);
    for deck in 0..2 {
        m.handle(&[0x90 + deck, KEYBOARD, 0x7F], s);
        m.handle(&[0x90 + deck, KEYBOARD, 0x00], s);
    }
    m
}

/// Presses and lets go; the stems that are on after, if it changed them.
fn tap(m: &mut dyn Mapping, status: u8, note: u8, deck: usize, s: &mut State) -> Option<u8> {
    let mut out = m.handle(&[status, note, 0x7F], s);
    out.extend(m.handle(&[status, note, 0x00], s));
    let mut last = None;
    for a in out {
        if let Action::Engine(Command::SetStems { deck: d, mask }) = a {
            assert_eq!(d.index(), deck, "the deck the pad is on");
            s.decks[deck].stems = mask;
            last = Some(mask);
        }
    }
    last
}

#[test]
fn keyboard_pads_play_stems() {
    let bit = |s: Stem| 1u8 << s as u8;
    let (v, m, b, d) = (
        bit(Stem::Vocals),
        bit(Stem::Melody),
        bit(Stem::Bass),
        bit(Stem::Drums),
    );
    // Vocal, instruments, bass, acapella; kick, hi-hat, stems FX,
    // instrumental. There's no hi-hat stem and no stems FX here.
    let muted = [
        Some(ALL_STEMS & !v),
        Some(ALL_STEMS & !m),
        Some(ALL_STEMS & !b),
        Some(v),
        Some(ALL_STEMS & !d),
        None,
        None,
        Some(ALL_STEMS & !v),
    ];
    let alone = [Some(v), Some(m), Some(b), Some(v), Some(d), None, None];
    for name in NAMES {
        let list = table(name);
        for deck in 0..2usize {
            for (shift, expect) in [(0, &muted[..]), (1, &alone[..])] {
                for (pad, &want) in expect.iter().enumerate() {
                    let (status, note) = (0x97 + 2 * deck as u8 + shift, 0x40 + pad as u8);
                    // The FLX6 table here leaves the mode out of its SHIFT rows.
                    let row = list
                        .rows
                        .iter()
                        .find(|r| (r.status, r.data1) == (status, note) && r.dir != Dir::Out)
                        .unwrap_or_else(|| panic!("{name} never sends {status:02X} {note:02X}"));
                    assert!(
                        (shift == 1 || row.control.to_uppercase().contains("KEYBOARD MODE"))
                            && row.control.contains(&format!("PAD {}", pad + 1))
                            && row.control.starts_with(&format!("DECK{}", deck + 1))
                            && row.control.ends_with("+SHIFT") == (shift == 1),
                        "{name} {status:02X} {note:02X} is {}",
                        row.control
                    );
                    let mut s = state();
                    let mut map = keyboard(name, &s);
                    let got = tap(&mut *map, status, note, deck, &mut s);
                    assert_eq!(got, want, "{name}: {}", row.control);
                    // Again, once the engine has caught up, brings it back.
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    map.poll(&s);
                    if want.is_some() && shift == 0 {
                        let back = tap(&mut *map, status, note, deck, &mut s);
                        assert_eq!(back, Some(ALL_STEMS), "{name}: {} again", row.control);
                    }
                }
            }
        }
    }
}

#[test]
fn an_empty_deck_keeps_its_stems() {
    for name in NAMES {
        let mut s = state();
        s.decks[0].loaded = false;
        let mut map = keyboard(name, &s);
        for pad in 0..8 {
            assert_eq!(tap(&mut *map, 0x97, 0x40 + pad, 0, &mut s), None);
        }
    }
}

#[test]
fn the_pads_light_while_their_stems_play() {
    for name in NAMES {
        let list = table(name);
        let mut s = state();
        let mut map = keyboard(name, &s);
        map.poll(&s);
        map.leds(&s);
        s.decks[0].stems = ALL_STEMS & !(1 << Stem::Vocals as u8);
        map.poll(&s);
        let lit = map.leds(&s);
        assert!(
            lit.iter().any(|m| m[..] == [0x97, 0x40, 0x00]),
            "{name}: {lit:02X?}"
        );
        for m in lit.iter().filter(|m| m.len() == 3) {
            assert!(
                list.rows
                    .iter()
                    .any(|r| (r.status, r.data1) == (m[0], m[1]) && r.dir != Dir::In),
                "{name} has no light at {:02X} {:02X}",
                m[0],
                m[1]
            );
        }
    }
}

/// With no page known, every pad mode's pads played hot cues.
#[test]
fn each_pad_mode_plays_its_own_page() {
    for name in NAMES {
        let s = state();
        let mut map = keyboard(name, &s);
        let hot = |a: &[Action]| {
            a.iter()
                .any(|a| matches!(a, Action::Engine(Command::HotCuePress { .. })))
        };
        assert!(hot(&map.handle(&[0x97, 0x00, 0x7F], &s)), "{name}");
        for mode in 1..8u8 {
            let out = map.handle(&[0x97, mode << 4, 0x7F], &s);
            assert!(!hot(&out), "{name}, mode {mode}: {out:?}");
        }
    }
}
