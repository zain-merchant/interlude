//! Connects mappings to real MIDI devices through midir, and USB HID
//! controllers through [`crate::hid`].
//!
//! A background thread looks for known controllers every couple of
//! seconds, connects to each one, notices when one is unplugged, and keeps
//! their LEDs in step with the engine. Several controllers can be
//! connected at once. Incoming MIDI is handled on midir's own thread as
//! soon as it arrives.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};

use crate::learn::{Detector, Learned};
use crate::{Action, Catalog, HeldControls, Mapping, Source, State};

const CLIENT: &str = "Interlude";
const SCAN_EVERY: Duration = Duration::from_secs(2);
const LED_EVERY: Duration = Duration::from_millis(30);

/// The app side of a controller connection.
pub trait Host: Send + Sync + 'static {
    /// Current engine state, for mappings and LEDs.
    fn state(&self) -> State;
    /// Carries out what the controller asked for.
    fn act(&self, action: Action);
}

/// A connected controller and the mapping driving it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Connected {
    pub port: String,
    pub mapping: String,
    /// The mapping file, for Mixxx mappings.
    pub file: Option<PathBuf>,
}

/// Keeps a supported controller connected while it's plugged in. Stops when
/// dropped.
pub struct ControllerService {
    stop: Arc<AtomicBool>,
    /// Set to load the mappings again and reconnect.
    reload: Arc<AtomicBool>,
    connected: Arc<Mutex<Vec<Connected>>>,
    thread: Mutex<Option<JoinHandle<()>>>,
    /// MIDI learn: inputs opened on every port, and what they've seen.
    learning: Mutex<Option<Vec<MidiInputConnection<()>>>>,
    detector: Arc<Mutex<Detector>>,
    /// While set, connected controllers drive nothing.
    paused: Arc<AtomicBool>,
}

/// Passes a controller's actions on unless the controllers are paused.
struct Pausable {
    host: Arc<dyn Host>,
    paused: Arc<AtomicBool>,
}

impl Host for Pausable {
    fn state(&self) -> State {
        self.host.state()
    }
    fn act(&self, action: Action) {
        if !self.paused.load(Ordering::Relaxed) {
            self.host.act(action);
        }
    }
}

impl ControllerService {
    /// Starts watching for controllers, with the built-in mappings and
    /// Mixxx mappings from [`Catalog::default_dirs`]. Set
    /// `INTERLUDE_MIDI_LOG=1` to print every incoming message to stderr.
    pub fn start(host: Arc<dyn Host>) -> Self {
        Self::start_with(host, Catalog::default_dirs())
    }

    /// As [`Self::start`], with Mixxx mappings from `dirs`, in order: a
    /// file name in an earlier folder hides the same name in later ones.
    pub fn start_with(host: Arc<dyn Host>, dirs: Vec<PathBuf>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let reload = Arc::new(AtomicBool::new(false));
        let connected = Arc::new(Mutex::new(vec![]));
        let log = std::env::var_os("INTERLUDE_MIDI_LOG").is_some();
        let paused = Arc::new(AtomicBool::new(false));
        let host: Arc<dyn Host> = Arc::new(Pausable {
            host,
            paused: paused.clone(),
        });
        let thread = {
            let (stop, reload, connected) = (stop.clone(), reload.clone(), connected.clone());
            std::thread::Builder::new()
                .name("controller".into())
                .spawn(move || run(&dirs, host, stop, reload, connected, log))
                .ok()
        };
        Self {
            stop,
            reload,
            connected,
            thread: Mutex::new(thread),
            learning: Mutex::new(None),
            detector: Arc::new(Mutex::new(Detector::new())),
            paused,
        }
    }

