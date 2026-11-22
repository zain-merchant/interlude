//! Mixxx controller mappings: MIDI (`*.midi.xml`) and HID (`*.hid.xml`).
//!
//! A Mixxx mapping binds MIDI messages to Mixxx controls such as
//! `[Channel1] play`, with options for how the value is read (14-bit
//! pairs, relative encoders, soft takeover), and binds controls back to
//! MIDI messages for the LEDs. [`Preset::parse`] reads the file and
//! [`MixxxMidi`] runs it as a [`Mapping`], following Mixxx's own handling
//! (`MidiController::processInputMapping` and `MidiOutputHandler`) so a
//! mapping behaves here as it does in Mixxx.
//!
//! Bindings to script functions (`<script-binding/>`) call into the
//! mapping's JavaScript, run by [`crate::script`]. [`Preset::coverage`]
//! says how much of a mapping's direct bindings work.
//!
//! A HID mapping has no bindings: every report the device sends goes to
//! the script's `incomingData`, and the script sends reports back.
//! [`crate::hid`] connects those to the device.
//!
//! Mixxx mappings are GPL-2.0-or-later, which Interlude's GPL-3.0-or-later
//! licence is compatible with.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::controls::{Control, Controls};
use crate::script::{Script, Setting};
use crate::{Action, Mapping, State};

// MIDI options, as Mixxx's `MidiOption` flags.
const INVERT: u16 = 1 << 0;
const ROT64: u16 = 1 << 1;
const ROT64_INV: u16 = 1 << 2;
const ROT64_FAST: u16 = 1 << 3;
const DIFF: u16 = 1 << 4;
const BUTTON: u16 = 1 << 5;
const SWITCH: u16 = 1 << 6;
const SPREAD64: u16 = 1 << 7;
const HERC_JOG: u16 = 1 << 8;
const SELECT_KNOB: u16 = 1 << 9;
const SOFT_TAKEOVER: u16 = 1 << 10;
const SCRIPT: u16 = 1 << 11;
const MSB: u16 = 1 << 12;
const LSB: u16 = 1 << 13;
const HERC_JOG_FAST: u16 = 1 << 14;

/// How far a knob may be from the control's value and still take it over
/// with soft takeover on, as a fraction of its travel (Mixxx's threshold).
const TAKEOVER_THRESHOLD: f64 = 3.0 / 128.0;

/// One `<control>`: an incoming MIDI message bound to a control.
#[derive(Debug, Clone)]
pub struct Input {
    pub group: String,
    pub key: String,
    /// `None` for a script binding or a control our engine doesn't have.
    pub control: Option<Control>,
    options: u16,
}

impl Input {
    pub fn is_script(&self) -> bool {
        self.options & SCRIPT != 0
    }

    /// The binding's main option, as its XML tag ("normal" for none).
    pub fn option_name(&self) -> &'static str {
        let o = self.options;
        [
            (SCRIPT, "script-binding"),
            (MSB, "fourteen-bit-msb"),
            (LSB, "fourteen-bit-lsb"),
            (SELECT_KNOB, "selectknob"),
            (DIFF, "diff"),
            (SPREAD64, "spread64"),
            (ROT64, "rot64"),
            (BUTTON, "button"),
            (INVERT, "invert"),
        ]
        .into_iter()
        .find(|(bit, _)| o & bit != 0)
        .map_or("normal", |(_, name)| name)
    }
}

/// One `<output>`: a control shown on an LED.
#[derive(Debug, Clone)]
pub struct Output {
    pub group: String,
    pub key: String,
    pub control: Option<Control>,
    status: u8,
    midino: u8,
    on: u8,
    off: u8,
    min: f64,
    max: f64,
}

impl Output {
    /// The status byte and number the LED message is sent with.
    pub fn midi(&self) -> (u8, u8) {
        (self.status, self.midino)
    }
}

/// A script file the mapping loads, and the object its functions hang off.
#[derive(Debug, Clone)]
pub struct ScriptFile {
    pub filename: String,
    pub prefix: String,
}

/// A USB HID device a Mixxx HID mapping is for. Fields left out of the
/// mapping match any device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HidProduct {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: Option<u16>,
    pub usage: Option<u16>,
    pub interface_number: Option<i32>,
}

/// What the system says about a HID device, to match against
/// [`HidProduct`]s.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct HidDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub usage: u16,
    /// -1 where the system doesn't say (macOS and Windows, often).
    pub interface_number: i32,
}

impl HidProduct {
    pub fn matches(&self, d: &HidDevice) -> bool {
        self.vendor_id == d.vendor_id
            && self.product_id == d.product_id
            && self.usage_page.is_none_or(|u| u == d.usage_page)
            && self.usage.is_none_or(|u| u == d.usage)
            // Mixxx matches on the interface only where the system reports it.
            && self
                .interface_number
                .is_none_or(|i| d.interface_number < 0 || i == d.interface_number)
    }
}

/// A parsed Mixxx mapping file (MIDI or HID).
#[derive(Debug, Clone)]
pub struct Preset {
    /// The mapping's name, e.g. "Pioneer DDJ-400".
    pub name: String,
    /// The `<controller id>`, usually the model.
    pub id: String,
    pub path: Option<PathBuf>,
    inputs: HashMap<(u8, u8), Vec<Input>>,
    pub outputs: Vec<Output>,
    pub scripts: Vec<ScriptFile>,
    /// The mapping's `<settings>`, at their defaults.
    pub settings: Vec<(String, Setting)>,
    /// Other folders to look for script files in (shared libraries such as
    /// Mixxx's `common-controller-scripts.js`).
    pub script_dirs: Vec<PathBuf>,
    /// Port names matching these (normalised) belong to the controller.
    match_names: Vec<String>,
    /// Made with MIDI learn for one port: matches that port name only.
    exact: bool,
    /// For a HID mapping, the devices it's for. A HID mapping does
    /// everything in script and never matches a MIDI port.
    pub hid: Vec<HidProduct>,
    /// From a `.hid.xml` file. Some name no devices (Mixxx has the user
    /// pick one), so they're never connected automatically.
    hid_file: bool,
}

/// How much of a mapping works here.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Coverage {
    /// Bindings to controls (not scripts).
    pub controls: usize,
    /// Of those, the ones our engine has.
    pub supported: usize,
    /// Bindings to script functions, not run yet.
    pub scripted: usize,
    pub outputs: usize,
    pub outputs_supported: usize,
    /// `[group] key` of each control we don't have, once each.
    pub missing: Vec<String>,
}

