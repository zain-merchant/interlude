//! Connects Mixxx HID mappings to USB HID controllers through hidapi.
//!
//! Some controllers (Native Instruments' Traktor Kontrol range, older
//! Hercules consoles) speak USB HID rather than MIDI. Mixxx drives them
//! entirely from script: every report the device sends goes to the
//! mapping's `incomingData`, and the script sends output reports back to
//! light the controller up. This runs those same scripts.
//!
//! Each device gets its own thread, which reads reports as they arrive
//! (they come every millisecond or so while a jog wheel turns), runs the
//! script's timers about every 30 ms and writes what the script sent.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use hidapi::HidApi;

use crate::midi::{Connected, Host};
use crate::mixxx::{HidDevice, MixxxMidi};
use crate::script::{HidOut, ReportKind};
use crate::{Action, Catalog, HeldControls, Mapping, Source};

const TICK: Duration = Duration::from_millis(30);
/// How long a read waits for a report before the thread looks at timers
/// and the stop flag.
const READ_WAIT_MS: i32 = 5;
/// Longer than any report a DJ controller sends.
const REPORT_MAX: usize = 1024;

/// The HID controllers connected now.
#[derive(Default)]
pub(crate) struct HidControllers {
    api: Option<HidApi>,
    /// hidapi wouldn't start; said once.
    api_failed: bool,
    conns: Vec<Connection>,
    /// Devices a mapping matched but that couldn't be opened, so they
    /// aren't retried (and reported) every scan.
    failed: Vec<String>,
}

struct Connection {
    path: String,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    info: Connected,
}

