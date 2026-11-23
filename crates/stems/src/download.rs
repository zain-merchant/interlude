//! Fetching the model file in the background.
//!
//! [`fetch`] gets one file into a `.part` beside where it belongs, picking
//! up where an earlier try stopped, and checks it against a known hash.
//! [`Downloader`] runs that on a thread of its own: it tries again when the
//! connection drops, and can be cancelled, retried and undone.

use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};

/// Room to leave on the disk once the file is in.
const RESERVE: u64 = 200_000_000;
/// How often progress is reported, at most.
const REPORT_EVERY: Duration = Duration::from_millis(250);
/// Times the connection may sit silent before it counts as dropped.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const READ_TIMEOUT: Duration = Duration::from_secs(20);

/// What to download, and what it has to be when it arrives.
#[derive(Debug, Clone)]
pub struct Source {
    pub url: String,
    /// SHA-256 of the whole file, in hex.
    pub sha256: String,
    /// Its exact size.
    pub bytes: u64,
}

/// Why a download stopped.
#[derive(Debug, thiserror::Error)]
pub enum Failure {
    /// It was asked to.
    #[error("The download was cancelled.")]
    Cancelled,
    /// No connection, or it dropped. Worth trying again by itself.
    #[error("The download server can't be reached.")]
    Network(String),
    #[error("The download server wouldn't send the file (error {0}).")]
    Refused(u16),
    #[error("The download server sent something else.")]
    Unexpected,
    #[error("The download arrived damaged.")]
    Damaged,
    /// Bytes to free before it fits.
    #[error("There isn't enough space on the disk. Free up {} MB.", .0.div_ceil(1_000_000))]
    NoSpace(u64),
    #[error("The download couldn't be saved: {0}.")]
    Io(std::io::Error),
}

impl From<std::io::Error> for Failure {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            ErrorKind::StorageFull | ErrorKind::QuotaExceeded => Failure::NoSpace(RESERVE),
            _ => Failure::Io(e),
        }
    }
}

/// Where an unfinished download of `dest` is kept.
pub fn part_path(dest: &Path) -> PathBuf {
    dest.with_extension("part")
}

/// Downloads `source` into `dest`'s `.part`, carrying on from whatever is
/// already there, and checks it. Nothing appears at `dest`: the caller
/// moves it there. `stop` is asked between reads; `progress` gets the bytes
/// that are in, starting with the ones that already were.
pub fn fetch(
    source: &Source,
    dest: &Path,
    stop: &dyn Fn() -> bool,
    progress: &mut dyn FnMut(u64),
) -> Result<(), Failure> {
    let part = part_path(dest);
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut have = fs::metadata(&part).map_or(0, |m| m.len());
    if have > source.bytes {
        fs::remove_file(&part)?;
        have = 0;
    }
    if have < source.bytes {
        if let Some(free) = part.parent().and_then(free_space) {
            let need = source.bytes - have + RESERVE;
            if free < need {
                return Err(Failure::NoSpace(need - free));
            }
        }
        progress(have);
        receive(source, &part, have, stop, progress)?;
    }
    progress(source.bytes);
    let got = file_sha256(&part)?;
    if !got.eq_ignore_ascii_case(&source.sha256) {
        // Never carry on from this one.
        fs::remove_file(&part)?;
        return Err(Failure::Damaged);
    }
    Ok(())
}

