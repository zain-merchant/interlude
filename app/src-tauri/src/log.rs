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
    capture_stderr();
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
