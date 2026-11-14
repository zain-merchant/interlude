//! The app's log file, so a tester can send in what went wrong.
//!
//! Everything the app prints to stderr (its own messages, a panic, the
//! audio and controller threads, ONNX Runtime) also goes to
//! `logs/oss-dj.log` in the app's data folder, each line with the time.
//! The previous few sessions' logs are kept as `oss-dj.1.log` and so on.
//!
//! On macOS and Linux stderr is routed through a pipe that a small thread
//! copies to both the terminal and the file. Elsewhere only panics and
//! the UI's errors reach the file.
//!
//! So that a log always says how a session ended, it also records:
//! * a native crash (a bad memory access, an abort) or a quit signal, with
//!   the signal and, on macOS, a backtrace, written straight to the file;
//! * "closed normally" when the app quits on its own;
//! * every few minutes, that it's still running and how much memory it has
//!   used at most.
//!
//! A log that ends with none of these was killed outright (Force Quit, or
//! macOS ending it for memory), which nothing inside the app can catch.

use std::fs::File;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// Sessions kept besides the current one.
const KEEP: usize = 3;
/// A session's log stops growing past this, so a loop of errors can't
/// fill the disk.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

struct Log {
    file: File,
    written: u64,
}

static LOG: OnceLock<Mutex<Log>> = OnceLock::new();
static PATH: OnceLock<PathBuf> = OnceLock::new();

/// Where this session's log is written, once `start` has run.
pub fn path() -> Option<&'static Path> {
    PATH.get().map(|p| p.as_path())
}

/// Opens the log file and starts copying stderr into it. Call once, first
/// thing. Failure leaves stderr as it was.
pub fn start() {
    let Some(dir) = dirs::data_dir().map(|d| d.join("oss-dj").join("logs")) else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("oss-dj.log");
    rotate(&dir);
    let Ok(file) = File::create(&path) else {
        return;
    };
    let _ = PATH.set(path);
    let _ = LOG.set(Mutex::new(Log { file, written: 0 }));
    write_line(&format!(
        "oss-dj {} on {} {} started",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    ));

    // A panic is written straight to the file as well, since the process
    // may end before the stderr copy catches up.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        write_line(&format!(
            "panic in thread '{}': {info}",
            thread.name().unwrap_or("unnamed")
        ));
        default_hook(info);
    }));

    #[cfg(unix)]
    {
        capture_stderr();
        crash::install();
    }
    heartbeat();
}

/// Notes in the log that the app quit on its own. Call as it exits.
pub fn closed() {
    write_line(&format!("closed normally after {}", uptime()));
}

static STARTED: OnceLock<std::time::Instant> = OnceLock::new();

fn uptime() -> String {
    let secs = STARTED.get().map_or(0, |t| t.elapsed().as_secs());
    match secs {
        s if s < 60 => format!("{s} s"),
        s if s < 3600 => format!("{} min", s / 60),
        s => format!("{} h {} min", s / 3600, (s % 3600) / 60),
    }
}

/// Peak memory use so far, in MB.
fn peak_memory_mb() -> Option<u64> {
    #[cfg(unix)]
    {
        // SAFETY: getrusage fills the struct it's given.
        let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
        if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) } != 0 {
            return None;
        }
        let max = usage.ru_maxrss as u64;
        // Bytes on macOS, kilobytes on Linux.
        let bytes = if cfg!(target_os = "macos") { max } else { max * 1024 };
        Some(bytes / (1024 * 1024))
    }
    #[cfg(not(unix))]
    None
}

/// Every five minutes, a line saying the app is alive and its peak memory,
/// so a log that stops shows roughly when, and whether memory was climbing.
fn heartbeat() {
    let _ = STARTED.set(std::time::Instant::now());
    let _ = std::thread::Builder::new()
        .name("log heartbeat".into())
        .spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(300));
            let mem = peak_memory_mb().map_or(String::new(), |m| format!(", peak memory {m} MB"));
            write_line(&format!("still running: up {}{mem}", uptime()));
        });
}

/// Writes native crashes and quit signals to the log file. A signal
/// handler can't take locks or allocate, so it writes to the file's
/// descriptor directly with preformatted text.
#[cfg(unix)]
mod crash {
    use std::os::fd::AsRawFd;
    use std::sync::atomic::{AtomicI32, Ordering};

    static FD: AtomicI32 = AtomicI32::new(-1);