impl Connection {
    fn finish(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl HidControllers {
    /// Connects HID controllers that have a mapping and lets go of ones
    /// that were unplugged.
    pub(crate) fn scan(&mut self, catalog: &Catalog, host: &Arc<dyn Host>, log: bool) {
        if self.api.is_none() && !self.api_failed {
            match HidApi::new() {
                Ok(api) => self.api = Some(api),
                Err(e) => {
                    eprintln!("HID controllers unavailable: {e}");
                    self.api_failed = true;
                }
            }
        } else if let Some(api) = &mut self.api {
            let _ = api.refresh_devices();
        }
        let Some(api) = &self.api else { return };

        let present: Vec<String> = api
            .device_list()
            .map(|d| d.path().to_string_lossy().into_owned())
            .collect();
        // A thread ends by itself when its device stops answering.
        let (keep, gone): (Vec<_>, Vec<_>) = self.conns.drain(..).partition(|c| {
            present.contains(&c.path) && c.thread.as_ref().is_some_and(|t| !t.is_finished())
        });
        self.conns = keep;
        for c in gone {
            eprintln!("controller disconnected: {}", c.info.port);
            c.finish();
        }
        self.failed.retain(|p| present.contains(p));

        for d in api.device_list() {
            let path = d.path().to_string_lossy().into_owned();
            if self.conns.iter().any(|c| c.path == path) || self.failed.contains(&path) {
                continue;
            }
            let device = HidDevice {
                vendor_id: d.vendor_id(),
                product_id: d.product_id(),
                usage_page: d.usage_page(),
                usage: d.usage(),
                interface_number: d.interface_number(),
            };
            let Some(entry) = catalog.find_hid(&device) else {
                continue;
            };
            let Some(mapping) = entry.create_mixxx() else {
                continue;
            };
            let name = [d.manufacturer_string(), d.product_string()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ");
            let name = if name.trim().is_empty() {
                entry.name.clone()
            } else {
                name.trim().to_owned()
            };
            let dev = match d.open_device(api) {
                Ok(dev) => dev,
                Err(e) => {
                    eprintln!("could not open {name}: {e}");
                    if cfg!(target_os = "linux") {
                        eprintln!("  (on Linux this usually needs a udev rule giving you access to the device; Mixxx's packages install one)");
                    }
                    self.failed.push(path);
                    continue;
                }
            };
            eprintln!(
                "controller connected: {name} (Mixxx HID mapping {:?})",
                entry.name
            );
            let stop = Arc::new(AtomicBool::new(false));
            let thread = {
                let (stop, host, label) = (stop.clone(), host.clone(), name.clone());
                std::thread::Builder::new()
                    .name("hid controller".into())
                    .spawn(move || run(dev, mapping, host, stop, &label, log))
                    .ok()
            };
            self.conns.push(Connection {
                path,
                stop,
                thread,
                info: Connected {
                    port: name,
                    mapping: entry.name.clone(),
                    file: match &entry.source {
                        Source::Mixxx(p) => Some(p.clone()),
                        Source::BuiltIn => None,
                    },
                },
            });
        }
    }

    pub(crate) fn connected(&self) -> impl Iterator<Item = &Connected> {
        self.conns.iter().map(|c| &c.info)
    }

    /// Lets every controller go: each runs its script's shutdown.
    pub(crate) fn close_all(&mut self) {
        for c in self.conns.drain(..) {
            c.finish();
        }
        self.failed.clear();
    }
}

impl Drop for HidControllers {
    fn drop(&mut self) {
        self.close_all();
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

/// One device's thread: reads reports into the mapping, runs its timers
/// and writes what it sends, until stopped or unplugged.
fn run(
    dev: hidapi::HidDevice,
    mut mapping: MixxxMidi,
    host: Arc<dyn Host>,
    stop: Arc<AtomicBool>,
    name: &str,
    log: bool,
) {
    let dev = Arc::new(Mutex::new(dev));
    {
        let dev = dev.clone();
        mapping.set_hid(Arc::new(move |kind, id| read_report(&lock(&dev), kind, id)));
    }
    let mut held = HeldControls::default();
    let mut sent: HashMap<u8, Vec<u8>> = HashMap::new();
    let act = |actions: Vec<Action>, held: &mut HeldControls| {
        for a in actions {
            held.observe(&a);
            host.act(a);
        }
    };
    let mut buf = [0u8; REPORT_MAX];
    let mut last_tick: Option<Instant> = None;
    let mut unplugged = false;
    while !stop.load(Ordering::Relaxed) {
        let read = lock(&dev).read_timeout(&mut buf, READ_WAIT_MS);
        match read {
            Ok(0) => {}
            Ok(n) => {
                if log {
                    eprintln!("hid in ({name}): {:02X?}", &buf[..n]);
                }
                let actions = mapping.handle(&buf[..n], &host.state());
                act(actions, &mut held);
                write(&dev, &mut mapping, &mut sent);
            }
            Err(e) => {
                eprintln!("controller {name} stopped answering: {e}");
                unplugged = true;
                break;
            }
        }
        if last_tick.is_none_or(|t| t.elapsed() >= TICK) {
            last_tick = Some(Instant::now());
            let actions = mapping.poll(&host.state());
            act(actions, &mut held);
            write(&dev, &mut mapping, &mut sent);
        }
    }
    // Without this, pulling the cable mid-scratch would leave the deck
    // stopped under a hand that isn't there.
    for a in held.release() {
        host.act(a);
    }
    if !unplugged {
        // The script's goodbye: usually turning its lights off.
        mapping.shutdown(&host.state());
        write(&dev, &mut mapping, &mut sent);
    }
}

/// Sends the reports the script queued. An output report that's the same
/// as the last one with its id is skipped unless the script asked for it
/// to go anyway, as in Mixxx.
fn write(dev: &Mutex<hidapi::HidDevice>, mapping: &mut MixxxMidi, sent: &mut HashMap<u8, Vec<u8>>) {
    for out in mapping.take_hid() {
        match out {
            HidOut::Output { id, data, resend } => {
                if !resend && sent.get(&id) == Some(&data) {
                    continue;
                }
                let _ = lock(dev).write(&framed(id, &data));
                sent.insert(id, data);
            }
            HidOut::Feature { id, data } => {
                let _ = lock(dev).send_feature_report(&framed(id, &data));
            }
        }
    }
}

/// A report as hidapi takes it: the id, then the data.
fn framed(id: u8, data: &[u8]) -> Vec<u8> {
    let mut b = Vec::with_capacity(data.len() + 1);
    b.push(id);
    b.extend_from_slice(data);
    b
}

/// Reads a report on request, without its id, as Mixxx hands it to
/// scripts.
fn read_report(dev: &hidapi::HidDevice, kind: ReportKind, id: u8) -> Vec<u8> {
    let mut buf = vec![0u8; REPORT_MAX];
    buf[0] = id;
    let n = match kind {
        ReportKind::Input => dev.get_input_report(&mut buf),
        ReportKind::Feature => dev.get_feature_report(&mut buf),
    };
    match n {
        Ok(n) if n > 1 => buf[1..n.min(REPORT_MAX)].to_vec(),
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_are_framed_with_their_id() {
        assert_eq!(framed(0x80, &[1, 2]), vec![0x80, 1, 2]);
    }
}