/// Parses a number as Qt's `toInt(&ok, 0)` does: `0x` hex, leading `0`
/// octal, otherwise decimal.
fn parse_int(s: &str) -> Option<i64> {
    let s = s.trim();
    let (neg, s) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let v = if let Some(h) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        i64::from_str_radix(h, 16).ok()?
    } else if s.len() > 1 && s.starts_with('0') {
        i64::from_str_radix(&s[1..], 8).ok()?
    } else {
        s.parse().ok()?
    };
    Some(if neg { -v } else { v })
}

fn byte(s: Option<&str>, default: u8) -> u8 {
    s.and_then(parse_int)
        .and_then(|v| u8::try_from(v).ok())
        .unwrap_or(default)
}

fn child<'a>(node: roxmltree::Node<'a, 'a>, name: &str) -> Option<roxmltree::Node<'a, 'a>> {
    node.children()
        .find(|c| c.is_element() && c.tag_name().name() == name)
}

fn text<'a>(node: roxmltree::Node<'a, 'a>, name: &str) -> Option<&'a str> {
    child(node, name).and_then(|c| c.text()).map(str::trim)
}

/// Lower case letters and digits only, for matching port names.
fn normalise(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Names too generic to identify a controller by.
const GENERIC: [&str; 6] = [
    "midi",
    "keyboard",
    "midikeyboard",
    "controller",
    "usb",
    "generic",
];

impl Preset {
    pub fn load(path: &Path) -> Result<Preset, String> {
        let xml = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let mut p = Preset::parse(&xml).map_err(|e| format!("{}: {e}", path.display()))?;
        if p.name.is_empty() {
            p.name = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| {
                    n.strip_suffix(".midi.xml")
                        .or_else(|| n.strip_suffix(".hid.xml"))
                })
                .unwrap_or("Mixxx mapping")
                .to_owned();
        }
        p.hid_file = path
            .to_string_lossy()
            .to_ascii_lowercase()
            .ends_with(".hid.xml");
        p.path = Some(path.to_owned());
        Ok(p)
    }

    pub fn parse(xml: &str) -> Result<Preset, String> {
        let opts = roxmltree::ParsingOptions {
            allow_dtd: true,
            ..Default::default()
        };
        let doc = roxmltree::Document::parse_with_options(xml, opts).map_err(|e| e.to_string())?;
        let root = doc.root_element();
        let name = child(root, "info")
            .and_then(|i| text(i, "name"))
            .unwrap_or("")
            .to_owned();
        let controller = child(root, "controller").ok_or("no <controller> element")?;
        let id = controller.attribute("id").unwrap_or("").trim().to_owned();

        let scripts = child(controller, "scriptfiles")
            .into_iter()
            .flat_map(|s| s.children().filter(|c| c.has_tag_name("file")))
            .map(|f| ScriptFile {
                filename: f.attribute("filename").unwrap_or("").to_owned(),
                prefix: f.attribute("functionprefix").unwrap_or("").to_owned(),
            })
            .collect();

        let settings = root
            .descendants()
            .filter(|n| n.has_tag_name("option"))
            .filter_map(|o| Some((o.attribute("variable")?.to_owned(), setting(o))))
            .collect();

        let mut inputs: HashMap<(u8, u8), Vec<Input>> = HashMap::new();
        for c in child(controller, "controls")
            .into_iter()
            .flat_map(|cs| cs.children().filter(|c| c.has_tag_name("control")))
        {
            let status = byte(text(c, "status"), 0);
            let midino = byte(text(c, "midino"), 0);
            let group = text(c, "group").unwrap_or("").to_owned();
            let key = text(c, "key").unwrap_or("").to_owned();
            let mut options = 0;
            for o in child(c, "options")
                .into_iter()
                .flat_map(|o| o.children().filter(|n| n.is_element()))
            {
                options |= match o.tag_name().name().to_ascii_lowercase().as_str() {
                    "invert" => INVERT,
                    "rot64" => ROT64,
                    "rot64inv" => ROT64_INV,
                    "rot64fast" => ROT64_FAST,
                    "diff" => DIFF,
                    "button" => BUTTON,
                    "switch" => SWITCH,
                    "hercjog" => HERC_JOG,
                    "hercjogfast" => HERC_JOG_FAST,
                    "spread64" => SPREAD64,
                    "selectknob" => SELECT_KNOB,
                    "soft-takeover" => SOFT_TAKEOVER,
                    "script-binding" => SCRIPT,
                    "fourteen-bit-msb" => MSB,
                    "fourteen-bit-lsb" => LSB,
                    _ => 0,
                };
            }
            let control = if options & SCRIPT != 0 {
                None
            } else {
                Control::parse(&group, &key)
            };
            inputs.entry((status, midino)).or_default().push(Input {
                group,
                key,
                control,
                options,
            });
        }

        let outputs = child(controller, "outputs")
            .into_iter()
            .flat_map(|os| os.children().filter(|c| c.has_tag_name("output")))
            .map(|o| {
                let group = text(o, "group").unwrap_or("").to_owned();
                let key = text(o, "key").unwrap_or("").to_owned();
                let num = |name| text(o, name).and_then(|t| t.parse::<f64>().ok());
                Output {
                    control: Control::parse(&group, &key),
                    group,
                    key,
                    status: byte(text(o, "status"), 0),
                    midino: byte(text(o, "midino"), 0),
                    on: byte(text(o, "on"), 0x7F),
                    off: byte(text(o, "off"), 0x00),
                    min: num("minimum").unwrap_or(0.0),
                    max: num("maximum").unwrap_or(1.0),
                }
            })
            .collect();

        let num16 = |n: roxmltree::Node, a: &str| {
            n.attribute(a)
                .and_then(|v| u16::try_from(parse_int(v)?).ok())
        };
        let hid = child(root, "info")
            .and_then(|i| child(i, "devices"))
            .into_iter()
            .flat_map(|d| d.children().filter(|c| c.has_tag_name("product")))
            .filter(|p| {
                p.attribute("protocol")
                    .is_some_and(|v| v.eq_ignore_ascii_case("hid"))
            })
            .filter_map(|p| {
                Some(HidProduct {
                    vendor_id: num16(p, "vendor_id")?,
                    product_id: num16(p, "product_id")?,
                    usage_page: num16(p, "usage_page"),
                    usage: num16(p, "usage"),
                    interface_number: p
                        .attribute("interface_number")
                        .and_then(parse_int)
                        .and_then(|i| i32::try_from(i).ok()),
                })
            })
            .collect();
        let author = child(root, "info").and_then(|i| text(i, "author"));
        let exact = author == Some(crate::learn::AUTHOR);
        let mut match_names = vec![normalise(&name)];
        // Mapping names usually lead with the brand, which port names often
        // leave out: "Pioneer DDJ-400" vs a port called "DDJ-400".
        if let Some((_, model)) = name.split_once(' ') {
            match_names.push(normalise(model));
        }
        // Controller ids are often just a brand ("Reloop") or a word
        // ("Network"); only a model number is worth matching on.
        if id.chars().any(|c| c.is_ascii_digit()) {
            match_names.push(normalise(&id));
        }
        match_names.retain(|n| n.len() >= 4 && !GENERIC.contains(&n.as_str()));
        match_names.dedup();

        Ok(Preset {
            name,
            id,
            path: None,
            inputs,
            outputs,
            scripts,
            settings,
            script_dirs: vec![],
            match_names,
            exact,
            hid,
            hid_file: false,
        })
    }

    /// Whether a MIDI port with this name looks like this mapping's
    /// controller.
    pub fn matches(&self, port_name: &str) -> bool {
        self.match_len(port_name).is_some()
    }

    /// How specific the match with this port name is: the length of the
    /// longest of the mapping's names found in it. When several mappings
    /// match, the most specific wins, so "Mixtrack Platinum FX" beats
    /// "Mixtrack".
    /// A HID mapping, for the devices in [`Self::hid`].
    pub fn is_hid(&self) -> bool {
        self.hid_file || !self.hid.is_empty()
    }

    /// Whether this HID mapping is for `device`.
    pub fn matches_hid(&self, device: &HidDevice) -> bool {
        self.hid.iter().any(|p| p.matches(device))
    }

    /// Made with MIDI learn for one port, and only for that port.
    pub fn is_exact(&self) -> bool {
        self.exact
    }

    pub fn match_len(&self, port_name: &str) -> Option<usize> {
        if self.is_hid() {
            return None;
        }
        let port = normalise(port_name);
        if self.exact {
            return (self.match_names.first() == Some(&port)).then_some(port.len());
        }
        self.match_names
            .iter()
            .filter(|n| port.contains(n.as_str()))
            .map(String::len)
            .max()
    }

    pub fn inputs(&self) -> impl Iterator<Item = &Input> {
        self.inputs.values().flatten()
    }

    /// Every binding with the status byte and number it listens to.
    pub fn inputs_with_midi(&self) -> impl Iterator<Item = (u8, u8, &Input)> {
        self.inputs
            .iter()
            .flat_map(|(&(s, n), v)| v.iter().map(move |i| (s, n, i)))
    }

    pub fn coverage(&self) -> Coverage {
        let mut c = Coverage::default();
        let mut missing = std::collections::BTreeSet::new();
        for i in self.inputs() {
            if i.is_script() {
                c.scripted += 1;
            } else {
                c.controls += 1;
                if i.control.is_some() {
                    c.supported += 1;
                } else {
                    missing.insert(format!("{} {}", i.group, i.key));
                }
            }
        }
        for o in &self.outputs {
            c.outputs += 1;
            if o.control.is_some() {
                c.outputs_supported += 1;
            } else {
                missing.insert(format!("{} {}", o.group, o.key));
            }
        }
        c.missing = missing.into_iter().collect();
        c
    }
}

