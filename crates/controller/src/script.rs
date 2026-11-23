//! Runs a Mixxx mapping's JavaScript.
//!
//! Most Mixxx mappings do their real work in script: an XML binding names a
//! function such as `PioneerDDJ400.playPressed`, and the script reads and
//! sets controls through Mixxx's `engine` object, sends MIDI through `midi`,
//! sets timers and listens for control changes. This module embeds QuickJS
//! and provides that API, backed by [`Controls`], so those scripts run
//! against our engine.
//!
//! The parts of the API that hold JavaScript functions (connections,
//! timers, the per-binding wrappers) live in a small JavaScript prelude;
//! Rust only provides plain native functions. [`Script::tick`] runs due
//! timers and calls connection callbacks for controls whose value changed,
//! about every 30 ms.
//!
//! Scripts are other people's code: every call into them runs with a time
//! limit and a memory limit, and an error is reported (once per message)
//! rather than taken down the controller.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use rquickjs::{Context, Function, Object, Runtime};

use crate::controls::{Control, Controls};
use crate::{Action, State};

/// The script every Mixxx mapping gets, loaded before its own files.
pub const COMMON_SCRIPT: &str = "common-controller-scripts.js";

/// Longest a single call into a script may run.
const CALL_LIMIT: Duration = Duration::from_millis(200);
/// Longest the scripts may take to load and run `init`.
const INIT_LIMIT: Duration = Duration::from_secs(2);
const MEMORY_LIMIT: usize = 64 << 20;
/// QuickJS's own stack limit. Calls arrive on MIDI threads with small
/// stacks; this keeps runaway recursion a script error, not a crash.
const STACK_LIMIT: usize = 256 << 10;
/// A value set from script reads back as set for this long, until the
/// engine's own state has caught up.
const OVERLAY_FOR: Duration = Duration::from_millis(100);
/// How many distinct script errors are reported before going quiet.
const MAX_ERRORS: usize = 20;

/// A mapping setting's value, from the mapping's `<settings>`.
#[derive(Debug, Clone, PartialEq)]
pub enum Setting {
    Bool(bool),
    Number(f64),
    Text(String),
}

/// A HID report a script sent, for the device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HidOut {
    /// An output report. Unless `resend`, it's skipped when it's the same
    /// as the last one sent with this id.
    Output {
        id: u8,
        data: Vec<u8>,
        resend: bool,
    },
    Feature {
        id: u8,
        data: Vec<u8>,
    },
}

/// Which kind of report a script asks the device for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportKind {
    Input,
    Feature,
}

/// Reads a report from the device right away, for a script's
/// `controller.getInputReport` and `getFeatureReport`. Returns the report
/// without its id, or nothing if the device didn't answer.
pub type ReportReader = Arc<dyn Fn(ReportKind, u8) -> Vec<u8> + Send + Sync>;

/// One deck's jog wheel scratch, from `engine.scratchEnable`.
#[derive(Debug, Clone, Copy)]
struct Scratch {
    /// Seconds of audio one wheel tick moves.
    secs_per_tick: f64,
}

/// What the native functions share with the mapping.
struct Shared {
    controls: Controls,
    state: State,
    /// Values scripts set lately, read back until the engine catches up.
    overlay: HashMap<Control, (f64, Instant)>,
    actions: Vec<Action>,
    midi_out: Vec<Vec<u8>>,
    /// Set for a HID controller: `controller.send` sends reports then.
    hid: Option<ReportReader>,
    hid_out: Vec<HidOut>,
    scratch: [Option<Scratch>; dj_engine::NUM_DECKS],
    /// Soft takeover per control: the parameter last set from script.
    takeover: HashMap<Control, Option<f64>>,
    errors: HashSet<String>,
    name: String,
    /// Notes the script sends elsewhere (`midi.routeNote`): (channel, note)
    /// in, note out.
    routes: HashMap<(u8, u8), u8>,
}

impl Shared {
    fn get(&self, c: Control) -> f64 {
        match self.overlay.get(&c) {
            Some(&(v, at)) if at.elapsed() < OVERLAY_FOR => v,
            _ => self.controls.get(c, &self.state),
        }
    }

    fn set(&mut self, c: Control, v: f64) {
        let actions = self.controls.set(c, v, &self.state);
        self.actions.extend(actions);
        if !c.behavior().is_encoder() {
            self.overlay.insert(c, (v, Instant::now()));
        }
    }

    /// Soft takeover: whether setting `c` to knob position `param` should
    /// be ignored because the knob hasn't reached the control yet.
    fn takeover_ignores(&mut self, c: Control, param: f64) -> bool {
        let Some(prev) = self.takeover.get(&c).copied() else {
            return false;
        };
        let current = c.behavior().value_to_parameter(self.get(c));
        self.takeover.insert(c, Some(param));
        if (param - current).abs() <= 3.0 / 128.0 {
            return false;
        }
        let crossed = prev.is_some_and(|p| (p - current) * (param - current) <= 0.0);
        !crossed
    }

    fn error(&mut self, msg: String) {
        if self.errors.len() < MAX_ERRORS && self.errors.insert(msg.clone()) {
            eprintln!("controller script ({}): {msg}", self.name);
        }
    }
}