    const SIGNALS: [(libc::c_int, &str); 8] = [
        (libc::SIGSEGV, "SIGSEGV (bad memory access)"),
        (libc::SIGBUS, "SIGBUS (bad memory access)"),
        (libc::SIGILL, "SIGILL (illegal instruction)"),
        (libc::SIGFPE, "SIGFPE (arithmetic error)"),
        (libc::SIGABRT, "SIGABRT (abort)"),
        (libc::SIGTERM, "SIGTERM (asked to quit)"),
        (libc::SIGHUP, "SIGHUP (its terminal closed)"),
        (libc::SIGINT, "SIGINT (Ctrl-C)"),
    ];

    /// The handlers that were there before ours, put back once ours has
    /// written its line, so Rust's stack overflow message and the default
    /// behaviour (a crash report, the process ending) still happen.
    static mut PREVIOUS: [Option<libc::sigaction>; 8] = [None; 8];

    pub fn install() {
        let Some(log) = super::LOG.get() else { return };
        let fd = log.lock().unwrap_or_else(|e| e.into_inner()).file.as_raw_fd();
        // A duplicate, so it stays open however the file is handled.
        // SAFETY: plain libc calls on descriptors this module owns.
        let fd = unsafe { libc::dup(fd) };
        if fd < 0 {
            return;
        }
        FD.store(fd, Ordering::SeqCst);
        for (i, (sig, _)) in SIGNALS.iter().enumerate() {
            // SAFETY: installs a handler that only makes async-signal-safe
            // calls; the old action is saved before anything can fire.
            unsafe {
                let mut new: libc::sigaction = std::mem::zeroed();
                new.sa_sigaction = handler as *const () as usize;
                new.sa_flags = libc::SA_SIGINFO | libc::SA_ONSTACK;
                libc::sigemptyset(&mut new.sa_mask);
                let mut old: libc::sigaction = std::mem::zeroed();
                if libc::sigaction(*sig, &new, &mut old) == 0 {
                    PREVIOUS[i] = Some(old);
                }
            }
        }
    }

    fn put(fd: libc::c_int, text: &[u8]) {
        // SAFETY: write(2) is async-signal-safe.
        unsafe {
            libc::write(fd, text.as_ptr().cast(), text.len());
        }
    }

    extern "C" fn handler(sig: libc::c_int, _info: *mut libc::siginfo_t, _ctx: *mut libc::c_void) {
        let fd = FD.load(Ordering::SeqCst);
        let Some(i) = SIGNALS.iter().position(|(s, _)| *s == sig) else {
            return;
        };
        if fd >= 0 {
            let fatal = i < 5;
            put(fd, if fatal { b"CRASHED: signal " } else { b"stopped by signal " });
            put(fd, SIGNALS[i].1.as_bytes());
            put(fd, b"\n");
            #[cfg(target_os = "macos")]
            if fatal {
                put(fd, b"backtrace:\n");
                let mut frames = [std::ptr::null_mut(); 64];
                // SAFETY: backtrace and backtrace_symbols_fd don't allocate
                // on macOS and write straight to the descriptor.
                unsafe {
                    let n = libc::backtrace(frames.as_mut_ptr(), frames.len() as libc::c_int);
                    libc::backtrace_symbols_fd(frames.as_ptr(), n, fd);
                }
            }
            // SAFETY: fsync is async-signal-safe.
            unsafe {
                libc::fsync(fd);
            }
        }
        // SAFETY: puts back the earlier action (or the default) and raises
        // the signal again; it's blocked until this handler returns, then
        // goes to that action. A real fault also happens again on return.
        unsafe {
            let previous = PREVIOUS[i];
            match previous {
                Some(old) => libc::sigaction(sig, &old, std::ptr::null_mut()),
                None => {
                    libc::signal(sig, libc::SIG_DFL);
                    0
                }
            };
            libc::raise(sig);
        }
    }
}

/// Shifts `oss-dj.log` to `oss-dj.1.log` and so on, dropping the oldest.
fn rotate(dir: &Path) {
    let name = |i: usize| match i {
        0 => dir.join("oss-dj.log"),
        i => dir.join(format!("oss-dj.{i}.log")),
    };
    let _ = std::fs::remove_file(name(KEEP));
    for i in (0..KEEP).rev() {
        let _ = std::fs::rename(name(i), name(i + 1));
    }
}

