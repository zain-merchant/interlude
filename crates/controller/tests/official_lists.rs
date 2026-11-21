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