fn lock(shared: &Mutex<Shared>) -> MutexGuard<'_, Shared> {
    shared.lock().unwrap_or_else(|p| p.into_inner())
}

/// A mapping's scripts, loaded and running.
pub struct Script {
    // Field order matters: the context must go before the runtime.
    context: Context,
    _runtime: Runtime,
    shared: Arc<Mutex<Shared>>,
    /// The objects whose `init` and `shutdown` are called.
    prefixes: Vec<String>,
    /// When the current call must stop, in ms since `epoch`; 0 for none.
    deadline: Arc<AtomicU64>,
    epoch: Instant,
    started: bool,
}

/// Finds a mapping's script file: next to the mapping first, then in the
/// other folders (Mixxx keeps its shared libraries with its mappings).
pub fn find_script(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter().map(|d| d.join(name)).find(|p| p.is_file())
}

impl Script {
    /// Loads `files` (name and contents, in order) into a fresh engine.
    /// `prefixes` are the mapping's script objects, whose `init` runs on
    /// [`Self::start`].
    pub fn load(
        name: &str,
        files: &[(String, String)],
        prefixes: Vec<String>,
        settings: &[(String, Setting)],
    ) -> Result<Script, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(MEMORY_LIMIT);
        runtime.set_max_stack_size(STACK_LIMIT);
        let epoch = Instant::now();
        let deadline = Arc::new(AtomicU64::new(0));
        {
            let deadline = deadline.clone();
            runtime.set_interrupt_handler(Some(Box::new(move || {
                let d = deadline.load(Ordering::Relaxed);
                d != 0 && epoch.elapsed().as_millis() as u64 > d
            })));
        }
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        let shared = Arc::new(Mutex::new(Shared {
            controls: Controls::new(),
            state: State::default(),
            overlay: HashMap::new(),
            actions: vec![],
            midi_out: vec![],
            hid: None,
            hid_out: vec![],
            scratch: [None; dj_engine::NUM_DECKS],
            takeover: HashMap::new(),
            errors: HashSet::new(),
            routes: HashMap::new(),
            name: name.to_owned(),
        }));
        let script = Script {
            context,
            _runtime: runtime,
            shared,
            prefixes,
            deadline,
            epoch,
            started: false,
        };
        script.arm(INIT_LIMIT);
        let result = script.context.with(|ctx| -> Result<(), String> {
            let native = native(&ctx, script.shared.clone(), epoch).map_err(|e| e.to_string())?;
            let settings_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
            for (k, v) in settings {
                let r = match v {
                    Setting::Bool(b) => settings_obj.set(k.as_str(), *b),
                    Setting::Number(n) => settings_obj.set(k.as_str(), *n),
                    Setting::Text(t) => settings_obj.set(k.as_str(), t.as_str()),
                };
                r.map_err(|e| e.to_string())?;
            }
            let prelude: Function = ctx.eval(PRELUDE).map_err(|e| describe_error(&ctx, e))?;
            prelude
                .call::<_, ()>((native, settings_obj))
                .map_err(|e| describe_error(&ctx, e))?;
            for (file, src) in files {
                // Mapping scripts are written for sloppy mode: many assign
                // to undeclared globals, as `MyController = {}`.
                let mut src = std::borrow::Cow::Borrowed(src.as_str());
                loop {
                    let mut opts = rquickjs::context::EvalOptions::default();
                    opts.strict = false;
                    opts.filename = Some(file.clone());
                    let Err(e) = ctx.eval_with_options::<(), _>(&*src, opts) else {
                        break;
                    };
                    let e = describe_error(&ctx, e);
                    // Mixxx's engine lets a file declare `class Deck` over
                    // the `var Deck` from common-controller-scripts.js;
                    // QuickJS, like the standard, refuses before running
                    // anything. Redeclare it as the var it shadows instead.
                    match redeclared(&e).and_then(|name| as_var(&src, name)) {
                        Some(fixed) => src = std::borrow::Cow::Owned(fixed),
                        None => return Err(format!("{file}: {e}")),
                    }
                }
            }
            Ok(())
        });
        script.disarm();
        result?;
        Ok(script)
    }

    fn arm(&self, limit: Duration) {
        let at = (self.epoch.elapsed() + limit).as_millis() as u64;
        self.deadline.store(at.max(1), Ordering::Relaxed);
    }

    fn disarm(&self) {
        self.deadline.store(0, Ordering::Relaxed);
    }

    fn update_state(&self, state: &State) {
        let mut s = lock(&self.shared);
        s.state = *state;
        s.overlay.retain(|_, (_, at)| at.elapsed() < OVERLAY_FOR);
    }

    /// Calls `__ossdj.<method>(args)`, reporting any script error.
    fn call<A>(&self, method: &str, args: A, limit: Duration)
    where
        A: for<'js> rquickjs::function::IntoArgs<'js>,
    {
        self.arm(limit);
        let err = self.context.with(|ctx| -> Option<String> {
            let run = || -> rquickjs::Result<()> {
                let api: Object = ctx.globals().get("__ossdj")?;
                let f: Function = api.get(method)?;
                f.call::<_, ()>(args)
            };
            run().err().map(|e| describe_error(&ctx, e))
        });
        self.disarm();
        if let Some(e) = err {
            lock(&self.shared).error(e);
        }
    }

    fn take(&self) -> Vec<Action> {
        std::mem::take(&mut lock(&self.shared).actions)
    }

    /// Runs the mapping's `init(id, debugging)`.
    pub fn start(&mut self, id: &str, state: &State) -> Vec<Action> {
        if self.started {
            return vec![];
        }
        self.started = true;
        self.update_state(state);
        let prefixes = self.prefixes.clone();
        self.call("callAll", (prefixes, "init", id.to_owned()), INIT_LIMIT);
        self.take()
    }

    /// Runs the mapping's `shutdown()`.
    pub fn stop(&mut self, state: &State) -> Vec<Action> {
        if !self.started {
            return vec![];
        }
        self.started = false;
        self.update_state(state);
        let prefixes = self.prefixes.clone();
        self.call("callAll", (prefixes, "shutdown", String::new()), CALL_LIMIT);
        self.take()
    }

    /// Calls a script binding: `code` is the XML's key, such as
    /// `PioneerDDJ400.playPressed`, called with Mixxx's arguments.
    pub fn binding(
        &mut self,
        code: &str,
        group: &str,
        status: u8,
        number: u8,
        value: u8,
        state: &State,
    ) -> Vec<Action> {
        self.update_state(state);
        self.call(
            "binding",
            (
                code.to_owned(),
                status & 0x0F,
                number,
                value,
                status,
                group.to_owned(),
            ),
            CALL_LIMIT,
        );
        self.take()
    }

    /// Hands a system exclusive message, or a HID controller's input
    /// report, to the mapping's `incomingData`.
    pub fn sysex(&mut self, data: &[u8], state: &State) -> Vec<Action> {
        self.update_state(state);
        let prefixes = self.prefixes.clone();
        self.call(
            "incoming",
            (prefixes, data.to_vec(), data.len()),
            CALL_LIMIT,
        );
        self.take()
    }

    /// Runs due timers and connection callbacks.
    pub fn tick(&mut self, state: &State) -> Vec<Action> {
        self.update_state(state);
        let now = self.epoch.elapsed().as_secs_f64() * 1000.0;
        self.call("tick", (now,), CALL_LIMIT);
        self.take()
    }

    /// The note a note message on `channel` stands for, after the
    /// script's `midi.routeNote` calls (an openDJ addition its mappings use
    /// to make pads follow the page shown).
    pub fn route(&self, channel: u8, note: u8) -> u8 {
        lock(&self.shared)
            .routes
            .get(&(channel, note))
            .copied()
            .unwrap_or(note)
    }

    /// The distinct errors the scripts have raised so far.
    pub fn errors(&self) -> Vec<String> {
        let mut e: Vec<String> = lock(&self.shared).errors.iter().cloned().collect();
        e.sort();
        e
    }

    /// Makes this a HID controller's script: `controller.send` and the
    /// report functions talk to the device, and reads go to `reader`.
    pub fn set_hid(&mut self, reader: ReportReader) {
        lock(&self.shared).hid = Some(reader);
    }

    /// HID reports the scripts sent since the last call.
    pub fn take_hid(&mut self) -> Vec<HidOut> {
        std::mem::take(&mut lock(&self.shared).hid_out)
    }

    /// MIDI the scripts sent since the last call.
    pub fn take_midi(&mut self) -> Vec<Vec<u8>> {
        std::mem::take(&mut lock(&self.shared).midi_out)
    }
}