/// A `<settings>` option's default value.
fn setting(o: roxmltree::Node) -> Setting {
    let default = o.attribute("default").unwrap_or("");
    match o.attribute("type").unwrap_or("") {
        "boolean" => Setting::Bool(default == "true"),
        "integer" | "real" => Setting::Number(default.parse().unwrap_or(0.0)),
        "enum" => {
            let values: Vec<_> = o.children().filter(|c| c.has_tag_name("value")).collect();
            let chosen = values
                .iter()
                .find(|v| v.attribute("default") == Some("true"))
                .or(values.first());
            Setting::Text(
                chosen
                    .and_then(|v| v.text())
                    .unwrap_or("")
                    .trim()
                    .to_owned(),
            )
        }
        _ => Setting::Text(default.to_owned()),
    }
}

/// A Mixxx MIDI mapping running against our engine.
pub struct MixxxMidi {
    preset: std::sync::Arc<Preset>,
    /// The mapping's scripts, if it has any and they loaded.
    script: Option<Script>,
    /// Engine state last seen, for the scripts' shutdown.
    last_state: State,
    controls: Controls,
    /// The first half of 14-bit pairs, waiting for the other: the control,
    /// whether it was the MSB, and its value.
    halves: Vec<(Control, bool, u8)>,
    /// Soft takeover: the knob position each control last received.
    knob: HashMap<Control, f64>,
    /// Byte last sent to each output.
    sent: Vec<Option<u8>>,
}

impl MixxxMidi {
    pub fn new(preset: std::sync::Arc<Preset>) -> Self {
        let n = preset.outputs.len();
        let script = load_script(&preset);
        let mut controls = Controls::new();
        // MIDI learn binds a pitch fader as it comes, and most send 0 at
        // the top, which should be the slower end.
        if preset.exact {
            controls.set_rate_dir(1.0);
        }
        Self {
            script,
            last_state: State::default(),
            preset,
            controls,
            halves: vec![],
            knob: HashMap::new(),
            sent: vec![None; n],
        }
    }

    pub fn preset(&self) -> &Preset {
        &self.preset
    }

    /// Whether the mapping's scripts are running.
    /// Connects the scripts to a HID device: see [`Script::set_hid`].
    pub fn set_hid(&mut self, reader: crate::script::ReportReader) {
        if let Some(s) = &mut self.script {
            s.set_hid(reader);
        }
    }

    /// HID reports the scripts sent since the last call.
    pub fn take_hid(&mut self) -> Vec<crate::script::HidOut> {
        self.script
            .as_mut()
            .map(Script::take_hid)
            .unwrap_or_default()
    }

    pub fn has_script(&self) -> bool {
        self.script.is_some()
    }

    /// Errors the mapping's scripts have raised.
    pub fn script_errors(&self) -> Vec<String> {
        self.script.as_ref().map(Script::errors).unwrap_or_default()
    }

