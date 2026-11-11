//! Connects mappings to real MIDI devices through midir.
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

use crate::{Action, Catalog, Mapping, Source, State};

const CLIENT: &str = "oss-dj";
const SCAN_EVERY: Duration = Duration::from_secs(2);
const LED_EVERY: Duration = Duration::from_millis(30);

/// The app side of a controller connection.
pub trait Host: Send + Sync + 'static {
    /// Current engine state, for mappings and LEDs.
    fn state(&self) -> State;
    /// Carries out what the controller asked for.
    fn act(&self, action: Action);
}

/// Keeps a supported controller connected while it's plugged in. Stops when
/// dropped.
pub struct ControllerService {
    stop: Arc<AtomicBool>,
    connected: Arc<Mutex<Vec<String>>>,
    thread: Option<JoinHandle<()>>,
}

impl ControllerService {
    /// Starts watching for controllers, with the built-in mappings and
    /// Mixxx mappings from [`Catalog::default_dirs`]. Set
    /// `OSS_DJ_MIDI_LOG=1` to print every incoming message to stderr.
    pub fn start(host: Arc<dyn Host>) -> Self {
        Self::start_with(host, vec![])
    }

    /// As [`Self::start`], also loading Mixxx mappings from `dirs`, which
    /// come before the default folders.
    pub fn start_with(host: Arc<dyn Host>, dirs: Vec<PathBuf>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let connected = Arc::new(Mutex::new(vec![]));
        let log = std::env::var_os("OSS_DJ_MIDI_LOG").is_some();
        let thread = {
            let (stop, connected) = (stop.clone(), connected.clone());
            std::thread::Builder::new()
                .name("controller".into())
                .spawn(move || {
                    // Parsing mapping files takes a moment; do it here, off
                    // the app's startup path, and only once.
                    let mut all = dirs;
                    all.extend(Catalog::default_dirs());
                    let catalog = Catalog::load(&all);
                    let mixxx = catalog.entries().len() - Catalog::built_in().entries().len();
                    if mixxx > 0 {
                        eprintln!("controller mappings: {mixxx} from Mixxx");
                    }
                    run(&catalog, host, stop, connected, log)
                })
                .ok()
        };
        Self {
            stop,
            connected,
            thread,
        }
    }

    /// The connected controllers' port names.
    pub fn connected(&self) -> Vec<String> {
        self.connected.lock().map(|c| c.clone()).unwrap_or_default()
    }
}

impl Drop for ControllerService {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

struct Connection {
    port_name: String,
    mapping: Arc<Mutex<Box<dyn Mapping>>>,
    _input: MidiInputConnection<()>,
    output: Option<MidiOutputConnection>,
}

fn run(
    catalog: &Catalog,
    host: Arc<dyn Host>,
    stop: Arc<AtomicBool>,
    connected: Arc<Mutex<Vec<String>>>,
    log: bool,
) {
    let mut conns: Vec<Connection> = vec![];
    // Ports a mapping matched but that couldn't be opened, so a port
    // that's busy elsewhere isn't retried (and reported) every scan.
    let mut failed: Vec<String> = vec![];
    let mut last_scan: Option<Instant> = None;
    while !stop.load(Ordering::Relaxed) {
        if last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            last_scan = Some(Instant::now());
            let ports = input_port_names();
            conns.retain(|c| {
                let present = ports.contains(&c.port_name);
                if !present {
                    eprintln!("controller disconnected: {}", c.port_name);
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
                    Some(c) => {
                        eprintln!("controller connected: {name} ({})", describe(entry));
                        conns.push(c);
                    }
                    None => failed.push(name.clone()),
                }
            }
            if let Ok(mut s) = connected.lock() {
                *s = conns.iter().map(|c| c.port_name.clone()).collect();
            }
        }

        if conns.iter().any(|c| c.output.is_some()) {
            let state = host.state();
            for c in &mut conns {
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
    for mut c in conns {
        if let (Some(out), Ok(mut m)) = (&mut c.output, c.mapping.lock()) {
            m.reset_leds();
            for msg in m.leds(&State::default()) {
                let _ = out.send(&msg);
            }
        }
    }
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
                s += &format!(", {} script bindings not supported yet", c.scripted);
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

    let input = MidiInput::new(CLIENT).ok()?;
    let port = input
        .ports()
        .into_iter()
        .find(|p| input.port_name(p).as_deref() == Ok(port_name))?;
    let m = mapping.clone();
    let input_conn = input
        .connect(
            &port,
            "oss-dj-in",
            move |_, msg, _| {
                if log {
                    eprintln!("midi in: {msg:02X?}");
                }
                let actions = match m.lock() {
                    Ok(mut m) => m.handle(msg, &host.state()),
                    Err(_) => return,
                };
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
        out.connect(&port, "oss-dj-out").ok()
    });

    Some(Connection {
        port_name: port_name.to_owned(),
        mapping,
        _input: input_conn,
        output,
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
                .connect(&port, "oss-dj-monitor", move |_, msg, _| f(&label, msg), ())
                .ok()
        })
        .collect()
}