fn describe_error(ctx: &rquickjs::Ctx<'_>, e: rquickjs::Error) -> String {
    if !matches!(e, rquickjs::Error::Exception) {
        return e.to_string();
    }
    let exc = ctx.catch();
    if let Some(obj) = exc.as_object() {
        let msg: String = obj.get("message").unwrap_or_default();
        let stack: String = obj.get("stack").unwrap_or_default();
        let first = stack.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
        if msg.is_empty() {
            return format!("{exc:?}");
        }
        return format!("{msg} {}", first.trim());
    }
    exc.as_string()
        .and_then(|s| s.to_string().ok())
        .unwrap_or_else(|| format!("{exc:?}"))
}

/// The name in a "redeclaration of 'Deck'" error.
fn redeclared(error: &str) -> Option<&str> {
    let rest = error.split_once("redeclaration of '")?.1;
    Some(&rest[..rest.find('\'')?])
}

/// `src` with top-level `class name`, `let name` and `const name`
/// declarations made `var`, or `None` if it has none.
fn as_var(src: &str, name: &str) -> Option<String> {
    let mut changed = false;
    let lines: Vec<String> = src
        .lines()
        .map(|line| {
            for kw in ["class", "let", "const"] {
                let Some(rest) = line
                    .strip_prefix(kw)
                    .and_then(|r| r.strip_prefix(' '))
                    .and_then(|r| r.strip_prefix(name))
                else {
                    continue;
                };
                if rest.starts_with(|c: char| c.is_alphanumeric() || c == '_' || c == '$') {
                    continue;
                }
                changed = true;
                return if kw == "class" {
                    format!("var {name} = class {name}{rest}")
                } else {
                    format!("var {name}{rest}")
                };
            }
            line.to_owned()
        })
        .collect();
    changed.then(|| lines.join("\n"))
}