    /// Pauses (or resumes) every connected controller: while paused,
    /// moving a control does nothing, so setting one up step by step
    /// doesn't start a deck playing. MIDI learn still hears everything.
    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
    }

    /// Loads the mapping files again and reconnects every controller, e.g.
    /// after a mapping was saved.
    pub fn reload(&self) {
        self.reload.store(true, Ordering::Relaxed);
    }

    /// Starts MIDI learn: listens to every MIDI input, mapped or not, for
    /// the next control moved. Starting again forgets what was half seen.
    pub fn learn_start(&self) {
        if let Ok(mut d) = self.detector.lock() {
            d.clear();
        }
        let Ok(mut learning) = self.learning.lock() else {
            return;
        };
        if learning.is_none() {
            let detector = self.detector.clone();
            *learning = Some(monitor_all(move |port, msg| {
                if let Ok(mut d) = detector.lock() {
                    d.feed(port, msg, Instant::now());
                }
            }));
        }
    }

    /// The control moved since [`Self::learn_start`], once it's known.
    pub fn learn_poll(&self) -> Option<Learned> {
        self.detector.lock().ok()?.poll(Instant::now())
    }

    /// Stops listening for MIDI learn.
    pub fn learn_stop(&self) {
        if let Ok(mut l) = self.learning.lock() {
            *l = None;
        }
    }

    /// Lets go of any held controls, darkens the controller's LEDs and
    /// stops watching. Called when the app quits; dropping does the same.
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Relaxed);
        let thread = self.thread.lock().ok().and_then(|mut t| t.take());
        if let Some(t) = thread {
            let _ = t.join();
        }
    }

    /// The connected controllers and their mappings.
    pub fn connected(&self) -> Vec<Connected> {
        self.connected.lock().map(|c| c.clone()).unwrap_or_default()
    }
}

impl Drop for ControllerService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct Connection {
    port_name: String,
    mapping: Arc<Mutex<Box<dyn Mapping>>>,
    /// What the controller is holding down, to let go of if it goes away.
    held: Arc<Mutex<HeldControls>>,
    _input: MidiInputConnection<()>,
    output: Option<MidiOutputConnection>,
    info: Connected,
}

impl Connection {
    /// Lets go of every control still held: a jog wheel touched, CUE or a
    /// hot cue pad down. Without this, pulling the cable mid-scratch would
    /// leave the deck stopped under a hand that isn't there.
    fn release_held(&self, host: &dyn Host) {
        let actions = match self.held.lock() {
            Ok(mut h) => h.release(),
            Err(p) => p.into_inner().release(),
        };
        for a in actions {
            host.act(a);
        }
    }
}

/// Lets a connection go: releases what it held, runs the mapping's
/// shutdown and darkens its LEDs.
fn close(mut c: Connection, host: &dyn Host, state: &State) {
    c.release_held(host);
    if let (Some(out), Ok(mut m)) = (&mut c.output, c.mapping.lock()) {
        // A script's shutdown sends its own goodbye; then darken the LEDs
        // the mapping drives directly.
        m.shutdown(state);
        for msg in m.leds(state) {
            let _ = out.send(&msg);
        }
        m.reset_leds();
        for msg in m.leds(&State::default()) {
            let _ = out.send(&msg);
        }
    }
}

/// Parses the mapping files. This takes a moment, so it runs on the
/// controller thread, off the app's startup path.
fn load_catalog(dirs: &[PathBuf]) -> Catalog {
    let catalog = Catalog::load(dirs);
    let mixxx = catalog.entries().len() - Catalog::built_in().entries().len();
    if mixxx > 0 {
        eprintln!("controller mappings: {mixxx} Mixxx mapping files");
    }
    catalog
}

