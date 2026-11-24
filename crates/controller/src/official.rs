//! Checking mappings against the manufacturers' published MIDI lists.
//!
//! Each file in `official/` is one controller's MIDI message list, typed in
//! from the manufacturer's own document (the source is named at the top of
//! the file). A row is one message the controller sends or receives:
//!
//! ```text
//! # dir  status  data1  control            expect
//! in     90      0B     DECK1 PLAY/PAUSE   [Channel1] play
//! out    90      0B     DECK1 PLAY/PAUSE LED
//! ```
//!
//! `dir` is `in` (the controller sends it), `out` (it lights something) or
//! `both`. `status` and `data1` are hex. `expect`, where given, is what the
//! control must be bound to: a `[group]` and one or more keys separated by
//! `|`, and several of those separated by `;`. Bindings to script functions
//! can't be checked this way and are counted separately.
//!
//! A few mappings listen to messages a manufacturer's list leaves out or
//! gets wrong (a known misprint, a section missing from the document).
//! Those are kept as `extra-in`, `extra-out` or `extra-both` rows, with the
//! reason in place of the control name, so every exception is written down:
//!
//! ```text
//! extra-in   95  05  deck B + SHIFT: the list repeats deck A's channel
//! ```
//!
//! [`check`] compares a Mixxx mapping with its table: messages the mapping
//! listens to that the controller never sends, LEDs it lights that don't
//! exist, and controls bound to the wrong thing.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use crate::mixxx::Preset;

/// Which way a message goes, seen from the controller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dir {
    In,
    Out,
    Both,
}

/// One message in a controller's official list.
#[derive(Debug, Clone)]
pub struct Row {
    pub dir: Dir,
    /// Not in the manufacturer's list; kept for the reason in `control`.
    pub extra: bool,
    pub status: u8,
    pub data1: u8,
    /// The control's name in the manufacturer's list.
    pub control: String,
    /// What the control must be bound to: `(group, keys)`; empty if not
    /// checked.
    pub expect: Vec<(String, Vec<String>)>,
    pub line: usize,
}

/// One controller's official MIDI list.
#[derive(Debug, Clone, Default)]
pub struct Table {
    /// The `# source:` line: where the list comes from.
    pub source: String,
    pub rows: Vec<Row>,
}

/// Note off arrives as note off or as note on with velocity 0; a mapping
/// may bind either, and the list gives note on. Both count as the same
/// message.
///
/// Pitch bend has no control number (both data bytes are the value), so
/// any data1 counts as the same message.
fn address(status: u8, data1: u8) -> (u8, u8) {
    match status & 0xF0 {
        0x80 => (0x90 | (status & 0x0F), data1),
        0xE0 => (status, 0),
        _ => (status, data1),
    }
}

/// Mixxx keeps old names for some controls working; a binding by the old
/// name is the same control.
fn canonical(group: &str, key: &str) -> (String, String) {
    let eq = |param: &str| {
        (
            format!("[EqualizerRack1_{group}_Effect1]"),
            param.to_owned(),
        )
    };
    match (group, key) {
        (g, "filterHigh") if g.starts_with("[Channel") => eq("parameter3"),
        (g, "filterMid") if g.starts_with("[Channel") => eq("parameter2"),
        (g, "filterLow") if g.starts_with("[Channel") => eq("parameter1"),
        (_, "reloop_exit") => (group.to_owned(), "reloop_toggle".to_owned()),
        ("[Playlist]", "SelectTrackKnob") => ("[Library]".to_owned(), "MoveVertical".to_owned()),
        _ => (group.to_owned(), key.to_owned()),
    }
}

fn hex(s: &str) -> Option<u8> {
    u8::from_str_radix(s.trim().trim_start_matches("0x"), 16).ok()
}