/// Mixxx numbers decks from 1; anything else is out of range.
fn deck_index(deck: f64) -> Option<usize> {
    let d = deck as i64 - 1;
    (0..dj_engine::NUM_DECKS as i64)
        .contains(&d)
        .then_some(d as usize)
}

/// The native half of the API: plain functions on one object.
fn native<'js>(
    ctx: &rquickjs::Ctx<'js>,
    shared: Arc<Mutex<Shared>>,
    epoch: Instant,
) -> rquickjs::Result<Object<'js>> {
    let o = Object::new(ctx.clone())?;
    macro_rules! func {
        ($name:literal, $f:expr) => {
            o.set($name, Function::new(ctx.clone(), $f)?)?;
        };
    }

    let s = shared.clone();
    func!("getValue", move |g: String, k: String| -> f64 {
        Control::parse(&g, &k).map_or(0.0, |c| lock(&s).get(c))
    });
    let s = shared.clone();
    func!("setValue", move |g: String, k: String, v: f64| {
        if let Some(c) = Control::parse(&g, &k) {
            if v.is_finite() {
                lock(&s).set(c, v);
            }
        }
    });
    let s = shared.clone();
    func!("getParameter", move |g: String, k: String| -> f64 {
        Control::parse(&g, &k).map_or(0.0, |c| c.behavior().value_to_parameter(lock(&s).get(c)))
    });
    let s = shared.clone();
    func!("setParameter", move |g: String, k: String, p: f64| {
        if let Some(c) = Control::parse(&g, &k) {
            if p.is_finite() {
                let mut sh = lock(&s);
                if sh.takeover_ignores(c, p) {
                    return;
                }
                let v = c.behavior().parameter_to_value(p.clamp(0.0, 1.0));
                sh.set(c, v);
            }
        }
    });
    func!("parameterForValue", move |g: String,
                                     k: String,
                                     v: f64|
          -> f64 {
        Control::parse(&g, &k).map_or(0.0, |c| c.behavior().value_to_parameter(v))
    });
    let s = shared.clone();
    func!("reset", move |g: String, k: String| {
        if let Some(c) = Control::parse(&g, &k) {
            let v = c.default_value();
            lock(&s).set(c, v);
        }
    });
    func!("defaultValue", move |g: String, k: String| -> f64 {
        Control::parse(&g, &k).map_or(0.0, |c| c.default_value())
    });
    func!("defaultParameter", move |g: String, k: String| -> f64 {
        Control::parse(&g, &k).map_or(0.0, |c| c.behavior().value_to_parameter(c.default_value()))
    });
    func!("known", move |g: String, k: String| -> bool {
        Control::parse(&g, &k).is_some()
    });
    let s = shared.clone();
    func!("send", move |bytes: Vec<f64>| {
        let msg: Vec<u8> = bytes.iter().map(|&b| (b as i64 & 0xFF) as u8).collect();
        if !msg.is_empty() {
            lock(&s).midi_out.push(msg);
        }
    });
    let s = shared.clone();
    func!("routeNote", move |channel: f64, from: f64, to: f64| {
        let byte = |v: f64| (v as i64 & 0x7F) as u8;
        let (channel, from, to) = ((channel as i64 & 0x0F) as u8, byte(from), byte(to));
        let mut s = lock(&s);
        if from == to {
            s.routes.remove(&(channel, from));
        } else {
            s.routes.insert((channel, from), to);
        }
    });
    let s = shared.clone();
    func!("isHid", move || -> bool { lock(&s).hid.is_some() });
    let s = shared.clone();
    func!("hidOutput", move |id: f64,
                             bytes: Vec<f64>,
                             resend: bool| {
        let data = bytes.iter().map(|&b| (b as i64 & 0xFF) as u8).collect();
        let id = (id as i64 & 0xFF) as u8;
        lock(&s).hid_out.push(HidOut::Output { id, data, resend });
    });
    let s = shared.clone();
    func!("hidFeature", move |id: f64, bytes: Vec<f64>| {
        let data = bytes.iter().map(|&b| (b as i64 & 0xFF) as u8).collect();
        let id = (id as i64 & 0xFF) as u8;
        lock(&s).hid_out.push(HidOut::Feature { id, data });
    });
    let s = shared.clone();
    func!("getReport", move |feature: bool, id: f64| -> Vec<u8> {
        // Not under the lock: the device read can take a moment.
        let reader = lock(&s).hid.clone();
        let kind = if feature {
            ReportKind::Feature
        } else {
            ReportKind::Input
        };
        reader.map_or(vec![], |r| r(kind, (id as i64 & 0xFF) as u8))
    });
    let s = shared.clone();
    func!("log", move |m: String| {
        eprintln!("controller script ({}): {m}", lock(&s).name);
    });
    let s = shared.clone();
    func!("error", move |m: String| {
        lock(&s).error(m);
    });
    func!("now", move || -> f64 {
        epoch.elapsed().as_secs_f64() * 1000.0
    });

    let s = shared.clone();
    func!("scratchEnable", move |deck: f64,
                                 ticks_per_rev: f64,
                                 rpm: f64| {
        let Some(d) = deck_index(deck) else { return };
        if ticks_per_rev <= 0.0 || rpm <= 0.0 {
            return;
        }
        let mut sh = lock(&s);
        sh.scratch[d] = Some(Scratch {
            secs_per_tick: 60.0 / rpm / ticks_per_rev,
        });
        let deck = dj_engine::DeckId::from_index(d).expect("deck");
        sh.actions
            .push(Action::Engine(dj_engine::Command::ScratchStart { deck }));
    });
    let s = shared.clone();
    func!("scratchTick", move |deck: f64, interval: f64| {
        let Some(d) = deck_index(deck) else { return };
        let mut sh = lock(&s);
        if let Some(sc) = sh.scratch[d] {
            if interval != 0.0 && interval.is_finite() {
                let deck = dj_engine::DeckId::from_index(d).expect("deck");
                sh.actions.push(Action::Engine(dj_engine::Command::Jog {
                    deck,
                    seconds: interval * sc.secs_per_tick,
                }));
            }
        }
    });
    let s = shared.clone();
    func!("scratchDisable", move |deck: f64| {
        let Some(d) = deck_index(deck) else { return };
        let mut sh = lock(&s);
        if sh.scratch[d].take().is_some() {
            let deck = dj_engine::DeckId::from_index(d).expect("deck");
            sh.actions
                .push(Action::Engine(dj_engine::Command::ScratchEnd { deck }));
        }
    });
    let s = shared.clone();
    func!("isScratching", move |deck: f64| -> bool {
        deck_index(deck).is_some_and(|d| lock(&s).scratch[d].is_some())
    });
    let s = shared.clone();
    func!("play", move |deck: f64, on: bool| {
        let Some(d) = deck_index(deck) else { return };
        let deck = dj_engine::DeckId::from_index(d).expect("deck");
        let cmd = if on {
            dj_engine::Command::Play { deck }
        } else {
            dj_engine::Command::Pause { deck }
        };
        lock(&s).actions.push(Action::Engine(cmd));
    });
    let s = shared.clone();
    func!("softTakeover", move |g: String, k: String, on: bool| {
        if let Some(c) = Control::parse(&g, &k) {
            let mut sh = lock(&s);
            if on {
                sh.takeover.entry(c).or_insert(None);
            } else {
                sh.takeover.remove(&c);
            }
        }
    });
    let s = shared.clone();
    func!("softTakeoverIgnoreNext", move |g: String, k: String| {
        if let Some(c) = Control::parse(&g, &k) {
            let mut sh = lock(&s);
            if sh.takeover.contains_key(&c) {
                sh.takeover.insert(c, None);
            }
        }
    });
    Ok(o)
}