fn run(
    dirs: &[PathBuf],
    host: Arc<dyn Host>,
    stop: Arc<AtomicBool>,
    reload: Arc<AtomicBool>,
    connected: Arc<Mutex<Vec<Connected>>>,
    log: bool,
) {
    let mut catalog = load_catalog(dirs);
    let mut conns: Vec<Connection> = vec![];
    #[cfg(feature = "hid")]
    let mut hid = crate::hid::HidControllers::default();
    // Ports a mapping matched but that couldn't be opened, so a port
    // that's busy elsewhere isn't retried (and reported) every scan.
    let mut failed: Vec<String> = vec![];
    let mut last_scan: Option<Instant> = None;
    while !stop.load(Ordering::Relaxed) {
        if reload.swap(false, Ordering::Relaxed) {
            catalog = load_catalog(dirs);
            let state = host.state();
            for c in conns.drain(..) {
                close(c, host.as_ref(), &state);
            }
            #[cfg(feature = "hid")]
            hid.close_all();
            failed.clear();
            last_scan = None;
        }
        if last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            last_scan = Some(Instant::now());
            let ports = input_port_names();
            conns.retain(|c| {
                let present = ports.contains(&c.port_name);
                if !present {
                    eprintln!("controller disconnected: {}", c.port_name);
                    c.release_held(host.as_ref());
                }
                present
            });
            failed.retain(|p| ports.contains(p));
            for name in &ports {
                if conns.iter().any(|c| &c.port_name == name) || failed.contains(name) {
                    continue;
                }
                let Some(entry) = catalog.find(name) else {
                    continue;
                };
                match connect(name, entry.create(), host.clone(), log) {
                    Some(mut c) => {
                        eprintln!("controller connected: {name} ({})", describe(entry));
                        c.info = Connected {
                            port: name.clone(),
                            mapping: entry.name.clone(),
                            file: match &entry.source {
                                Source::Mixxx(p) => Some(p.clone()),
                                Source::BuiltIn => None,
                            },
                        };
                        conns.push(c);
                    }
                    None => failed.push(name.clone()),
                }
            }
            #[allow(unused_mut)]
            let mut now: Vec<Connected> = conns.iter().map(|c| c.info.clone()).collect();
            #[cfg(feature = "hid")]
            {
                hid.scan(&catalog, &host, log);
                now.extend(hid.connected().cloned());
            }
            if let Ok(mut s) = connected.lock() {
                *s = now;
            }
        }

        if !conns.is_empty() {
            let state = host.state();
            for c in &mut conns {
                // The mapping's own work: script timers and callbacks.
                let actions = match c.mapping.lock() {
                    Ok(mut m) => m.poll(&state),
                    Err(_) => vec![],
                };
                if !actions.is_empty() {
                    if let Ok(mut h) = c.held.lock() {
                        actions.iter().for_each(|a| h.observe(a));
                    }
                    for a in actions {
                        host.act(a);
                    }
                }
                if let Some(out) = &mut c.output {
                    let msgs = match c.mapping.lock() {
                        Ok(mut m) => m.leds(&state),
                        Err(_) => vec![],
                    };
                    for msg in msgs {
                        let _ = out.send(&msg);
                    }
                }
            }
        }
        wait(LED_EVERY);
    }
    // Leave the controllers dark rather than showing stale state.
    let state = host.state();
    for c in conns {
        close(c, host.as_ref(), &state);
    }
    #[cfg(feature = "hid")]
    hid.close_all();
}

/// Which mapping drives a controller, and for a Mixxx one how much of it
/// works, for the log.
fn describe(entry: &crate::Entry) -> String {
    match (&entry.source, entry.preset()) {
        (Source::Mixxx(path), Some(p)) => {
            let c = p.coverage();
            let mut s = format!(
                "Mixxx mapping {:?} from {}: {} of {} controls work",
                entry.name,
                path.display(),
                c.supported,
                c.controls
            );
            if c.scripted > 0 {
                s += &format!(" plus {} script bindings", c.scripted);
            }
            s
        }
        _ => format!("built-in mapping {:?}", entry.name),
    }
}

/// Sleeps for `d`. On macOS this runs the thread's run loop instead, which
/// is how CoreMIDI tells the process that devices were plugged in or
/// removed. Without it the device list stays as it was at launch, so a
/// controller plugged in after the app started is never found.
#[cfg(target_os = "macos")]
fn wait(d: Duration) {
    use std::ffi::c_void;
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFRunLoopDefaultMode: *const c_void;
        fn CFRunLoopRunInMode(mode: *const c_void, seconds: f64, return_after_source: u8) -> i32;
    }
    // SAFETY: plain CoreFoundation calls on the current thread's run loop.
    // With no sources it returns at once, so fall back to sleeping.
    let t = Instant::now();
    unsafe { CFRunLoopRunInMode(kCFRunLoopDefaultMode, d.as_secs_f64(), 0) };
    if let Some(rest) = d.checked_sub(t.elapsed()) {
        std::thread::sleep(rest);
    }
}