impl Table {
    pub fn load(path: &Path) -> Result<Table, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        Table::parse(&text).map_err(|e| format!("{}: {e}", path.display()))
    }

    pub fn parse(text: &str) -> Result<Table, String> {
        let mut t = Table::default();
        for (i, raw) in text.lines().enumerate() {
            let line = i + 1;
            if let Some(c) = raw.trim().strip_prefix('#') {
                if let Some(src) = c.trim().strip_prefix("source:") {
                    t.source = src.trim().to_owned();
                }
                continue;
            }
            if raw.trim().is_empty() {
                continue;
            }
            let cols: Vec<&str> = raw.split('\t').map(str::trim).collect();
            if cols.len() < 4 {
                return Err(format!(
                    "line {line}: expected at least 4 tab-separated columns"
                ));
            }
            let (extra, d) = match cols[0].strip_prefix("extra-") {
                Some(d) => (true, d),
                None => (false, cols[0]),
            };
            let dir = match d {
                "in" => Dir::In,
                "out" => Dir::Out,
                "both" => Dir::Both,
                d => return Err(format!("line {line}: unknown direction {d:?}")),
            };
            let status = hex(cols[1]).ok_or(format!("line {line}: bad status {:?}", cols[1]))?;
            let data1 = hex(cols[2])
                .filter(|d| *d < 0x80)
                .ok_or(format!("line {line}: bad data1 {:?}", cols[2]))?;
            let mut expect = vec![];
            if let Some(e) = cols.get(4).filter(|e| !e.is_empty()) {
                for part in e.split(';') {
                    let part = part.trim();
                    // Groups nest brackets ("[EqualizerRack1_[Channel1]_Effect1]")
                    // but never hold spaces, so the group ends at the first one.
                    let (group, keys) = part
                        .split_once(char::is_whitespace)
                        .filter(|(g, _)| g.starts_with('[') && g.ends_with(']'))
                        .ok_or(format!("line {line}: expect must look like [Group] key"))?;
                    let keys = keys.split('|').map(|k| k.trim().to_owned()).collect();
                    expect.push((group.to_owned(), keys));
                }
            }
            if extra && cols[3].is_empty() {
                return Err(format!("line {line}: an extra row needs a reason"));
            }
            t.rows.push(Row {
                dir,
                extra,
                status,
                data1,
                control: cols[3].to_owned(),
                expect,
                line,
            });
        }
        if t.rows.is_empty() {
            return Err("no rows".into());
        }
        Ok(t)
    }

    fn inputs(&self) -> impl Iterator<Item = &Row> {
        self.rows.iter().filter(|r| r.dir != Dir::Out)
    }

    fn outputs(&self) -> impl Iterator<Item = &Row> {
        self.rows.iter().filter(|r| r.dir != Dir::In)
    }
}

/// How a mapping compares with its controller's official list.
#[derive(Debug, Clone, Default)]
pub struct Report {
    /// Messages the controller sends, per the list.
    pub official_inputs: usize,
    /// `extra-` rows: messages kept although the list leaves them out.
    pub extras: usize,
    /// Of those, the ones the mapping binds.
    pub bound: usize,
    /// Bound to what the list says (rows with an `expect`).
    pub correct: usize,
    /// Rows with an `expect` that are bound only to script functions.
    pub scripted: usize,
    /// Messages the mapping listens to that the controller never sends:
    /// `(status, data1, "[group] key")`.
    pub unknown_inputs: Vec<(u8, u8, String)>,
    /// LEDs the mapping lights that the controller doesn't have.
    pub unknown_outputs: Vec<(u8, u8, String)>,
    /// Bound to something other than the list says: `(row, what it's
    /// bound to)`.
    pub wrong: Vec<(Row, Vec<String>)>,
    /// Official messages nothing is bound to.
    pub unbound: Vec<Row>,
}

impl Report {
    /// No message or binding that disagrees with the official list.
    pub fn is_exact(&self) -> bool {
        self.unknown_inputs.is_empty() && self.unknown_outputs.is_empty() && self.wrong.is_empty()
    }

