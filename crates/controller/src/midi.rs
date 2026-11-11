//! Connects mappings to real MIDI devices through midir.
//!
//! A background thread looks for a known controller every couple of
//! seconds, connects to it, notices when it's unplugged, and keeps its LEDs
//! in step with the engine. Incoming MIDI is handled on midir's own thread
//! as soon as it arrives.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};

use crate::{mappings, Action, HeldControls, Mapping, State};

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
    connected: Arc<Mutex<Option<String>>>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl ControllerService {
    /// Starts watching for controllers. Set `OSS_DJ_MIDI_LOG=1` to print
    /// every incoming message to stderr.
    pub fn start(host: Arc<dyn Host>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let connected = Arc::new(Mutex::new(None));
        let log = std::env::var_os("OSS_DJ_MIDI_LOG").is_some();
        let thread = {
            let (stop, connected) = (stop.clone(), connected.clone());
            std::thread::Builder::new()
                .name("controller".into())
                .spawn(move || run(host, stop, connected, log))
                .ok()
        };
        Self {
            stop,
            connected,
            thread: Mutex::new(thread),
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

    /// The connected controller's port name, if any.
    pub fn connected(&self) -> Option<String> {
        self.connected.lock().ok().and_then(|c| c.clone())
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

fn run(
    host: Arc<dyn Host>,
    stop: Arc<AtomicBool>,
    connected: Arc<Mutex<Option<String>>>,
    log: bool,
) {
    let mut conn: Option<Connection> = None;
    let mut last_scan: Option<Instant> = None;
    while !stop.load(Ordering::Relaxed) {
        if last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            last_scan = Some(Instant::now());
            let ports = input_port_names();
            if let Some(c) = &conn {
                if !ports.contains(&c.port_name) {
                    eprintln!("controller disconnected: {}", c.port_name);
                    c.release_held(host.as_ref());
                    conn = None;
                }
            }
            if conn.is_none() {
                conn = ports
                    .iter()
                    .find_map(|name| connect(name, host.clone(), log));
                if let Some(c) = &conn {
                    eprintln!("controller connected: {}", c.port_name);
                }
            }
            if let Ok(mut s) = connected.lock() {
                *s = conn.as_ref().map(|c| c.port_name.clone());
            }
        }

        if let Some(c) = &mut conn {
            if let Some(out) = &mut c.output {
                let msgs = match c.mapping.lock() {
                    Ok(mut m) => m.leds(&host.state()),
                    Err(_) => vec![],
                };
                for msg in msgs {
                    let _ = out.send(&msg);
                }
            }
        }
        wait(LED_EVERY);
    }
    // Leave the controller dark rather than showing stale state.
    if let Some(mut c) = conn {
        c.release_held(host.as_ref());
        if let (Some(out), Ok(mut m)) = (&mut c.output, c.mapping.lock()) {
            m.reset_leds();
            for msg in m.leds(&State::default()) {
                let _ = out.send(&msg);
            }
        }
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

fn connect(port_name: &str, host: Arc<dyn Host>, log: bool) -> Option<Connection> {
    let mapping = mappings().into_iter().find(|m| m.matches(port_name))?;
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
            "oss-dj-in",
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
        out.connect(&port, "oss-dj-out").ok()
    });

    Some(Connection {
        port_name: port_name.to_owned(),
        mapping,
        held,
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