/// Appends one line to the log file, with the time.
pub fn write_line(line: &str) {
    let Some(log) = LOG.get() else { return };
    let mut log = log.lock().unwrap_or_else(|e| e.into_inner());
    if log.written > MAX_BYTES {
        return;
    }
    let text = format!(
        "{} {}\n",
        chrono::Local::now().format("%H:%M:%S%.3f"),
        line.trim_end()
    );
    let full = log.written + text.len() as u64 > MAX_BYTES;
    let _ = log.file.write_all(text.as_bytes());
    if full {
        let _ = log
            .file
            .write_all(b"(log full: nothing more is written this session)\n");
    }
    log.written += text.len() as u64;
    let _ = log.file.flush();
}

/// Points stderr at a pipe and copies what comes through it to the
/// terminal (the original stderr) and the log file.
#[cfg(unix)]
fn capture_stderr() {
    use std::os::fd::{FromRawFd, OwnedFd};

    let mut fds = [0; 2];
    // SAFETY: plain libc calls on descriptors this function owns; stderr
    // is swapped atomically by dup2, so nothing ever sees it closed.
    unsafe {
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            return;
        }
        let terminal = libc::dup(libc::STDERR_FILENO);
        if terminal < 0 || libc::dup2(fds[1], libc::STDERR_FILENO) < 0 {
            libc::close(fds[0]);
            libc::close(fds[1]);
            if terminal >= 0 {
                libc::close(terminal);
            }
            return;
        }
        libc::close(fds[1]);
        let reader = File::from(OwnedFd::from_raw_fd(fds[0]));
        let mut terminal = File::from(OwnedFd::from_raw_fd(terminal));
        let _ = std::thread::Builder::new()
            .name("log".into())
            .spawn(move || {
                let mut reader = std::io::BufReader::new(reader);
                let mut line = Vec::new();
                loop {
                    line.clear();
                    match reader.read_until(b'\n', &mut line) {
                        Ok(0) | Err(_) => return,
                        Ok(_) => {
                            let _ = terminal.write_all(&line);
                            write_line(&String::from_utf8_lossy(&line));
                        }
                    }
                }
            });
    }
}

/// Writes a line from the UI (an error or a warning it caught) to the log.
#[tauri::command]
pub fn log_ui(text: String) {
    // Through stderr, so it shows in the terminal too.
    let text: String = text.chars().take(2000).collect();
    eprintln!("ui: {text}");
    #[cfg(not(unix))]
    write_line(&format!("ui: {text}"));
}

/// Saves a problem report to the Desktop: what the tester wrote, the app
/// version and system, and this session's and the last session's logs (a
/// crash ends a session, so it's in the last one). Returns its path.
#[tauri::command]
pub fn save_report(description: String, context: String) -> Result<String, String> {
    let dir = dirs::desktop_dir()
        .or_else(dirs::home_dir)
        .ok_or("no Desktop folder to save the report in")?;
    let stamp = chrono::Local::now().format("%Y-%m-%d %H.%M");
    let path = dir.join(format!("oss-dj report {stamp}.txt"));
    let mut text = format!(
        "oss-dj problem report\n\nWhat happened:\n{}\n\nVersion: {}\nSystem: {} ({})\n{}\n",
        description.trim(),
        env!("CARGO_PKG_VERSION"),
        os_version(),
        std::env::consts::ARCH,
        context.trim(),
    );
    for (n, label) in [(0, "This session's log"), (1, "The previous session's log")] {
        let Some(body) = session_log(n).and_then(|p| std::fs::read_to_string(p).ok()) else {
            continue;
        };
        let lines: Vec<&str> = body.lines().collect();
        let from = lines.len().saturating_sub(3000);
        text.push_str(&format!("\n--- {label} ---\n"));
        if from > 0 {
            text.push_str(&format!("({from} earlier lines left out)\n"));
        }
        text.push_str(&lines[from..].join("\n"));
        text.push('\n');
    }
    std::fs::write(&path, text).map_err(|e| format!("couldn't save the report: {e}"))?;
    eprintln!("saved a problem report to {}", path.display());
    Ok(path.to_string_lossy().into_owned())
}

/// The log of the session `n` launches back (0 is this one).
fn session_log(n: usize) -> Option<PathBuf> {
    let current = path()?;
    let p = match n {
        0 => current.to_path_buf(),
        n => current.with_file_name(format!("oss-dj.{n}.log")),
    };
    p.exists().then_some(p)
}

fn os_version() -> String {
    #[cfg(target_os = "macos")]
    if let Ok(out) = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
    {
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !v.is_empty() {
            return format!("macOS {v}");
        }
    }
    std::env::consts::OS.to_string()
}