/// Appends the rest of the file to `part`, which holds its first `have` bytes.
fn receive(
    source: &Source,
    part: &Path,
    have: u64,
    stop: &dyn Fn() -> bool,
    progress: &mut dyn FnMut(u64),
) -> Result<(), Failure> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_resolve(Some(CONNECT_TIMEOUT))
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .timeout_per_read(Some(READ_TIMEOUT))
        .build()
        .into();
    // A compressed answer couldn't be carried on from.
    let mut request = agent.get(&source.url).header("accept-encoding", "identity");
    if have > 0 {
        request = request.header("range", format!("bytes={have}-"));
    }
    let response = request
        .call()
        .map_err(|e| Failure::Network(e.to_string()))?;
    let header = |name: &str| response.headers().get(name).and_then(|v| v.to_str().ok());
    let start = match response.status().as_u16() {
        200 => {
            let length = header("content-length").and_then(|v| v.parse::<u64>().ok());
            if length.is_some_and(|n| n != source.bytes) {
                return Err(Failure::Unexpected);
            }
            0
        }
        206 => {
            let Some((start, total)) = header("content-range").and_then(content_range) else {
                return Err(Failure::Unexpected);
            };
            if start != have || total.is_some_and(|n| n != source.bytes) {
                return Err(Failure::Unexpected);
            }
            start
        }
        // It can't carry on from here: the next try starts over.
        416 => {
            fs::remove_file(part)?;
            return Err(Failure::Network("range refused".into()));
        }
        s @ (408 | 425 | 429 | 500..=599) => return Err(Failure::Network(format!("status {s}"))),
        s => return Err(Failure::Refused(s)),
    };
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(start == 0)
        .append(start > 0)
        .open(part)?;
    let mut body = response.into_body().into_reader();
    let mut buf = vec![0u8; 1 << 16];
    let mut done = start;
    while done < source.bytes {
        let n = body
            .read(&mut buf)
            .map_err(|e| Failure::Network(e.to_string()))?;
        if stop() {
            return Err(Failure::Cancelled);
        }
        if n == 0 {
            return Err(Failure::Network("the connection closed early".into()));
        }
        if done + n as u64 > source.bytes {
            return Err(Failure::Unexpected);
        }
        file.write_all(&buf[..n])?;
        done += n as u64;
        progress(done);
    }
    file.sync_all()?;
    Ok(())
}

/// The start and, if it's given, the total of a `Content-Range`.
fn content_range(v: &str) -> Option<(u64, Option<u64>)> {
    let (range, total) = v.strip_prefix("bytes ")?.split_once('/')?;
    let start = range.split_once('-')?.0.parse().ok()?;
    Some((start, total.parse().ok()))
}

/// Bytes free on the disk `dir` is on, where the system can say.
#[cfg(unix)]
pub(crate) fn free_space(dir: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let path = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(path.as_ptr(), &mut s) } != 0 {
        return None;
    }
    #[allow(clippy::unnecessary_cast)]
    Some(s.f_bavail as u64 * s.f_frsize as u64)
}

#[cfg(not(unix))]
pub(crate) fn free_space(_dir: &Path) -> Option<u64> {
    None
}

/// SHA-256 of a file on disk, as hex.
pub fn file_sha256(path: &Path) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(hex(&hash.finalize()))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// How a download is doing. `done` is how many bytes are in.
#[derive(Debug, Clone, PartialEq)]
pub enum State {
    /// Not here, and not on its way.
    Missing {
        done: u64,
    },
    /// On its way. `left` is a guess at the seconds to go, once there's
    /// enough to guess from.
    Downloading {
        done: u64,
        left: Option<u64>,
    },
    /// The connection is down; it carries on by itself.
    Waiting {
        done: u64,
    },
    Ready,
    /// It stopped, and needs the user.
    Failed {
        done: u64,
        error: String,
    },
}

impl State {
    /// Bytes that are in, unless all of them are.
    fn done(&self) -> u64 {
        match *self {
            State::Missing { done }
            | State::Downloading { done, .. }
            | State::Waiting { done }
            | State::Failed { done, .. } => done,
            State::Ready => 0,
        }
    }
}

/// How things are when nothing is running.
fn on_disk(source: &Source, dest: &Path) -> State {
    // It only gets its name once it's been checked, so the size is enough to
    // know it by.
    if fs::metadata(dest).is_ok_and(|m| m.is_file() && m.len() == source.bytes) {
        return State::Ready;
    }
    let part = fs::metadata(part_path(dest)).map_or(0, |m| m.len());
    State::Missing {
        done: part.min(source.bytes),
    }
}

struct Inner {
    state: State,
    wanted: bool,
    /// Bumped by everything the user does, so a fetch that was under way
    /// knows it has been overtaken.
    epoch: u64,
    /// A worker thread is running. There's never more than one.
    running: bool,
}

