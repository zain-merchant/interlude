//! Every mapping that has a manufacturer MIDI list in `official/` must agree
//! with it exactly: no messages the controller doesn't send, no LEDs it
//! doesn't have, no control bound to the wrong thing.

use std::path::Path;

use dj_controller::mixxx::Preset;
use dj_controller::official::{check, Table};

#[test]
fn mappings_match_official_midi_lists() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut failures = vec![];
    let mut checked = 0;
    let mut tables: Vec<_> = std::fs::read_dir(root.join("official"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "tsv"))
        .collect();
    tables.sort();
    for path in tables {
        let stem = path.file_stem().unwrap().to_string_lossy().into_owned();
        let table = Table::load(&path).unwrap();
        assert!(!table.source.is_empty(), "{stem}: no # source: line");
        let xml = root.join("mappings").join(format!("{stem}.midi.xml"));
        let preset = Preset::load(&xml).unwrap_or_else(|e| panic!("{stem}: {e}"));
        let report = check(&table, &preset);
        checked += 1;
        for p in report.problems() {
            failures.push(format!("{stem}: {p}"));
        }
    }
    assert!(checked > 0, "no official lists found");
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

/// The built-in DDJ-FLX4 mapping is Rust, not a Mixxx file: every message it
/// acts on and every LED it lights must be in Pioneer's list.
#[test]
fn built_in_flx4_matches_official_midi_list() {
    use dj_controller::official::Dir;
    use dj_controller::{flx4::Flx4, Mapping, State};

    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let table = Table::load(&root.join("official/Pioneer-DDJ-FLX4.tsv")).unwrap();
    let official = |dir: Dir| -> std::collections::BTreeSet<(u8, u8)> {
        table
            .rows
            .iter()
            .filter(|r| r.dir == dir || r.dir == Dir::Both)
            .map(|r| (r.status, r.data1))
            .collect()
    };
    let (ins, outs) = (official(Dir::In), official(Dir::Out));

    let mut problems = vec![];
    let state = State::default();
    for status in (0x90..=0x9F).chain(0xB0..=0xBF) {
        for data1 in 0..0x80u8 {
            let mut m = Flx4::new();
            let mut acted = !m.handle(&[status, data1, 0x7F], &state).is_empty();
            acted |= !m.handle(&[status, data1, 0x00], &state).is_empty();
            if acted && !ins.contains(&(status, data1)) {
                problems.push(format!(
                    "acts on {status:02X} {data1:02X}, which the FLX4 never sends"
                ));
            }
        }
    }

    let mut playing = State::default();
    for d in playing.decks.iter_mut() {
        d.loaded = true;
        d.playing = true;
    }
    let mut m = Flx4::new();
    for s in [&state, &playing, &state] {
        for msg in m.leds(s) {
            if msg.len() == 3 && !outs.contains(&(msg[0], msg[1])) {
                problems.push(format!(
                    "lights {:02X} {:02X}, which isn't an FLX4 LED",
                    msg[0], msg[1]
                ));
            }
        }
    }
    problems.sort();
    problems.dedup();
    assert!(problems.is_empty(), "\n{}", problems.join("\n"));
}