    /// Runs the scripts' `init` the first time it's needed.
    fn started(&mut self, state: &State) -> Vec<Action> {
        self.last_state = *state;
        let id = self.preset.id.clone();
        match &mut self.script {
            Some(s) => s.start(&id, state),
            None => vec![],
        }
    }

    /// Soft takeover: whether a knob now at `param` should be ignored
    /// because it hasn't reached the control's value yet.
    fn ignore(&mut self, c: Control, param: f64, state: &State) -> bool {
        let b = c.behavior();
        let current = b.value_to_parameter(self.controls.get(c, state));
        let prev = self.knob.insert(c, param);
        if (param - current).abs() <= TAKEOVER_THRESHOLD {
            return false;
        }
        // Moved across the control's value since the last message.
        let crossed = prev.is_some_and(|p| (p - current) * (param - current) <= 0.0);
        !crossed
    }

    fn input(
        &mut self,
        input: &Input,
        status: u8,
        number: u8,
        value: u8,
        state: &State,
    ) -> Vec<Action> {
        if input.is_script() {
            return match &mut self.script {
                Some(s) => s.binding(&input.key, &input.group, status, number, value, state),
                None => vec![],
            };
        }
        let Some(c) = input.control else {
            return vec![];
        };
        let opts = input.options;
        let kind = status & 0xF0;
        let mut note_off = kind == 0x80;

        let fourteen = opts & (MSB | LSB) != 0;
        if !fourteen {
            // A 14-bit half with no partner: Mixxx drops it.
            self.halves.clear();
        }
        let v = if fourteen {
            let is_msb = opts & MSB != 0;
            match self.halves.iter().position(|h| h.0 == c) {
                Some(i) => {
                    let (_, other_msb, other) = self.halves.remove(i);
                    if other_msb == is_msb {
                        return vec![];
                    }
                    let (msb, lsb) = if is_msb {
                        (value, other)
                    } else {
                        (other, value)
                    };
                    let joined = (u16::from(msb) << 7) | u16::from(lsb);
                    (f64::from(joined) / 128.0).min(127.0)
                }
                None => {
                    self.halves.push((c, is_msb, value));
                    return vec![];
                }
            }
        } else if kind == 0xE0 {
            let joined = (u16::from(value) << 7) | u16::from(number);
            (f64::from(joined) / 128.0).min(127.0)
        } else {
            let prev = self.controls.get_midi(c, state);
            compute_value(opts, prev, f64::from(value))
        };

        if opts & (BUTTON | SWITCH) != 0 {
            note_off = false;
        }
        if opts & SOFT_TAKEOVER != 0 {
            let b = c.behavior();
            if !b.is_pot() {
                return vec![];
            }
            if self.ignore(c, b.midi_to_parameter(v), state) {
                return vec![];
            }
        }
        self.controls.set_from_midi(c, v, note_off, state)
    }
}

/// Loads a mapping's scripts, if it lists any. A mapping whose scripts
/// can't be found or don't load still works through its direct bindings.
fn load_script(preset: &Preset) -> Option<Script> {
    if preset.scripts.is_empty() {
        return None;
    }
    let names: Vec<String> = preset.scripts.iter().map(|s| s.filename.clone()).collect();
    let dir = preset.path.as_deref().and_then(Path::parent);
    let loaded = crate::script::read_files(dir, &names, &preset.script_dirs).and_then(|files| {
        let prefixes = preset
            .scripts
            .iter()
            .map(|s| s.prefix.clone())
            .filter(|p| !p.is_empty())
            .collect();
        Script::load(&preset.name, &files, prefixes, &preset.settings)
    });
    match loaded {
        Ok(s) => Some(s),
        Err(e) => {
            eprintln!(
                "controller mapping {:?}: scripts not loaded: {e}",
                preset.name
            );
            None
        }
    }
}

/// Mixxx's `MidiController::computeValue`: applies a binding's options to
/// a 7-bit value. `prev` is the control's current position as MIDI.
fn compute_value(opts: u16, prev: f64, new: f64) -> f64 {
    let mut new = new;
    if opts == 0 {
        return new;
    }
    if opts & INVERT != 0 {
        new = 127.0 - new;
    }
    if opts & (ROT64 | ROT64_INV) != 0 {
        let mut diff = new - 64.0;
        if diff == -1.0 || diff == 1.0 {
            diff /= 16.0;
        } else {
            diff += if diff > 0.0 { -1.0 } else { 1.0 };
        }
        let v = if opts & ROT64 != 0 {
            prev + diff
        } else {
            prev - diff
        };
        v.clamp(0.0, 127.0)
    } else if opts & ROT64_FAST != 0 {
        (prev + (new - 64.0) * 1.5).clamp(0.0, 127.0)
    } else if opts & DIFF != 0 {
        if new >= 64.0 {
            new -= 128.0;
        }
        prev + new
    } else if opts & SELECT_KNOB != 0 {
        if new >= 64.0 {
            new -= 128.0;
        }
        new
    } else if opts & BUTTON != 0 {
        if new != 0.0 {
            1.0
        } else {
            0.0
        }
    } else if opts & SWITCH != 0 {
        1.0
    } else if opts & SPREAD64 != 0 {
        new - 64.0
    } else if opts & HERC_JOG != 0 {
        if new > 64.0 {
            new -= 128.0;
        }
        prev + new
    } else if opts & HERC_JOG_FAST != 0 {
        if new > 64.0 {
            new -= 128.0;
        }
        prev + new * 3.0
    } else {
        new
    }
}

impl Mapping for MixxxMidi {
    fn matches(&self, port_name: &str) -> bool {
        self.preset.matches(port_name)
    }

    fn handle(&mut self, msg: &[u8], state: &State) -> Vec<Action> {
        let Some(&status) = msg.first() else {
            return vec![];
        };
        let mut out = self.started(state);
        // System exclusive goes to the scripts' incomingData, and so does
        // everything from a HID controller; clock and other system
        // messages are dropped, as in Mixxx.
        if status == 0xF0 || self.preset.is_hid() {
            if let Some(s) = &mut self.script {
                out.extend(s.sysex(msg, state));
            }
            return out;
        }
        if !(0x80..0xF0).contains(&status) {
            return out;
        }
        let mut number = msg.get(1).copied().unwrap_or(0);
        if status < 0xA0 {
            if let Some(s) = &self.script {
                number = s.route(status & 0x0F, number);
            }
        }
        let value = msg.get(2).copied().unwrap_or(0);
        let preset = self.preset.clone();
        let Some(inputs) = preset.inputs.get(&(status, number)) else {
            return out;
        };
        for i in inputs {
            out.extend(self.input(i, status, number, value, state));
        }
        out
    }