struct Shared {
    source: Source,
    dest: PathBuf,
    /// How long to wait before each try again; the last one repeats.
    backoff: Vec<Duration>,
    inner: Mutex<Inner>,
    wake: Condvar,
    /// Held while telling `on_change`, so what it's told never goes back in time.
    telling: Mutex<()>,
    on_change: Box<dyn Fn(&State) + Send + Sync>,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Reports the state as it is now. Never call it with `inner` locked.
    fn tell(&self) {
        let _turn = self.telling.lock().unwrap_or_else(|e| e.into_inner());
        let state = self.lock().state.clone();
        (self.on_change)(&state);
    }
}

/// Downloads one file on a background thread, one try at a time.
pub struct Downloader {
    shared: Arc<Shared>,
}

impl Downloader {
    /// Doesn't start anything. `on_change` hears every change of state, and
    /// progress a few times a second; it mustn't block for long.
    pub fn new(
        source: Source,
        dest: PathBuf,
        on_change: impl Fn(&State) + Send + Sync + 'static,
    ) -> Self {
        let backoff = [2, 5, 15, 30, 60].map(Duration::from_secs).to_vec();
        Self::with_backoff(source, dest, backoff, on_change)
    }

    /// [`Downloader::new`] with its own waits between tries.
    pub fn with_backoff(
        source: Source,
        dest: PathBuf,
        backoff: Vec<Duration>,
        on_change: impl Fn(&State) + Send + Sync + 'static,
    ) -> Self {
        let state = on_disk(&source, &dest);
        Self {
            shared: Arc::new(Shared {
                source,
                dest,
                backoff,
                inner: Mutex::new(Inner {
                    state,
                    wanted: false,
                    epoch: 0,
                    running: false,
                }),
                wake: Condvar::new(),
                telling: Mutex::new(()),
                on_change: Box::new(on_change),
            }),
        }
    }

    pub fn state(&self) -> State {
        self.shared.lock().state.clone()
    }

    /// Starts the download, or if it's waiting or has failed, tries again
    /// now. Does nothing if it's under way or done.
    pub fn start(&self) {
        {
            let mut g = self.shared.lock();
            match g.state {
                State::Ready | State::Downloading { .. } => return,
                _ => {}
            }
            g.wanted = true;
            g.epoch += 1;
            g.state = State::Downloading {
                done: g.state.done(),
                left: None,
            };
            if !g.running {
                g.running = true;
                let shared = self.shared.clone();
                let spawned = std::thread::Builder::new()
                    .name("stems-download".into())
                    .spawn(move || work(&shared));
                if let Err(e) = spawned {
                    g.running = false;
                    g.wanted = false;
                    g.state = State::Failed {
                        done: g.state.done(),
                        error: Failure::Io(e).to_string(),
                    };
                }
            }
        }
        self.shared.wake.notify_all();
        self.shared.tell();
    }

    /// Stops the download. What's already in is kept, for [`Downloader::start`].
    pub fn cancel(&self) {
        {
            let mut g = self.shared.lock();
            if g.state == State::Ready {
                return;
            }
            g.wanted = false;
            g.epoch += 1;
            g.state = State::Missing {
                done: g.state.done(),
            };
        }
        self.shared.wake.notify_all();
        self.shared.tell();
    }

    /// Deletes the file, or as much of it as is in, stopping the download first.
    pub fn remove(&self) -> std::io::Result<()> {
        let result = {
            let mut g = self.shared.lock();
            let gone = |p: &Path| match fs::remove_file(p) {
                Err(e) if e.kind() != ErrorKind::NotFound => Err(e),
                _ => Ok(()),
            };
            g.wanted = false;
            g.epoch += 1;
            let result = gone(&self.shared.dest).and_then(|()| gone(&part_path(&self.shared.dest)));
            g.state = on_disk(&self.shared.source, &self.shared.dest);
            result
        };
        self.shared.wake.notify_all();
        self.shared.tell();
        result
    }
}

impl Drop for Downloader {
    fn drop(&mut self) {
        let mut g = self.shared.lock();
        g.wanted = false;
        g.epoch += 1;
        drop(g);
        self.shared.wake.notify_all();
    }
}

