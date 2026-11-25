//! The model download, against a small HTTP server on this computer that
//! can be told to misbehave.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use dj_stems::download::{file_sha256, part_path, Downloader, Source, State};

/// What the server does with one request; the last one repeats.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Reply {
    /// The file, from wherever the request asks.
    Serve,
    /// The whole file, whatever the request asks.
    IgnoreRange,
    /// Closes after this many bytes.
    CutAfter(usize),
    /// Sends this many bytes, then nothing more until the test says so.
    StallAfter(usize),
    /// The right size, the wrong bytes.
    Damaged,
    Status(u16),
}

struct Server {
    url: String,
    /// The `Range` of each request, or "" without one.
    requests: Arc<Mutex<Vec<String>>>,
    go: Arc<(Mutex<bool>, Condvar)>,
}

impl Server {
    fn new(file: Vec<u8>, script: &[Reply]) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/model", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(vec![]));
        let go = Arc::new((Mutex::new(false), Condvar::new()));
        let script = script.to_vec();
        let file = Arc::new(file);
        {
            let (requests, go) = (requests.clone(), go.clone());
            std::thread::spawn(move || {
                for (i, stream) in listener.incoming().flatten().enumerate() {
                    let reply = script[i.min(script.len() - 1)];
                    let (file, requests, go) = (file.clone(), requests.clone(), go.clone());
                    std::thread::spawn(move || {
                        let _ = answer(stream, reply, &file, &requests, &go);
                    });
                }
            });
        }
        Self { url, requests, go }
    }

    fn requests(&self) -> Vec<String> {
        self.requests.lock().unwrap().clone()
    }

    /// Lets stalled replies carry on.
    fn unstall(&self) {
        *self.go.0.lock().unwrap() = true;
        self.go.1.notify_all();
    }
}

fn answer(
    mut stream: TcpStream,
    reply: Reply,
    file: &[u8],
    requests: &Mutex<Vec<String>>,
    go: &(Mutex<bool>, Condvar),
) -> std::io::Result<()> {
    let mut range = String::new();
    for line in BufReader::new(stream.try_clone()?).lines() {
        let line = line?;
        if line.is_empty() {
            break;
        }
        if let Some(v) = line.to_ascii_lowercase().strip_prefix("range: ") {
            range = v.to_string();
        }
    }
    requests.lock().unwrap().push(range.clone());
    if let Reply::Status(s) = reply {
        return write!(
            stream,
            "HTTP/1.1 {s} No\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
        );
    }
    let from: usize = range
        .strip_prefix("bytes=")
        .and_then(|r| r.strip_suffix('-'))
        .filter(|_| reply != Reply::IgnoreRange)
        .map_or(0, |r| r.parse().unwrap());
    let total = file.len();
    if from > 0 {
        write!(
            stream,
            "HTTP/1.1 206 Partial\r\ncontent-range: bytes {from}-{}/{total}\r\n",
            total - 1
        )?;
    } else {
        write!(stream, "HTTP/1.1 200 OK\r\n")?;
    }
    write!(
        stream,
        "content-length: {}\r\nconnection: close\r\n\r\n",
        total - from
    )?;
    let mut body = file[from..].to_vec();
    match reply {
        Reply::CutAfter(n) => body.truncate(n),
        Reply::StallAfter(n) => {
            stream.write_all(&body[..n])?;
            stream.flush()?;
            let mut open = go.0.lock().unwrap();
            while !*open {
                open = go.1.wait(open).unwrap();
            }
            drop(open);
            body.drain(..n);
        }
        Reply::Damaged => body.iter_mut().for_each(|b| *b ^= 1),
        _ => {}
    }
    stream.write_all(&body)
}