    fn poll(&mut self, state: &State) -> Vec<Action> {
        let mut out = self.started(state);
        if let Some(s) = &mut self.script {
            out.extend(s.tick(state));
        }
        out
    }

    fn shutdown(&mut self, state: &State) {
        if let Some(s) = &mut self.script {
            s.stop(state);
        }
    }

    fn leds(&mut self, state: &State) -> Vec<Vec<u8>> {
        let mut out = match &mut self.script {
            Some(s) => s.take_midi(),
            None => vec![],
        };
        for (o, sent) in self.preset.outputs.iter().zip(&mut self.sent) {
            let Some(c) = o.control else { continue };
            let v = self.controls.get(c, state);
            let b = if v >= o.min && v <= o.max {
                o.on
            } else {
                o.off
            };
            // 0xFF means "send nothing" for this state.
            if b == 0xFF || *sent == Some(b) {
                continue;
            }
            *sent = Some(b);
            out.push(vec![o.status, o.midino, b]);
        }
        out
    }

    fn reset_leds(&mut self) {
        self.sent.fill(None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dj_engine::{Command, DeckId, EqBand};
    use std::sync::Arc;

    const XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<MixxxMIDIPreset schemaVersion="1" mixxxVersion="2.3">
  <info><name>Acme Mixer-2</name><author>test</author></info>
  <controller id="MIXER-2">
    <scriptfiles>
      <file functionprefix="Acme" filename="Acme-script.js"/>
    </scriptfiles>
    <controls>
      <control><group>[Channel1]</group><key>play</key>
        <status>0x90</status><midino>0x0B</midino><options><normal/></options></control>
      <control><group>[Channel1]</group><key>hotcue_1_activate</key>
        <status>0x90</status><midino>0x00</midino><options><normal/></options></control>
      <control><group>[Channel1]</group><key>hotcue_1_activate</key>
        <status>0x80</status><midino>0x00</midino><options><normal/></options></control>
      <control><group>[Channel1]</group><key>volume</key>
        <status>0xB0</status><midino>0x13</midino><options><fourteen-bit-msb/></options></control>
      <control><group>[Channel1]</group><key>volume</key>
        <status>0xB0</status><midino>0x33</midino><options><fourteen-bit-lsb/></options></control>
      <control><group>[EqualizerRack1_[Channel2]_Effect1]</group><key>parameter1</key>
        <status>0xB1</status><midino>0x0F</midino><options><soft-takeover/></options></control>
      <control><group>[Channel1]</group><key>rate</key>
        <status>0xB0</status><midino>0x00</midino><options><invert/></options></control>
      <control><group>[Library]</group><key>MoveVertical</key>
        <status>0xB6</status><midino>0x40</midino><options><selectknob/></options></control>
      <control><group>[Channel1]</group><key>Acme.jog</key>
        <status>0xB0</status><midino>0x21</midino><options><script-binding/></options></control>
      <control><group>[Channel3]</group><key>play</key>
        <status>0x92</status><midino>0x0B</midino><options><normal/></options></control>
      <control><group>[Channel1]</group><key>pfl</key>
        <status>0x90</status><midino>0x54</midino><options><button/></options></control>
    </controls>
    <outputs>
      <output><group>[Channel1]</group><key>play_indicator</key>
        <status>0x90</status><midino>0x0B</midino><minimum>0.5</minimum></output>
      <output><group>[Channel1]</group><key>hotcue_1_enabled</key>
        <status>0x97</status><midino>0x00</midino><on>0x7F</on><off>0x01</off><minimum>0.5</minimum></output>
    </outputs>
  </controller>
</MixxxMIDIPreset>"#;

    fn st() -> State {
        let mut s = State::default();
        for d in &mut s.decks {
            d.loaded = true;
            d.rate = 1.0;
            d.speed = 1.0;
            d.loop_beats = 4.0;
        }
        s
    }

    fn mapping() -> MixxxMidi {
        MixxxMidi::new(Arc::new(Preset::parse(XML).unwrap()))
    }

    fn cmds(a: Vec<Action>) -> Vec<Command> {
        a.into_iter()
            .filter_map(|a| match a {
                Action::Engine(c) => Some(c),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn parses_info_and_scripts() {
        let p = Preset::parse(XML).unwrap();
        assert_eq!(p.name, "Acme Mixer-2");
        assert_eq!(p.id, "MIXER-2");
        assert_eq!(p.scripts.len(), 1);
        assert_eq!(p.scripts[0].prefix, "Acme");
        assert_eq!(p.outputs.len(), 2);
    }

    #[test]
    fn coverage_counts_what_works() {
        let c = Preset::parse(XML).unwrap().coverage();
        assert_eq!(c.scripted, 1);
        assert_eq!(c.controls, 10);
        assert_eq!(c.supported, 9);
        assert_eq!(c.missing, vec!["[Channel3] play".to_owned()]);
        assert_eq!(c.outputs_supported, 2);
    }

    #[test]
    fn matches_port_names() {
        let p = Preset::parse(XML).unwrap();
        assert!(p.matches("MIXER-2 MIDI 1"));
        assert!(p.match_len("Acme Mixer-2").unwrap() > p.match_len("MIXER-2").unwrap());
        assert!(p.matches("Acme Mixer-2"));
        assert!(!p.matches("DDJ-FLX4"));
        assert!(!p.matches("IAC Driver Bus 1"));
    }

    #[test]
    fn generic_names_match_nothing() {
        let p = Preset::parse(
            r#"<MixxxMIDIPreset><info><name>MIDI Keyboard</name></info><controller id="MIDI"/></MixxxMIDIPreset>"#,
        )
        .unwrap();
        assert!(!p.matches("USB MIDI Keyboard"));
    }

    #[test]
    fn buttons_and_note_off() {
        let mut m = mapping();
        let s = st();
        assert!(matches!(
            cmds(m.handle(&[0x90, 0x0B, 0x7F], &s))[..],
            [Command::Play { deck: DeckId::A }]
        ));
        assert!(matches!(
            cmds(m.handle(&[0x90, 0x00, 0x7F], &s))[..],
            [Command::HotCuePress { index: 0, .. }]
        ));
        assert!(matches!(
            cmds(m.handle(&[0x80, 0x00, 0x40], &s))[..],
            [Command::HotCueRelease { index: 0, .. }]
        ));
    }

    #[test]
    fn button_option_toggles_once_per_press() {
        let mut m = mapping();
        let s = st();
        assert!(matches!(
            cmds(m.handle(&[0x90, 0x54, 0x7F], &s))[..],
            [Command::SetPfl { on: true, .. }]
        ));
        assert!(m.handle(&[0x90, 0x54, 0x00], &s).is_empty());
    }

    #[test]
    fn fourteen_bit_pairs() {
        let mut m = mapping();
        let s = st();
        assert!(m.handle(&[0xB0, 0x13, 0x7F], &s).is_empty());
        let out = cmds(m.handle(&[0xB0, 0x33, 0x7F], &s));
        assert!(
            matches!(out[..], [Command::SetFader { value, .. }] if value == 1.0),
            "{out:?}"
        );
        // LSB first works too.
        assert!(m.handle(&[0xB0, 0x33, 0x00], &s).is_empty());
        let out = cmds(m.handle(&[0xB0, 0x13, 0x00], &s));
        assert!(
            matches!(out[..], [Command::SetFader { value, .. }] if value == 0.0),
            "{out:?}"
        );
    }

    #[test]
    fn invert_and_select_knob() {
        let mut m = mapping();
        let s = st();
        // Inverted, the top of the fader is -1: the bottom, the faster end.
        let out = cmds(m.handle(&[0xB0, 0x00, 0x7F], &s));
        assert!(matches!(out[..], [Command::SetRate { rate, .. }] if (rate - 1.08).abs() < 1e-9));
        assert!(matches!(
            m.handle(&[0xB6, 0x40, 0x7F], &s)[..],
            [Action::Browse(-1)]
        ));
        assert!(matches!(
            m.handle(&[0xB6, 0x40, 0x01], &s)[..],
            [Action::Browse(1)]
        ));
    }

    #[test]
    fn soft_takeover_waits_for_the_knob() {
        let mut m = mapping();
        let s = st(); // EQ flat: the knob's centre.
                      // Far from the centre: ignored.
        assert!(m.handle(&[0xB1, 0x0F, 0x10], &s).is_empty());
        assert!(m.handle(&[0xB1, 0x0F, 0x30], &s).is_empty());
        // Swept past the centre: takes over.
        let out = cmds(m.handle(&[0xB1, 0x0F, 0x50], &s));
        assert!(matches!(
            out[..],
            [Command::SetEq {
                deck: DeckId::B,
                band: EqBand::Low,
                ..
            }]
        ));
    }

    #[test]
    fn scripts_and_unknown_controls_do_nothing() {
        let mut m = mapping();
        let s = st();
        assert!(m.handle(&[0xB0, 0x21, 0x41], &s).is_empty());
        assert!(m.handle(&[0x92, 0x0B, 0x7F], &s).is_empty());
        assert!(m.handle(&[0xF0, 0x00, 0xF7], &s).is_empty());
        assert!(m.handle(&[], &s).is_empty());
    }

    #[test]
    fn outputs_send_only_changes() {
        let mut m = mapping();
        let mut s = st();
        let first = m.leds(&s);
        assert!(first.contains(&vec![0x90, 0x0B, 0x00]));
        assert!(first.contains(&vec![0x97, 0x00, 0x01]));
        assert!(m.leds(&s).is_empty());
        s.decks[0].playing = true;
        s.decks[0].hot_cues[0] = Some(1.0);
        let next = m.leds(&s);
        assert_eq!(next.len(), 2);
        assert!(next.contains(&vec![0x90, 0x0B, 0x7F]));
        m.reset_leds();
        assert_eq!(m.leds(&s).len(), 2);
    }

    #[test]
    fn qt_style_numbers() {
        assert_eq!(parse_int("0x7F"), Some(127));
        assert_eq!(parse_int("010"), Some(8));
        assert_eq!(parse_int("144"), Some(144));
        assert_eq!(parse_int("0"), Some(0));
        assert_eq!(parse_int("zz"), None);
    }

    /// Mixxx mappings to test against: the bundled ones, or
    /// `$MIXXX_CONTROLLERS` (another copy of Mixxx's `res/controllers`).
    fn corpus_dir() -> std::path::PathBuf {
        std::env::var_os("MIXXX_CONTROLLERS")
            .map(Into::into)
            .or_else(crate::Catalog::source_mappings_dir)
            .expect("bundled mappings")
    }

    /// Every bundled mapping parses, and every one with scripts loads them.
    #[test]
    fn bundled_mappings_load() {
        let dir = crate::Catalog::source_mappings_dir().expect("bundled mappings");
        let files = crate::mapping_files(&dir);
        assert!(files.len() > 150, "{} mapping files", files.len());
        for f in files {
            let mut p = Preset::load(&f).unwrap_or_else(|e| panic!("{e}"));
            if !p.scripts.iter().any(|s| s.filename.ends_with(".js")) {
                continue;
            }
            p.script_dirs = vec![dir.clone()];
            assert!(load_script(&p).is_some(), "{}: scripts didn't load", p.name);
        }
    }

    /// The Mixtrack (Pro) 3's pitch fader reads 0 at the top, marked minus,
    /// and its script turns that into `rate` +1, as Mixxx expects: the top
    /// must be the slower end, and the bottom the faster.
    #[test]
    fn mixtrack_3_pitch_fader_top_is_slower() {
        let dir = crate::Catalog::source_mappings_dir().expect("bundled mappings");
        let mut p = Preset::load(&dir.join("Numark-Mixtrack-3.midi.xml")).expect("mapping");
        p.script_dirs = vec![dir];
        let mut m = MixxxMidi::new(std::sync::Arc::new(p));
        let s = st();
        let rate = |m: &mut MixxxMidi, hi: u8, lo: u8| {
            m.handle(&[0xB1, 0x18, hi], &s);
            cmds(m.handle(&[0xB1, 0x38, lo], &s))
                .into_iter()
                .find_map(|c| match c {
                    Command::SetRate { rate, .. } => Some(rate),
                    _ => None,
                })
                .expect("a rate")
        };
        assert!(rate(&mut m, 0x00, 0x00) < 1.0);
        assert!(rate(&mut m, 0x7F, 0x7F) > 1.0);
    }

    /// Bundled mappings whose scripts raise errors when every control is
    /// pressed and released (see [`exercise_midi`] and [`exercise_hid`]).
    /// Most are bugs in the Mixxx scripts themselves or Mixxx features we
    /// don't have. Take a mapping off this list once its scripts run clean;
    /// [`bundled_scripts_run_clean`] fails if a mapping not on it starts
    /// raising errors.
    const KNOWN_SCRIPT_ERRORS: &[&str] = &[
        // MIDI
        "Allen&Heath Xone K1/K2/K3",
        "Behringer BCR2000",
        "Behringer DDM4000",
        "Gemini CDMP-7000 L",
        "Gemini CDMP-7000 R",
        "Hercules DJ Console 4-Mx",
        "Hercules DJ Control AIR",
        "Hercules DJControl Inpulse 200",
        "Icon P1-Nano MIDI 1",
        "Ion Discover DJ Pro",
        "Numark N4",
        "Numark NS4FX",
        "Numark NS6II",
        "Numark NS7",
        "Pioneer DDJ-SB",
        "Pioneer DDJ-SB3",
        "Reloop Beatpad",
        "Soundless joyMIDI",
        "Stanton SCS.1d (unfinished)",
        "Vestax Spin",
        "Vestax VCI-100 Hile Mod",
        "Vestax VCI-400",
        // HID
        "EKS Otus HID",
        "Native Instruments Traktor Kontrol F1",
        "Native Instruments Traktor Kontrol S2 Mk1",
        "Traktor Kontrol S4 MK3",
        "Native Instruments Traktor Kontrol Z1",
    ];

    /// Runs a MIDI mapping's scripts as a DJ would: init, every bound
    /// message pressed and released, a playing deck and a set hot cue for
    /// the LEDs, timers, then shutdown. Returns how many actions it sent.
    fn exercise_midi(m: &mut MixxxMidi) -> usize {
        let mut s = st();
        let mut actions = m.poll(&s).len();
        let keys: Vec<(u8, u8)> = m.preset().inputs.keys().copied().collect();
        for (status, number) in keys {
            actions += m.handle(&[status, number, 0x7F], &s).len();
            actions += m.handle(&[status, number, 0x00], &s).len();
        }
        s.decks[0].playing = true;
        s.decks[1].hot_cues[0] = Some(1.0);
        for _ in 0..3 {
            actions += m.poll(&s).len();
            m.leds(&s);
        }
        m.shutdown(&s);
        m.leds(&s);
        actions
    }

    /// Runs a HID mapping's scripts with made-up reports. Returns how many
    /// reports it sent back to the device.
    fn exercise_hid(m: &mut MixxxMidi) -> usize {
        m.set_hid(Arc::new(|_, _| vec![0; 64]));
        let mut s = st();
        m.poll(&s);
        let mut reports = m.take_hid().len();
        for id in 0..4u8 {
            for fill in [0x00u8, 0xFF, 0x55] {
                let mut r = vec![fill; 64];
                r[0] = id;
                m.handle(&r, &s);
                reports += m.take_hid().len();
            }
        }
        s.decks[0].playing = true;
        for _ in 0..3 {
            m.poll(&s);
            reports += m.take_hid().len();
        }
        m.shutdown(&s);
        reports + m.take_hid().len()
    }

    /// Every bundled mapping with scripts runs them without errors when
    /// each control is used, except the ones on [`KNOWN_SCRIPT_ERRORS`]. A
    /// change to the script host that breaks a mapping fails here, not on
    /// someone's controller.
    #[test]
    fn bundled_scripts_run_clean() {
        let dir = crate::Catalog::source_mappings_dir().expect("bundled mappings");
        let mut broken = vec![];
        let mut ran = 0;
        for f in crate::mapping_files(&dir) {
            let mut p = Preset::load(&f).unwrap_or_else(|e| panic!("{e}"));
            if !p.scripts.iter().any(|s| s.filename.ends_with(".js")) {
                continue;
            }
            p.script_dirs = vec![dir.clone()];
            let p = Arc::new(p);
            let mut m = MixxxMidi::new(p.clone());
            assert!(m.has_script(), "{}: scripts didn't load", p.name);
            if p.is_hid() {
                exercise_hid(&mut m);
            } else {
                exercise_midi(&mut m);
            }
            ran += 1;
            let errors = m.script_errors();
            if !errors.is_empty() && !KNOWN_SCRIPT_ERRORS.contains(&p.name.as_str()) {
                broken.push(format!("{}: {:?}", p.name, errors));
            }
        }
        assert!(ran > 120, "only {ran} mappings with scripts ran");
        assert!(
            broken.is_empty(),
            "scripts raised errors:\n{}",
            broken.join("\n")
        );
    }

    /// No bundled mapping claims a MIDI port that isn't a DJ controller,
    /// which would take over someone's keyboard or audio interface.
    #[test]
    fn bundled_mappings_leave_other_devices_alone() {
        let dir = crate::Catalog::source_mappings_dir().expect("bundled mappings");
        let others = [
            "IAC Driver Bus 1",
            "Midi Through Port-0",
            "USB MIDI Keyboard",
            "Network Session 1",
            "Scarlett 2i2 USB",
            "Arturia KeyStep 37",
        ];
        for f in crate::mapping_files(&dir) {
            let p = Preset::load(&f).unwrap_or_else(|e| panic!("{e}"));
            for o in others {
                assert!(!p.matches(o), "{} claims {o:?}", p.name);
            }
        }
    }

    /// Loads every mapping in the corpus (see [`corpus_dir`]) and prints how much of each works. Run with
    /// `cargo test -p dj-controller mixxx_corpus -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn mixxx_corpus() {
        let dir = corpus_dir();
        let mut files: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.to_string_lossy().ends_with(".midi.xml"))
            .collect();
        files.sort();
        let (mut controls, mut supported, mut scripted, mut failed) = (0, 0, 0, 0);
        let mut missing: HashMap<String, usize> = HashMap::new();
        for f in &files {
            match Preset::load(f) {
                Ok(p) => {
                    let c = p.coverage();
                    println!(
                        "{:50} {:4}/{:4} controls, {:4} scripted, {:3}/{:3} outputs",
                        p.name, c.supported, c.controls, c.scripted, c.outputs_supported, c.outputs
                    );
                    controls += c.controls;
                    supported += c.supported;
                    scripted += c.scripted;
                    for m in c.missing {
                        *missing.entry(m).or_default() += 1;
                    }
                }
                Err(e) => {
                    failed += 1;
                    println!("FAILED {e}");
                }
            }
        }
        let mut top: Vec<_> = missing.into_iter().collect();
        top.sort_by_key(|t| std::cmp::Reverse(t.1));
        println!(
            "\n{} files, {failed} failed; {supported}/{controls} control bindings supported, {scripted} script bindings",
            files.len()
        );
        println!("most common missing controls:");
        for (m, n) in top.iter().take(40) {
            println!("  {n:4}  {m}");
        }
        assert_eq!(failed, 0);
    }

    /// Mixxx's own DDJ-FLX4 mapping, scripts and all, should drive the
    /// deck as our hand-written one does for the same MIDI.
    #[test]
    fn mixxx_flx4_agrees_with_ours() {
        let dir = corpus_dir();
        let mut p = Preset::load(&dir.join("Pioneer-DDJ-FLX4.midi.xml")).unwrap();
        p.script_dirs = vec![dir];
        let mut theirs = MixxxMidi::new(Arc::new(p));
        assert!(theirs.has_script());
        let mut ours = crate::flx4::Flx4::new();
        let s = st();
        theirs.poll(&s);
        // The command's name; Play and Pause from a stopped deck are what
        // TogglePlay does.
        let kind = |a: &Action| {
            let s = format!("{a:?}");
            let s = s.strip_prefix("Engine(").unwrap_or(&s);
            let name: String = s.chars().take_while(|c| c.is_alphanumeric()).collect();
            match name.as_str() {
                "Play" | "Pause" => "TogglePlay".to_owned(),
                _ => name,
            }
        };
        let msgs: &[&[u8]] = &[
            &[0x90, 0x0B, 0x7F], // play
            &[0x90, 0x0C, 0x7F], // cue press
            &[0x90, 0x0C, 0x00], // cue release
            &[0x90, 0x58, 0x7F], // sync
            &[0x90, 0x54, 0x7F], // headphone cue
            &[0x97, 0x00, 0x7F], // hot cue pad 1
            &[0x97, 0x00, 0x00],
            &[0x90, 0x10, 0x7F], // loop in
            &[0x90, 0x11, 0x7F], // loop out
            &[0xB0, 0x13, 0x40],
            &[0xB0, 0x33, 0x00], // channel fader
            &[0xB0, 0x07, 0x40],
            &[0xB0, 0x27, 0x00], // EQ high
            &[0xB6, 0x1F, 0x7F],
            &[0xB6, 0x3F, 0x7F], // crossfader
            &[0x96, 0x46, 0x7F], // load A
        ];
        let mut agree = 0;
        for m in msgs {
            let a: Vec<String> = ours.handle(m, &s).iter().map(kind).collect();
            let mut b: Vec<String> = theirs.handle(m, &s).iter().map(kind).collect();
            b.extend(theirs.poll(&s).iter().map(kind));
            let same = a.iter().all(|x| b.contains(x));
            agree += usize::from(same);
            println!(
                "{:02X?}  ours {a:?}  mixxx {b:?}{}",
                m,
                if same { "" } else { "  <- differs" }
            );
        }
        println!("errors: {:?}", theirs.script_errors());
        println!("{agree}/{} agree", msgs.len());
        assert_eq!(agree, msgs.len());
        assert!(theirs.script_errors().is_empty());
    }

    /// Runs every mapping in the corpus with its scripts: init,
    /// every bound message pressed and released, timers, shutdown. Prints
    /// the mappings whose scripts don't load or raise errors. Run with
    /// `cargo test -p dj-controller mixxx_scripts -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn mixxx_scripts() {
        let dir = corpus_dir();
        let mut files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.to_string_lossy().ends_with(".midi.xml"))
            .collect();
        files.sort();
        let (mut with_scripts, mut loaded, mut clean) = (0, 0, 0);
        let mut actions = 0usize;
        for f in &files {
            let mut p = Preset::load(f).unwrap();
            if p.scripts.is_empty() {
                continue;
            }
            with_scripts += 1;
            p.script_dirs = vec![dir.clone()];
            let p = Arc::new(p);
            let t = std::time::Instant::now();
            let mut m = MixxxMidi::new(p.clone());
            if !m.has_script() {
                println!("NOT LOADED  {}", p.name);
                continue;
            }
            loaded += 1;
            actions += exercise_midi(&mut m);
            let errors = m.script_errors();
            if errors.is_empty() {
                clean += 1;
            } else {
                println!("ERRORS      {} ({} distinct)", p.name, errors.len());
                for e in errors.iter().take(3) {
                    println!("              {e}");
                }
            }
            if t.elapsed() > std::time::Duration::from_secs(2) {
                println!("SLOW        {} took {:?}", p.name, t.elapsed());
            }
        }
        println!(
            "\n{with_scripts} mappings with scripts: {loaded} loaded, {clean} ran without errors; {actions} actions"
        );
    }

    /// Runs every Mixxx HID mapping's scripts with made-up reports: they
    /// should load, take input without errors, and send reports back.
    /// `cargo test -p dj-controller mixxx_hid -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn mixxx_hid_scripts() {
        let dir = corpus_dir();
        let mut files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.to_string_lossy().ends_with(".hid.xml"))
            .collect();
        files.sort();
        let (mut total, mut loaded, mut clean, mut sending) = (0, 0, 0, 0);
        for f in &files {
            let mut p = Preset::load(f).unwrap();
            assert!(p.is_hid(), "{}", p.name);
            assert!(
                !p.matches(&p.name.clone()),
                "a HID mapping never takes a MIDI port"
            );
            if !p.scripts.iter().any(|s| s.filename.ends_with(".js")) {
                continue;
            }
            total += 1;
            p.script_dirs = vec![dir.clone()];
            let p = Arc::new(p);
            let mut m = MixxxMidi::new(p.clone());
            if !m.has_script() {
                println!("NOT LOADED  {}", p.name);
                continue;
            }
            loaded += 1;
            let reports = exercise_hid(&mut m);
            if reports > 0 {
                sending += 1;
            }
            let errors = m.script_errors();
            if errors.is_empty() {
                clean += 1;
                println!("OK          {} ({reports} reports out)", p.name);
            } else {
                println!("ERRORS      {} ({} distinct)", p.name, errors.len());
                for e in errors.iter().take(3) {
                    println!("              {e}");
                }
            }
        }
        println!("\n{total} HID mappings with scripts: {loaded} loaded, {clean} ran without errors, {sending} sent reports");
    }
}