#[cfg(not(target_os = "macos"))]
fn wait(d: Duration) {
    std::thread::sleep(d);
}

/// Names of all MIDI inputs currently present.
pub fn input_port_names() -> Vec<String> {
    let Ok(input) = MidiInput::new(CLIENT) else {
        return vec![];
    };
    input
        .ports()
        .iter()
        .filter_map(|p| input.port_name(p).ok())
        .collect()
}

fn connect(
    port_name: &str,
    mapping: Box<dyn Mapping>,
    host: Arc<dyn Host>,
    log: bool,
) -> Option<Connection> {
    let mapping = Arc::new(Mutex::new(mapping));
    let held = Arc::new(Mutex::new(HeldControls::default()));

    let input = MidiInput::new(CLIENT).ok()?;
    let port = input
        .ports()
        .into_iter()
        .find(|p| input.port_name(p).as_deref() == Ok(port_name))?;
    let m = mapping.clone();
    let h = held.clone();
    let input_conn = input
        .connect(
            &port,
            "Interlude in",
            move |_, msg, _| {
                if log {
                    eprintln!("midi in: {msg:02X?}");
                }
                let actions = match m.lock() {
                    Ok(mut m) => m.handle(msg, &host.state()),
                    Err(_) => return,
                };
                if let Ok(mut h) = h.lock() {
                    actions.iter().for_each(|a| h.observe(a));
                }
                for a in actions {
                    host.act(a);
                }
            },
            (),
        )
        .map_err(|e| eprintln!("could not open {port_name}: {e}"))
        .ok()?;

    // The output port usually has the same name; failing that, any port
    // the mapping recognises.
    let output = MidiOutput::new(CLIENT).ok().and_then(|out| {
        let names: Vec<_> = out
            .ports()
            .into_iter()
            .filter_map(|p| out.port_name(&p).ok().map(|n| (p, n)))
            .collect();
        let port = names
            .iter()
            .find(|(_, n)| n == port_name)
            .or_else(|| {
                names
                    .iter()
                    .find(|(_, n)| mapping.lock().is_ok_and(|m| m.matches(n)))
            })
            .map(|(p, _)| p.clone())?;
        out.connect(&port, "Interlude out").ok()
    });

    Some(Connection {
        port_name: port_name.to_owned(),
        mapping,
        held,
        _input: input_conn,
        output,
        info: Connected {
            port: port_name.to_owned(),
            mapping: String::new(),
            file: None,
        },
    })
}

/// Opens every MIDI input and calls `f(port, message)` for each message,
/// for capturing what a controller sends. Keep the returned connections
/// alive while monitoring.
pub fn monitor_all(
    f: impl Fn(&str, &[u8]) + Send + Sync + 'static,
) -> Vec<MidiInputConnection<()>> {
    let f = Arc::new(f);
    input_port_names()
        .into_iter()
        .filter_map(|name| {
            let input = MidiInput::new(CLIENT).ok()?;
            let port = input
                .ports()
                .into_iter()
                .find(|p| input.port_name(p).as_deref() == Ok(name.as_str()))?;
            let f = f.clone();
            let label = name.clone();
            input
                .connect(
                    &port,
                    "Interlude monitor",
                    move |_, msg, _| f(&label, msg),
                    (),
                )
                .ok()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[derive(Default)]
    struct Counter(AtomicUsize);

    impl Host for Counter {
        fn state(&self) -> State {
            State::default()
        }
        fn act(&self, _: Action) {
            self.0.fetch_add(1, Ordering::Relaxed);
        }
    }

    #[test]
    fn paused_controllers_drive_nothing() {
        let counter = Arc::new(Counter::default());
        let paused = Arc::new(AtomicBool::new(false));
        let host = Pausable {
            host: counter.clone(),
            paused: paused.clone(),
        };
        host.act(Action::Browse(1));
        paused.store(true, Ordering::Relaxed);
        host.act(Action::Browse(1));
        paused.store(false, Ordering::Relaxed);
        host.act(Action::Browse(1));
        assert_eq!(counter.0.load(Ordering::Relaxed), 2);
    }
}