/// The JavaScript half of Mixxx's script API. Evaluates to a function
/// taking the native object and the mapping's settings.
const PRELUDE: &str = r#"
(function (native, settings) {
  "use strict";
  const g = globalThis;
  const str = (v) => String(v);
  const report = (e) => native.error(e && e.message ? e.message + (e.stack ? " " + e.stack.split("\n")[0] : "") : String(e));

  g.print = (...a) => native.log(a.map(String).join(" "));
  g.console = { log: g.print, info: g.print, warn: g.print, error: g.print, debug() {} };

  const conns = [];
  let triggers = [];
  const timers = new Map();
  let nextTimer = 1;

  const resolve = (cb) => (typeof cb === "string" ? (0, eval)(cb) : cb);

  function connect(group, key, cb) {
    cb = resolve(cb);
    if (typeof cb !== "function") return undefined;
    group = str(group); key = str(key);
    const c = { group, key, callback: cb, last: native.getValue(group, key), connected: true };
    const proxy = {
      disconnect() {
        if (!c.connected) return false;
        c.connected = false;
        const i = conns.indexOf(c);
        if (i >= 0) conns.splice(i, 1);
        return true;
      },
      trigger() {
        if (c.connected) c.callback(native.getValue(group, key), group, key);
      },
      get isConnected() { return c.connected; },
      group, key,
    };
    c.proxy = proxy;
    conns.push(c);
    return proxy;
  }

  g.engine = {
    getValue: (gr, k) => native.getValue(str(gr), str(k)),
    setValue: (gr, k, v) => native.setValue(str(gr), str(k), Number(v)),
    getParameter: (gr, k) => native.getParameter(str(gr), str(k)),
    setParameter: (gr, k, v) => native.setParameter(str(gr), str(k), Number(v)),
    getParameterForValue: (gr, k, v) => native.parameterForValue(str(gr), str(k), Number(v)),
    reset: (gr, k) => native.reset(str(gr), str(k)),
    getDefaultValue: (gr, k) => native.defaultValue(str(gr), str(k)),
    getDefaultParameter: (gr, k) => native.defaultParameter(str(gr), str(k)),
    makeConnection: connect,
    makeUnbufferedConnection: connect,
    connectControl(group, key, cb, disconnect) {
      group = str(group); key = str(key);
      const fn = resolve(cb);
      if (disconnect) {
        for (const c of conns.slice()) {
          if (c.group === group && c.key === key && (typeof fn !== "function" || c.callback === fn)) {
            c.proxy.disconnect();
          }
        }
        return true;
      }
      for (const c of conns) {
        if (c.group === group && c.key === key && c.callback === fn) return c.proxy;
      }
      return connect(group, key, fn);
    },
    // Queued, as in Mixxx: callbacks run on the next tick, not inside the
    // caller (which may still be setting up what they use).
    trigger(group, key) {
      triggers.push([str(group), str(key)]);
    },
    log: (m) => native.log(str(m)),
    beginTimer(interval, fn, oneShot) {
      if (typeof fn === "string") {
        const code = fn;
        fn = () => (0, eval)(code);
      }
      if (typeof fn !== "function") return 0;
      interval = Math.max(20, Number(interval) || 0);
      const id = nextTimer++;
      timers.set(id, { fn, interval, oneShot: !!oneShot, due: native.now() + interval });
      return id;
    },
    stopTimer(id) { return timers.delete(id); },
    scratchEnable(deck, ticks, rpm) { native.scratchEnable(Number(deck), Number(ticks), Number(rpm)); },
    scratchTick(deck, interval) { native.scratchTick(Number(deck), Number(interval)); },
    scratchDisable(deck) { native.scratchDisable(Number(deck)); },
    isScratching(deck) { return native.isScratching(Number(deck)); },
    softTakeover(gr, k, on) { native.softTakeover(str(gr), str(k), !!on); },
    softTakeoverIgnoreNextValue(gr, k) { native.softTakeoverIgnoreNext(str(gr), str(k)); },
    softTakeoverWillIgnore() { return false; },
    brake(deck, on) { if (on) native.play(Number(deck), false); },
    spinback(deck, on) { if (on) native.play(Number(deck), false); },
    softStart(deck, on) { if (on) native.play(Number(deck), true); },
    isBrakeActive() { return false; },
    isSpinbackActive() { return false; },
    isSoftStartActive() { return false; },
    getSetting(name) { return settings[name]; },
    getSharedData() { return undefined; },
    setSharedData() {},
    makeSharedDataConnection() { return undefined; },
  };

  const bytes = (data, length) => {
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    let a = Array.from(data || []);
    if (typeof length === "number" && length >= 0) a = a.slice(0, length);
    return a.map((x) => Number(x) & 0xff);
  };
  g.midi = g.controller = {
    sendShortMsg(s, d1, d2) { native.send([Number(s) & 0xff, Number(d1) & 0xff, Number(d2) & 0xff]); },
    sendSysexMsg(data, length) { native.send(bytes(data, length)); },
    // openDJ's: notes `from` on `channel` arrive as `to` from now on.
    routeNote(channel, from, to) { native.routeNote(Number(channel), Number(from), Number(to)); },
    // On a HID controller: send(data, length, reportId).
    send(data, length, reportId) {
      if (native.isHid()) native.hidOutput(Number(reportId) || 0, bytes(data, length), true);
      else native.send(bytes(data, length));
    },
    sendOutputReport(reportId, data, resendUnchanged) {
      native.hidOutput(Number(reportId) || 0, bytes(data), !!resendUnchanged);
    },
    sendFeatureReport(reportId, data) { native.hidFeature(Number(reportId) || 0, bytes(data)); },
    getInputReport(reportId) { return new Uint8Array(native.getReport(false, Number(reportId) || 0)).buffer; },
    getFeatureReport(reportId) { return new Uint8Array(native.getReport(true, Number(reportId) || 0)).buffer; },
  };

  g.ColorMapper = class ColorMapper {
    constructor(map) {
      this.entries = Object.keys(map).map((k) => [Number(k), map[k]]);
    }
    nearest(rgb) {
      const r = (rgb >> 16) & 0xff, gr = (rgb >> 8) & 0xff, b = rgb & 0xff;
      let best = null, bestD = Infinity;
      for (const e of this.entries) {
        const dr = ((e[0] >> 16) & 0xff) - r, dg = ((e[0] >> 8) & 0xff) - gr, db = (e[0] & 0xff) - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
    getNearestColor(rgb) { const e = this.nearest(rgb); return e ? e[0] : 0; }
    getValueForNearestColor(rgb) { const e = this.nearest(rgb); return e ? e[1] : 0; }
  };

  const wrappers = new Map();
  g.__ossdj = {
    binding(code, channel, control, value, status, group) {
      let f = wrappers.get(code);
      if (!f) {
        f = (0, eval)("(function (a, b, c, d, e) { return (" + code + ")(a, b, c, d, e); })");
        wrappers.set(code, f);
      }
      f(channel, control, value, status, group);
    },
    callAll(prefixes, name, arg) {
      for (const p of prefixes) {
        const o = g[p];
        if (o && typeof o[name] === "function") {
          try { o[name](arg, false); } catch (e) { report(e); }
        }
      }
    },
    incoming(prefixes, data, length) {
      for (const p of prefixes) {
        const o = g[p];
        if (o && typeof o.incomingData === "function") {
          try { o.incomingData(new Uint8Array(data), length); } catch (e) { report(e); }
        }
      }
    },
    tick(now) {
      const queued = triggers;
      triggers = [];
      for (const [group, key] of queued) {
        const v = native.getValue(group, key);
        for (const c of conns.slice()) {
          if (c.connected && c.group === group && c.key === key) {
            c.last = v;
            try { c.callback(v, group, key); } catch (e) { report(e); }
          }
        }
      }
      for (const [id, t] of Array.from(timers)) {
        if (now < t.due || !timers.has(id)) continue;
        if (t.oneShot) timers.delete(id);
        else t.due = now + t.interval;
        try { t.fn(); } catch (e) { report(e); }
      }
      for (const c of conns.slice()) {
        if (!c.connected) continue;
        const v = native.getValue(c.group, c.key);
        if (v !== c.last) {
          c.last = v;
          try { c.callback(v, c.group, c.key); } catch (e) { report(e); }
        }
      }
    },
  };
})
"#;

/// Reads a mapping's script files from disk: Mixxx's common script first,
/// then the mapping's own, each found next to the mapping or in `dirs`.
pub fn read_files(
    mapping_dir: Option<&Path>,
    names: &[String],
    dirs: &[PathBuf],
) -> Result<Vec<(String, String)>, String> {
    let mut search: Vec<PathBuf> = mapping_dir.map(Path::to_owned).into_iter().collect();
    search.extend(dirs.iter().cloned());
    let mut all = vec![COMMON_SCRIPT.to_owned()];
    all.extend(names.iter().filter(|n| *n != COMMON_SCRIPT).cloned());
    all.into_iter()
        .map(|n| {
            let path = find_script(&n, &search).ok_or_else(|| format!("script {n} not found"))?;
            let src =
                std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            Ok((n, src))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dj_engine::{Command, DeckId};

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

    fn load(src: &str) -> Script {
        Script::load(
            "test",
            &[("test.js".into(), src.into())],
            vec!["T".into()],
            &[("flag".into(), Setting::Bool(true))],
        )
        .unwrap()
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
    fn a_class_may_replace_a_common_var() {
        let s = Script::load(
            "test",
            &[
                ("common.js".into(), "var Deck = function () {};".into()),
                (
                    "map.js".into(),
                    "class Deck {\n  constructor() { this.n = 1; }\n}\nconst T = { d: new Deck() };".into(),
                ),
            ],
            vec!["T".into()],
            &[],
        );
        assert!(s.is_ok(), "{:?}", s.err());
        assert_eq!(
            redeclared("SyntaxError: redeclaration of 'Deck' at x"),
            Some("Deck")
        );
        assert_eq!(as_var("class Decks {}", "Deck"), None);
    }

    #[test]
    fn hid_scripts_read_and_send_reports() {
        let mut s = load(
            r#"var T = {
                 init: function () {
                   var cal = new Uint8Array(controller.getFeatureReport(0xD0));
                   controller.sendFeatureReport(0x01, [cal.length, cal[0]]);
                 },
                 incomingData: function (data, length) {
                   if (!(data instanceof Uint8Array)) throw new Error("not bytes");
                   if (data[0] === 0x01 && data[1] & 0x01) engine.setValue("[Channel1]", "play", 1);
                   var out = new Uint8Array([data[1], length]);
                   controller.sendOutputReport(0x80, out.buffer);
                   controller.send([9, 9, 9], 2, 0x81);
                 },
               };"#,
        );
        s.set_hid(Arc::new(|kind, id| match (kind, id) {
            (ReportKind::Feature, 0xD0) => vec![7, 8, 9],
            _ => vec![],
        }));
        s.start("dev", &st());
        assert_eq!(
            s.take_hid(),
            vec![HidOut::Feature {
                id: 1,
                data: vec![3, 7]
            }]
        );
        let c = cmds(s.sysex(&[0x01, 0x01, 0x00], &st()));
        assert!(matches!(c[..], [Command::Play { deck: DeckId::A }]));
        assert_eq!(
            s.take_hid(),
            vec![
                HidOut::Output {
                    id: 0x80,
                    data: vec![1, 3],
                    resend: false
                },
                HidOut::Output {
                    id: 0x81,
                    data: vec![9, 9],
                    resend: true
                },
            ]
        );
        assert!(s.take_midi().is_empty());
        assert!(s.errors().is_empty(), "{:?}", s.errors());
    }

    #[test]
    fn bindings_set_controls_and_send_midi() {
        let mut s = load(
            r#"var T = {
                 init: function (id) { midi.sendShortMsg(0xB0, 0x01, id === "dev" ? 1 : 2); },
                 play: function (ch, ctl, val, status, group) {
                   if (val > 0) engine.setValue(group, "play", !engine.getValue(group, "play"));
                   midi.sendShortMsg(status, ctl, 0x7F);
                 },
               };"#,
        );
        let state = st();
        s.start("dev", &state);
        assert_eq!(s.take_midi(), vec![vec![0xB0, 0x01, 1]]);
        let out = cmds(s.binding("T.play", "[Channel2]", 0x91, 0x0B, 0x7F, &state));
        assert!(
            matches!(out[..], [Command::Play { deck: DeckId::B }]),
            "{out:?}"
        );
        assert_eq!(s.take_midi(), vec![vec![0x91, 0x0B, 0x7F]]);
    }

    #[test]
    fn set_values_read_back_at_once() {
        let mut s = load(
            r#"var T = { flip: function (ch, ctl, val, st, group) {
                 engine.setValue(group, "pfl", 1);
                 midi.sendShortMsg(0x90, 0, engine.getValue(group, "pfl") ? 0x7F : 0);
               } };"#,
        );
        s.binding("T.flip", "[Channel1]", 0x90, 0, 0x7F, &st());
        assert_eq!(s.take_midi(), vec![vec![0x90, 0, 0x7F]]);
    }

    #[test]
    fn connections_fire_on_change() {
        let mut s = load(
            r#"var T = { init: function () {
                 engine.makeConnection("[Channel1]", "play_indicator", function (v) {
                   midi.sendShortMsg(0x90, 0x0B, v ? 0x7F : 0);
                 });
               } };"#,
        );
        let mut state = st();
        s.start("x", &state);
        s.tick(&state);
        assert!(s.take_midi().is_empty(), "no change yet");
        state.decks[0].playing = true;
        s.tick(&state);
        assert_eq!(s.take_midi(), vec![vec![0x90, 0x0B, 0x7F]]);
        s.tick(&state);
        assert!(s.take_midi().is_empty());
    }

    #[test]
    fn timers_run_and_stop() {
        let mut s = load(
            r#"var n = 0; var id;
               var T = { init: function () {
                 id = engine.beginTimer(20, function () { n++; midi.sendShortMsg(0xB0, 0, n); if (n == 2) engine.stopTimer(id); });
               } };"#,
        );
        let state = st();
        s.start("x", &state);
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(25));
            s.tick(&state);
        }
        assert_eq!(s.take_midi(), vec![vec![0xB0, 0, 1], vec![0xB0, 0, 2]]);
    }

    #[test]
    fn scratching_turns_ticks_into_jogs() {
        let mut s = load(
            r#"var T = { touch: function (ch, ctl, val) {
                 if (val) engine.scratchEnable(1, 128, 33 + 1/3, 0.125, 0.004); else engine.scratchDisable(1);
               }, turn: function (ch, ctl, val) { engine.scratchTick(1, val - 64); } };"#,
        );
        let state = st();
        assert!(matches!(
            cmds(s.binding("T.touch", "[Channel1]", 0x90, 0x36, 0x7F, &state))[..],
            [Command::ScratchStart { deck: DeckId::A }]
        ));
        let out = cmds(s.binding("T.turn", "[Channel1]", 0xB0, 0x22, 0x42, &state));
        let expect = 2.0 * 60.0 / (100.0 / 3.0) / 128.0;
        assert!(
            matches!(out[..], [Command::Jog { seconds, .. }] if (seconds - expect).abs() < 1e-9)
        );
        assert!(matches!(
            cmds(s.binding("T.touch", "[Channel1]", 0x90, 0x36, 0x00, &state))[..],
            [Command::ScratchEnd { deck: DeckId::A }]
        ));
    }

    #[test]
    fn settings_and_parameters() {
        let mut s = load(
            r#"var T = { go: function () {
                 midi.sendShortMsg(0xB0, 0, engine.getSetting("flag") ? 1 : 0);
                 engine.setParameter("[Master]", "crossfader", 1);
               } };"#,
        );
        let out = cmds(s.binding("T.go", "[Master]", 0x90, 0, 1, &st()));
        assert_eq!(s.take_midi(), vec![vec![0xB0, 0, 1]]);
        assert!(matches!(out[..], [Command::SetCrossfader { value }] if value == 1.0));
    }

    #[test]
    fn notes_can_be_routed() {
        let mut s = load(
            r#"var T = { go: function () {
                 midi.routeNote(7, 0x00, 0x20);
                 midi.routeNote(7, 0x01, 0x01);
               } };"#,
        );
        s.binding("T.go", "", 0x90, 0, 1, &st());
        assert_eq!(s.route(7, 0x00), 0x20);
        assert_eq!(s.route(7, 0x01), 0x01);
        assert_eq!(s.route(6, 0x00), 0x00);
    }

    #[test]
    fn errors_and_runaway_scripts_are_contained() {
        let mut s = load(
            r#"var T = { boom: function () { null.x; }, spin: function () { for (;;) {} },
                         deep: function f() { f(); } };"#,
        );
        let state = st();
        assert!(s.binding("T.boom", "", 0x90, 0, 1, &state).is_empty());
        let t = Instant::now();
        assert!(s.binding("T.spin", "", 0x90, 0, 1, &state).is_empty());
        assert!(t.elapsed() < Duration::from_secs(2));
        assert!(s.binding("T.deep", "", 0x90, 0, 1, &state).is_empty());
        assert!(s.binding("T.missing", "", 0x90, 0, 1, &state).is_empty());
        // Still works afterwards.
        let mut s2 = s;
        assert!(s2.tick(&state).is_empty());
    }

    #[test]
    fn a_syntax_error_fails_the_load() {
        let r = Script::load("bad", &[("bad.js".into(), "var = ;".into())], vec![], &[]);
        assert!(r.is_err());
    }

    #[test]
    fn color_mapper_picks_the_nearest() {
        let mut s = load(
            r#"var T = { go: function () {
                 var m = new ColorMapper({ 0xFF0000: 1, 0x00FF00: 2, 0x0000FF: 3 });
                 midi.sendShortMsg(0x90, 0, m.getValueForNearestColor(0x10E020));
               } };"#,
        );
        s.binding("T.go", "", 0x90, 0, 1, &st());
        assert_eq!(s.take_midi(), vec![vec![0x90, 0, 2]]);
    }
}