/// A folder of its own, gone again afterwards.
struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Self {
        let d = std::env::temp_dir().join(format!("stems-download-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        Self(d)
    }
    fn dest(&self) -> PathBuf {
        self.0.join("models").join("model.onnx")
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn model() -> Vec<u8> {
    (0..1_000_000u32).map(|i| (i * 7 + i / 251) as u8).collect()
}

fn source(dir: &Dir, url: &str) -> Source {
    let plain = dir.0.join("plain");
    std::fs::write(&plain, model()).unwrap();
    Source {
        url: url.into(),
        sha256: file_sha256(&plain).unwrap(),
        bytes: model().len() as u64,
    }
}

/// A downloader that tries again almost at once, and every state it reported.
fn downloader(dir: &Dir, server: &Server, wait: Duration) -> (Downloader, Arc<Mutex<Vec<State>>>) {
    let seen = Arc::new(Mutex::new(vec![]));
    let log = seen.clone();
    let d = Downloader::with_backoff(source(dir, &server.url), dir.dest(), vec![wait], move |s| {
        log.lock().unwrap().push(s.clone())
    });
    (d, seen)
}

const SOON: Duration = Duration::from_millis(5);
const NEVER: Duration = Duration::from_secs(3600);

fn wait_for(d: &Downloader, what: &str, f: impl Fn(&State) -> bool) -> State {
    let start = Instant::now();
    loop {
        let s = d.state();
        if f(&s) {
            return s;
        }
        assert!(
            start.elapsed() < Duration::from_secs(20),
            "waiting for {what}, got {s:?}"
        );
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn wait_ready(d: &Downloader) {
    wait_for(d, "ready", |s| *s == State::Ready);
}

fn write_part(dir: &Dir, bytes: &[u8]) {
    std::fs::create_dir_all(dir.dest().parent().unwrap()).unwrap();
    std::fs::write(part_path(&dir.dest()), bytes).unwrap();
}

fn check(dest: &Path) {
    assert_eq!(std::fs::read(dest).unwrap(), model());
    assert!(!part_path(dest).exists(), "the part is gone");
}

#[test]
fn downloads_and_checks() {
    let dir = Dir::new("plain");
    let server = Server::new(model(), &[Reply::Serve]);
    let (d, seen) = downloader(&dir, &server, SOON);
    assert_eq!(d.state(), State::Missing { done: 0 });
    assert!(seen.lock().unwrap().is_empty(), "nothing starts by itself");
    d.start();
    d.start();
    wait_ready(&d);
    check(&dir.dest());
    assert_eq!(server.requests(), [""]);
    let start = Instant::now();
    while seen.lock().unwrap().last() != Some(&State::Ready) {
        assert!(start.elapsed() < Duration::from_secs(5));
        std::thread::sleep(SOON);
    }
    // Already here: nothing to do, now or next time.
    d.start();
    let (again, _) = downloader(&dir, &server, SOON);
    assert_eq!(again.state(), State::Ready);
    again.start();
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn carries_on_from_an_earlier_session() {
    let dir = Dir::new("resume");
    write_part(&dir, &model()[..400_000]);
    let server = Server::new(model(), &[Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    assert_eq!(d.state(), State::Missing { done: 400_000 });
    d.start();
    wait_ready(&d);
    check(&dir.dest());
    assert_eq!(server.requests(), ["bytes=400000-"]);
}

#[test]
fn a_complete_part_only_needs_checking() {
    let dir = Dir::new("complete");
    write_part(&dir, &model());
    let server = Server::new(model(), &[Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    check(&dir.dest());
    assert!(server.requests().is_empty());
}

#[test]
fn starts_over_when_the_server_cannot_resume() {
    let dir = Dir::new("norange");
    write_part(&dir, &model()[..400_000]);
    let server = Server::new(model(), &[Reply::IgnoreRange]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    check(&dir.dest());

    let dir = Dir::new("refused-range");
    write_part(&dir, &model()[..400_000]);
    let server = Server::new(model(), &[Reply::Status(416), Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    check(&dir.dest());
    assert_eq!(server.requests(), ["bytes=400000-", ""]);
}

#[test]
fn carries_on_by_itself_after_a_dropped_connection() {
    let dir = Dir::new("drop");
    let server = Server::new(
        model(),
        &[
            Reply::CutAfter(300_000),
            Reply::Status(503),
            Reply::CutAfter(200_000),
            Reply::Serve,
        ],
    );
    let (d, seen) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    check(&dir.dest());
    assert_eq!(
        server.requests(),
        ["", "bytes=300000-", "bytes=300000-", "bytes=500000-"]
    );
    let waited = seen.lock().unwrap().clone();
    assert!(waited.contains(&State::Waiting { done: 300_000 }));
}

#[test]
fn trying_again_now_skips_the_wait() {
    let dir = Dir::new("now");
    let server = Server::new(model(), &[Reply::Status(503), Reply::Serve]);
    let (d, _) = downloader(&dir, &server, NEVER);
    d.start();
    wait_for(&d, "waiting", |s| matches!(s, State::Waiting { .. }));
    d.start();
    wait_ready(&d);
    check(&dir.dest());
}

#[test]
fn a_damaged_file_is_fetched_once_more() {
    let dir = Dir::new("damaged");
    let server = Server::new(model(), &[Reply::Damaged, Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    check(&dir.dest());
}

#[test]
fn a_damaged_file_never_counts_and_can_be_retried() {
    let dir = Dir::new("damaged-twice");
    let server = Server::new(model(), &[Reply::Damaged, Reply::Damaged, Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    let s = wait_for(&d, "failed", |s| matches!(s, State::Failed { .. }));
    assert_eq!(
        s,
        State::Failed {
            done: 0,
            error: "The download arrived damaged.".into()
        }
    );
    assert!(!dir.dest().exists());
    assert!(!part_path(&dir.dest()).exists());
    assert_eq!(server.requests().len(), 2, "it stops asking");
    d.start();
    wait_ready(&d);
    check(&dir.dest());
}

#[test]
fn a_refusal_waits_for_the_user() {
    let dir = Dir::new("refused");
    let server = Server::new(model(), &[Reply::Status(404), Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_for(&d, "failed", |s| matches!(s, State::Failed { .. }));
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(server.requests().len(), 1);
    d.start();
    wait_ready(&d);
}

#[test]
fn something_else_at_that_address_is_refused() {
    let dir = Dir::new("other");
    let server = Server::new(b"a login page".to_vec(), &[Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_for(&d, "failed", |s| matches!(s, State::Failed { .. }));
    assert!(!dir.dest().exists());
}

#[cfg(unix)]
#[test]
fn no_room_on_the_disk_is_said_before_asking_for_anything() {
    let dir = Dir::new("full");
    let server = Server::new(model(), &[Reply::Serve]);
    let source = Source {
        bytes: 1 << 60,
        ..source(&dir, &server.url)
    };
    let d = Downloader::new(source, dir.dest(), |_| {});
    d.start();
    let s = wait_for(&d, "failed", |s| matches!(s, State::Failed { .. }));
    let State::Failed { error, .. } = s else {
        unreachable!()
    };
    assert!(
        error.starts_with("There isn't enough space on the disk."),
        "{error}"
    );
    assert!(server.requests().is_empty());
}

#[test]
fn no_connection_waits_for_one() {
    let dir = Dir::new("offline");
    // A port nobody listens on.
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap();
    let d = Downloader::with_backoff(
        source(&dir, &format!("http://{port}/model")),
        dir.dest(),
        vec![NEVER],
        |_| {},
    );
    write_part(&dir, &model()[..400_000]);
    d.start();
    let s = wait_for(&d, "waiting", |s| matches!(s, State::Waiting { .. }));
    assert_eq!(s, State::Waiting { done: 400_000 });
}

#[test]
fn cancel_stops_it_and_keeps_what_is_in() {
    let dir = Dir::new("cancel");
    let server = Server::new(model(), &[Reply::StallAfter(300_000), Reply::Serve]);
    let (d, seen) = downloader(&dir, &server, SOON);
    d.start();
    wait_for(
        &d,
        "bytes",
        |s| matches!(s, State::Downloading { done, .. } if *done == 300_000),
    );
    d.cancel();
    assert_eq!(d.state(), State::Missing { done: 300_000 });
    server.unstall();
    std::thread::sleep(Duration::from_millis(100));
    // It stays stopped, and says nothing more.
    assert_eq!(d.state(), State::Missing { done: 300_000 });
    assert_eq!(
        seen.lock().unwrap().last(),
        Some(&State::Missing { done: 300_000 })
    );
    assert!(!dir.dest().exists());
    assert_eq!(server.requests().len(), 1);
    d.start();
    wait_ready(&d);
    check(&dir.dest());
}

#[test]
fn cancel_ends_the_wait_for_a_connection() {
    let dir = Dir::new("cancel-wait");
    let server = Server::new(model(), &[Reply::Status(503)]);
    let (d, _) = downloader(&dir, &server, Duration::from_millis(30));
    d.start();
    wait_for(&d, "waiting", |s| matches!(s, State::Waiting { .. }));
    d.cancel();
    std::thread::sleep(Duration::from_millis(50));
    let n = server.requests().len();
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(server.requests().len(), n, "no more tries");
    assert_eq!(d.state(), State::Missing { done: 0 });
}

#[test]
fn cancel_then_start_never_runs_two_at_once() {
    let dir = Dir::new("twice");
    let server = Server::new(model(), &[Reply::StallAfter(300_000), Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_for(
        &d,
        "bytes",
        |s| matches!(s, State::Downloading { done, .. } if *done == 300_000),
    );
    for _ in 0..5 {
        d.cancel();
        d.start();
    }
    assert!(matches!(d.state(), State::Downloading { .. }));
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(server.requests().len(), 1, "the first hasn't let go yet");
    server.unstall();
    wait_ready(&d);
    check(&dir.dest());
    assert_eq!(server.requests().len(), 2, "one after the other");
}

#[test]
fn remove_deletes_the_file_and_the_part() {
    let dir = Dir::new("remove");
    let server = Server::new(model(), &[Reply::Serve]);
    let (d, _) = downloader(&dir, &server, SOON);
    d.start();
    wait_ready(&d);
    d.remove().unwrap();
    assert_eq!(d.state(), State::Missing { done: 0 });
    assert!(!dir.dest().exists());

    write_part(&dir, &model()[..10]);
    d.remove().unwrap();
    assert!(!part_path(&dir.dest()).exists());
    d.start();
    wait_ready(&d);
    check(&dir.dest());
}

/// The real server, from the start and then from the middle. Run with
/// `--ignored`; it needs the internet, and fetches a few MB of the model.
#[test]
#[ignore]
fn the_real_server_starts_and_resumes() {
    let dir = Dir::new("real");
    let d = Downloader::with_backoff(
        dj_stems::model_source(),
        dir.dest(),
        vec![Duration::from_secs(1)],
        |_| {},
    );
    let mut had = 0;
    for _ in 0..3 {
        d.start();
        let s = wait_for(
            &d,
            "more bytes",
            |s| matches!(s, State::Downloading { done, .. } if *done > had + 1_000_000),
        );
        assert!(matches!(s, State::Downloading { .. }));
        d.cancel();
        // Give the worker time to let go, so the next start resumes.
        std::thread::sleep(Duration::from_millis(500));
        let now = std::fs::metadata(part_path(&dir.dest())).unwrap().len();
        assert!(now > had, "{now} after {had}");
        had = now;
    }
    d.remove().unwrap();
    assert!(!part_path(&dir.dest()).exists());
}