    /// Problems, one per line, for people.
    pub fn problems(&self) -> Vec<String> {
        let mut out = vec![];
        for (s, d, what) in &self.unknown_inputs {
            out.push(format!(
                "listens to {s:02X} {d:02X} ({what}), which the controller never sends"
            ));
        }
        for (s, d, what) in &self.unknown_outputs {
            out.push(format!(
                "lights {s:02X} {d:02X} ({what}), which isn't an LED on the controller"
            ));
        }
        for (row, got) in &self.wrong {
            let want: Vec<String> = row
                .expect
                .iter()
                .map(|(g, k)| format!("{g} {}", k.join("|")))
                .collect();
            out.push(format!(
                "{:02X} {:02X} {}: bound to {}, should be {}",
                row.status,
                row.data1,
                row.control,
                got.join(", "),
                want.join("; ")
            ));
        }
        out
    }
}

/// Compares `preset` with the controller's official list.
pub fn check(table: &Table, preset: &Preset) -> Report {
    let mut r = Report::default();
    let official_in: BTreeSet<(u8, u8)> = table
        .inputs()
        .map(|row| address(row.status, row.data1))
        .collect();
    let official_out: BTreeSet<(u8, u8)> = table
        .outputs()
        .map(|row| address(row.status, row.data1))
        .collect();

    let mut bindings: BTreeMap<(u8, u8), Vec<&crate::mixxx::Input>> = BTreeMap::new();
    for (s, d, input) in preset.inputs_with_midi() {
        bindings.entry(address(s, d)).or_default().push(input);
    }
    for (&(s, d), inputs) in &bindings {
        if !official_in.contains(&(s, d)) {
            for i in inputs {
                r.unknown_inputs
                    .push((s, d, format!("{} {}", i.group, i.key)));
            }
        }
    }
    let mut seen_out = BTreeSet::new();
    for o in &preset.outputs {
        let (s, d) = o.midi();
        let a = address(s, d);
        if !official_out.contains(&a) && seen_out.insert((a, o.key.clone())) {
            r.unknown_outputs
                .push((a.0, a.1, format!("{} {}", o.group, o.key)));
        }
    }

    r.extras = table.rows.iter().filter(|row| row.extra).count();
    let mut counted = BTreeSet::new();
    for row in table.inputs().filter(|row| !row.extra) {
        let a = address(row.status, row.data1);
        if !counted.insert((a, row.control.clone())) {
            continue;
        }
        r.official_inputs += 1;
        let Some(inputs) = bindings.get(&a) else {
            r.unbound.push(row.clone());
            continue;
        };
        r.bound += 1;
        if row.expect.is_empty() {
            continue;
        }
        let plain: Vec<_> = inputs.iter().filter(|i| !i.is_script()).collect();
        if plain.is_empty() {
            r.scripted += 1;
            continue;
        }
        let ok = plain.iter().all(|i| {
            let (group, key) = canonical(&i.group, &i.key);
            row.expect.iter().any(|(g, keys)| {
                keys.iter()
                    .any(|k| canonical(g, k) == (group.clone(), key.clone()))
            })
        });
        if ok {
            r.correct += 1;
        } else {
            let got = plain
                .iter()
                .map(|i| format!("{} {}", i.group, i.key))
                .collect();
            r.wrong.push((row.clone(), got));
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    const TABLE: &str = "# source: test\n\
        in\t90\t0B\tDECK1 PLAY\t[Channel1] play\n\
        both\t90\t0C\tDECK1 CUE\t[Channel1] cue_default\n\
        in\tB0\t13\tDECK1 VOLUME\n";

    fn preset(controls: &str, outputs: &str) -> Preset {
        Preset::parse(&format!(
            "<MixxxControllerPreset><info><name>T</name></info><controller id=\"T\">\
             <controls>{controls}</controls><outputs>{outputs}</outputs>\
             </controller></MixxxControllerPreset>"
        ))
        .unwrap()
    }

    fn control(group: &str, key: &str, status: u8, no: u8) -> String {
        format!(
            "<control><group>{group}</group><key>{key}</key>\
             <status>0x{status:02X}</status><midino>0x{no:02X}</midino></control>"
        )
    }

    #[test]
    fn parses_rows_and_source() {
        let t = Table::parse(TABLE).unwrap();
        assert_eq!(t.source, "test");
        assert_eq!(t.rows.len(), 3);
        assert_eq!(
            t.rows[0].expect,
            vec![("[Channel1]".into(), vec!["play".into()])]
        );
        assert_eq!(t.rows[1].dir, Dir::Both);
    }

    #[test]
    fn extra_rows_are_allowed_but_need_a_reason() {
        assert!(Table::parse("extra-in\t95\t05\t").is_err());
        let t = Table::parse("in\t90\t0B\tPLAY\nextra-in\t95\t05\tmisprint").unwrap();
        let p = preset(&control("[Channel2]", "play", 0x95, 0x05), "");
        let r = check(&t, &p);
        assert!(r.is_exact(), "{:?}", r.problems());
        assert_eq!((r.official_inputs, r.extras), (1, 1));
    }

    #[test]
    fn old_names_and_pitch_bend_match() {
        let t = Table::parse(
            "in\tB0\t07\tEQ HI\t[EqualizerRack1_[Channel1]_Effect1] parameter3\n\
             in\tE0\t00\tPITCH\t[Channel1] rate",
        )
        .unwrap();
        let p = preset(
            &[
                control("[Channel1]", "filterHigh", 0xB0, 0x07),
                control("[Channel1]", "rate", 0xE0, 0x50),
            ]
            .concat(),
            "",
        );
        let r = check(&t, &p);
        assert!(r.is_exact(), "{:?}", r.problems());
        assert_eq!(r.correct, 2);
    }

    #[test]
    fn groups_may_nest_brackets() {
        let t = Table::parse(
            "in\tB0\t07\tEQ HI\t[EqualizerRack1_[Channel1]_Effect1] parameter3; [Master] crossfader",
        )
        .unwrap();
        assert_eq!(
            t.rows[0].expect,
            vec![
                (
                    "[EqualizerRack1_[Channel1]_Effect1]".into(),
                    vec!["parameter3".into()]
                ),
                ("[Master]".into(), vec!["crossfader".into()]),
            ]
        );
    }

    #[test]
    fn exact_mapping_passes() {
        let t = Table::parse(TABLE).unwrap();
        let p = preset(
            &[
                control("[Channel1]", "play", 0x90, 0x0B),
                control("[Channel1]", "cue_default", 0x90, 0x0C),
                control("[Channel1]", "cue_default", 0x80, 0x0C),
                control("[Channel1]", "volume", 0xB0, 0x13),
            ]
            .concat(),
            "",
        );
        let r = check(&t, &p);
        assert!(r.is_exact(), "{:?}", r.problems());
        assert_eq!((r.official_inputs, r.bound, r.correct), (3, 3, 2));
    }

    #[test]
    fn finds_wrong_unknown_and_unbound() {
        let t = Table::parse(TABLE).unwrap();
        let p = preset(
            &[
                control("[Channel1]", "cue_default", 0x90, 0x0B),
                control("[Channel1]", "sync_enabled", 0x90, 0x7E),
            ]
            .concat(),
            "<output><group>[Channel1]</group><key>play</key>\
             <status>0x90</status><midino>0x0B</midino></output>",
        );
        let r = check(&t, &p);
        assert_eq!(r.wrong.len(), 1);
        assert_eq!(r.unknown_inputs.len(), 1);
        assert_eq!(r.unknown_outputs.len(), 1, "0B is an input only");
        assert_eq!(r.unbound.len(), 2);
        assert!(!r.is_exact());
    }
}