/// The worker: fetches until the file is in, it fails for good, or it isn't
/// wanted any more.
fn work(shared: &Shared) {
    // Below anything the user is waiting on.
    #[cfg(target_os = "macos")]
    unsafe {
        libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0);
    }
    let mut tries = 0;
    let mut damaged = false;
    let mut epoch = None;
    loop {
        {
            let mut g = shared.lock();
            if !g.wanted {
                g.running = false;
                return;
            }
            if epoch != Some(g.epoch) {
                epoch = Some(g.epoch);
                tries = 0;
                damaged = false;
            }
            g.state = State::Downloading {
                done: g.state.done(),
                left: None,
            };
        }
        shared.tell();
        let mine = epoch.unwrap_or_default();
        let overtaken = || shared.lock().epoch != mine;
        let mut pace = Pace::new();
        let mut got = None;
        let result = fetch(&shared.source, &shared.dest, &overtaken, &mut |done| {
            let first = got.is_none();
            if done > *got.get_or_insert(done) {
                // Bytes are arriving, so the next drop starts the waits over.
                tries = 0;
            }
            let left = pace.left(done, shared.source.bytes);
            {
                let mut g = shared.lock();
                if g.epoch != mine {
                    return;
                }
                g.state = State::Downloading { done, left };
            }
            if first || pace.due() {
                shared.tell();
            }
        });

        let mut g = shared.lock();
        if g.epoch != mine {
            continue;
        }
        let done = g.state.done();
        // Moved into place under the lock, so a cancel or remove either
        // comes first or finds the finished file.
        let result = result.and_then(|()| {
            fs::rename(part_path(&shared.dest), &shared.dest).map_err(Failure::from)
        });
        match result {
            Ok(()) => {
                eprintln!("stems: the model is in");
                g.state = State::Ready;
            }
            Err(Failure::Cancelled) => continue,
            Err(Failure::Network(why)) => {
                eprintln!("stems: model download waiting to try again ({why})");
                let wait = shared.backoff.get(tries).or(shared.backoff.last());
                let wait = wait.copied().unwrap_or(Duration::from_secs(60));
                tries += 1;
                g.state = State::Waiting { done };
                drop(g);
                shared.tell();
                let g = shared.lock();
                let _ = shared.wake.wait_timeout_while(g, wait, |g| g.epoch == mine);
                continue;
            }
            Err(Failure::Damaged) if !damaged => {
                eprintln!("stems: the model download arrived damaged; starting over once");
                damaged = true;
                g.state = State::Downloading {
                    done: 0,
                    left: None,
                };
                continue;
            }
            Err(e) => {
                eprintln!("stems: model download failed: {e}");
                let done = if matches!(e, Failure::Damaged) {
                    0
                } else {
                    done
                };
                g.state = State::Failed {
                    done,
                    error: e.to_string(),
                };
            }
        }
        g.wanted = false;
        g.running = false;
        drop(g);
        shared.tell();
        return;
    }
}

/// How fast bytes are arriving, smoothed, from what this try has received
/// (not what an earlier one left behind).
struct Pace {
    told: Instant,
    since: Instant,
    from: Option<u64>,
    rate: Option<f64>,
}

impl Pace {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            told: now,
            since: now,
            from: None,
            rate: None,
        }
    }

    /// True a few times a second.
    fn due(&mut self) -> bool {
        let due = self.told.elapsed() >= REPORT_EVERY;
        if due {
            self.told = Instant::now();
        }
        due
    }

    /// Seconds left at the pace so far.
    fn left(&mut self, done: u64, total: u64) -> Option<u64> {
        let from = *self.from.get_or_insert(done);
        let secs = self.since.elapsed().as_secs_f64();
        if secs >= 1.0 {
            let now = done.saturating_sub(from) as f64 / secs;
            self.rate = Some(self.rate.map_or(now, |r| r * 0.7 + now * 0.3));
            self.since = Instant::now();
            self.from = Some(done);
        }
        let rate = self.rate.filter(|r| *r > 0.0)?;
        Some((total.saturating_sub(done) as f64 / rate).ceil() as u64)
    }
}
