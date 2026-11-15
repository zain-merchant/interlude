//! Stems for Interlude: splits each loaded track into vocals, melody, bass and
//! drums in the background.
//!
//! A [`Splitter`] runs one worker thread. When a track loads onto a deck,
//! [`Splitter::split`] attaches an empty [`Stems`] buffer to it and the
//! worker fills it in about 6-second regions, starting at the deck's play
//! head and running ahead of it, so the part you're about to play is ready
//! first. With two decks splitting, the one whose ready audio runs out
//! soonest goes first. Finished stems are saved to a cache on disk.
//!
//! The separation model is HTDemucs (Meta, MIT licence), run through ONNX
//! Runtime on the CPU.

pub mod cache;
pub mod download;
pub mod model;
pub mod split;

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

use dj_engine::{Stems, Track, NUM_DECKS};

pub use cache::CacheKey;
pub use model::Model;
use split::{Plan, Progress};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Model(String),
    #[error("ONNX Runtime: {0}")]
    Ort(#[from] ort::Error),
    #[error("download failed: {0}")]
    Download(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl From<ort::Error<ort::session::builder::SessionBuilder>> for Error {
    fn from(e: ort::Error<ort::session::builder::SessionBuilder>) -> Self {
        Error::Ort(e.into())
    }
}

/// The model file Interlude downloads on first use: HTDemucs v4, exported to
/// ONNX with its weights stored as 16-bit floats (it still computes in
/// 32-bit). Parity-checked against Meta's PyTorch model by its exporter.
pub const MODEL_ID: &str = "htdemucs-v4";
pub const MODEL_FILE: &str = "htdemucs_fp16weights.onnx";
/// Pinned to a commit, so the file can't change under the hash.
pub const MODEL_URL: &str = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/d54ed9eb60e258ea82131c6ee14578628816456a/htdemucs_fp16weights.onnx";
/// SHA-256 of the file at [`MODEL_URL`]; a mismatch refuses the download.
pub const MODEL_SHA256: &str = "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a";

/// How the splitter should run. Changing it takes effect on the next region.
#[derive(Debug, Clone, PartialEq)]
pub struct Settings {
    /// Split tracks when they load.
    pub enabled: bool,
    /// The model file, if it's been downloaded.
    pub model: Option<PathBuf>,
    /// Where finished stems are kept, and how many bytes they may take
    /// (0 turns the cache off).
    pub cache_dir: Option<PathBuf>,
    pub cache_limit: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: true,
            model: None,
            cache_dir: None,
            cache_limit: 5 * 1024 * 1024 * 1024,
        }
    }
}

/// Where a deck's stems are at.
#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    /// No track, or stems are turned off.
    Off,
    /// The model hasn't been downloaded yet.
    NeedsModel,
    /// Getting the model ready.
    /// it, which takes a while).
    Starting,
    /// Splitting; this share of the track is ready.
    Splitting(f32),
    Ready,
    Failed(String),
}

/// Play head of each deck, in seconds, as the engine reports it.
pub type PlayHeads = Box<dyn Fn(usize) -> f64 + Send + Sync>;

struct Job {
    id: u64,
    track: Arc<Track>,
    /// Attached once there's something to fill it with (stems take about
    /// 190 MB for 6 minutes, so not before).
    stems: Option<Arc<Stems>>,
    key: Option<CacheKey>,
    /// `None` until the cache has been looked at.
    progress: Option<Progress>,
    /// Not in the cache, and no model to split with.
    waiting: bool,
    failed: Option<String>,
}

#[derive(Default)]
struct State {
    jobs: [Option<Job>; NUM_DECKS],
    settings: Settings,
    /// Bumped when settings change, so the worker reloads the model.
    generation: u64,
    model_error: Option<String>,
    model_ready: bool,
    next_id: u64,
    shutdown: bool,
}

struct Shared {
    state: Mutex<State>,
    wake: Condvar,
}

/// Splits tracks into stems on a background thread.
pub struct Splitter {
    shared: Arc<Shared>,
    worker: Option<std::thread::JoinHandle<()>>,
}

fn lock(shared: &Shared) -> MutexGuard<'_, State> {
    shared.state.lock().unwrap_or_else(|e| e.into_inner())
}

impl Splitter {
    pub fn new(settings: Settings, heads: PlayHeads) -> Self {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                settings,
                ..Default::default()
            }),
            wake: Condvar::new(),
        });
        let worker = {
            let shared = shared.clone();
            std::thread::Builder::new()
                .name("stems".into())
                .spawn(move || Worker::new(shared, heads).run())
                .ok()
        };
        Self { shared, worker }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        lock(&self.shared)
    }

    pub fn settings(&self) -> Settings {
        self.lock().settings.clone()
    }

    pub fn configure(&self, settings: Settings) {
        let mut st = self.lock();
        if st.settings != settings {
            let model_changed = st.settings.model != settings.model;
            st.settings = settings;
            if model_changed {
                st.generation += 1;
                st.model_error = None;
                st.model_ready = false;
                for job in st.jobs.iter_mut().flatten() {
                    job.failed = None;
                    job.waiting = false;
                }
            }
            if !st.settings.enabled {
                st.jobs = Default::default();
            }
        }
        self.shared.wake.notify_all();
    }

    /// Starts splitting the track just loaded on `deck`, replacing whatever
    /// that deck was splitting. `key` finds it in the cache.
    pub fn split(&self, deck: usize, track: Arc<Track>, key: Option<CacheKey>) {
        let mut st = self.lock();
        if deck >= NUM_DECKS {
            return;
        }
        if !st.settings.enabled {
            st.jobs[deck] = None;
            return;
        }
        let stems = track.stems.get().cloned();
        st.next_id += 1;
        let id = st.next_id;
        st.jobs[deck] = Some(Job {
            id,
            track,
            stems,
            key,
            progress: None,
            waiting: false,
            failed: None,
        });
        drop(st);
        self.shared.wake.notify_all();
    }

    /// Stops splitting for `deck` (its track was ejected).
    pub fn stop(&self, deck: usize) {
        if let Some(j) = self.lock().jobs.get_mut(deck) {
            *j = None;
        }
    }

    pub fn status(&self, deck: usize) -> Status {
        let st = self.lock();
        let Some(job) = st.jobs.get(deck).and_then(|j| j.as_ref()) else {
            return Status::Off;
        };
        if job.stems.as_ref().is_some_and(|s| s.is_complete()) {
            return Status::Ready;
        }
        if let Some(e) = job.failed.as_ref().or(st.model_error.as_ref()) {
            return Status::Failed(e.clone());
        }
        if job.waiting || (job.progress.is_some() && st.settings.model.is_none()) {
            return Status::NeedsModel;
        }
        if job.progress.is_some() && !st.model_ready {
            return Status::Starting;
        }
        Status::Splitting(job.stems.as_ref().map_or(0.0, |s| s.ready_fraction()))
    }
}

impl Drop for Splitter {
    fn drop(&mut self) {
        self.lock().shutdown = true;
        self.shared.wake.notify_all();
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

/// What the worker does next.
enum Task {
    /// Look in the cache for this job's stems.
    Cache {
        deck: usize,
        id: u64,
        track: Arc<Track>,
        key: Option<CacheKey>,
        dir: Option<PathBuf>,
        can_split: bool,
    },
    /// Split region `k` of a job.
    Region {
        deck: usize,
        id: u64,
        k: usize,
        plan: Plan,
        track: Arc<Track>,
    },
    /// Load the model.
    LoadModel(PathBuf, u64),
}

struct Worker {
    shared: Arc<Shared>,
    heads: PlayHeads,
    model: Option<Model>,
    model_generation: u64,
}

impl Worker {
    fn new(shared: Arc<Shared>, heads: PlayHeads) -> Self {
        Self {
            shared,
            heads,
            model: None,
            model_generation: u64::MAX,
        }
    }

    fn run(mut self) {
        let shared = self.shared.clone();
        loop {
            let task = {
                let mut st = lock(&shared);
                loop {
                    if st.shutdown {
                        return;
                    }
                    if st.generation != self.model_generation {
                        self.model = None;
                    }
                    if let Some(t) = self.pick(&st) {
                        break t;
                    }
                    // Nothing to split: give back the 4 to 5 GB the model
                    // holds while it runs. Loading it again takes a second.
                    self.model = None;
                    st = shared.wake.wait(st).unwrap_or_else(|e| e.into_inner());
                }
            };
            self.perform(task);
        }
    }

    fn pick(&self, st: &State) -> Option<Task> {
        // Cache lookups first: they're quick and may save a whole split.
        for (deck, job) in st.jobs.iter().enumerate() {
            if let Some(job) = job.as_ref().filter(|j| j.progress.is_none() && !j.waiting) {
                return Some(Task::Cache {
                    deck,
                    id: job.id,
                    track: job.track.clone(),
                    key: job.key.clone(),
                    dir: st.settings.cache_dir.clone(),
                    can_split: st.settings.model.is_some(),
                });
            }
        }
        let wanted = st
            .jobs
            .iter()
            .flatten()
            .any(|j| j.failed.is_none() && j.progress.as_ref().is_some_and(|p| !p.is_done()));
        if !wanted || st.model_error.is_some() {
            return None;
        }
        if self.model.is_none() || self.model_generation != st.generation {
            let path = st.settings.model.clone()?;
            return Some(Task::LoadModel(path, st.generation));
        }
        // The deck whose ready audio runs out soonest goes first.
        let mut best: Option<(f64, Task)> = None;
        for (deck, job) in st.jobs.iter().enumerate() {
            let Some(job) = job.as_ref().filter(|j| j.failed.is_none()) else {
                continue;
            };
            let Some(p) = job.progress.as_ref() else {
                continue;
            };
            let head = (self.heads)(deck).max(0.0) * job.track.sample_rate as f64;
            let Some(k) = p.next(head) else {
                continue;
            };
            let lead = p.lead(head);
            if best.as_ref().is_none_or(|(l, _)| lead < *l) {
                best = Some((
                    lead,
                    Task::Region {
                        deck,
                        id: job.id,
                        k,
                        plan: *p.plan(),
                        track: job.track.clone(),
                    },
                ));
            }
        }
        best.map(|(_, t)| t)
    }

    fn perform(&mut self, task: Task) {
        let shared = self.shared.clone();
        match task {
            Task::Cache {
                deck,
                id,
                track,
                key,
                dir,
                can_split,
            } => {
                let cached = match (&dir, &key) {
                    (Some(d), Some(k)) => cache::contains(d, k),
                    _ => false,
                };
                if !cached && !can_split {
                    let mut st = lock(&shared);
                    if let Some(job) = st.jobs[deck].as_mut().filter(|j| j.id == id) {
                        job.waiting = true;
                    }
                    return;
                }
                let stems = track
                    .stems
                    .get_or_init(|| Arc::new(Stems::new(track.frames())))
                    .clone();
                let hit = cached
                    && matches!((&dir, &key), (Some(d), Some(k)) if cache::load(d, k, &stems));
                let mut st = lock(&shared);
                let segment = self.model.as_ref().map_or(DEFAULT_SEGMENT, |m| m.segment());
                if let Some(job) = st.jobs[deck].as_mut().filter(|j| j.id == id) {
                    job.stems = Some(stems);
                    let plan = Plan::new(segment, job.track.frames(), job.track.sample_rate);
                    let mut p = Progress::new(plan);
                    if hit {
                        p.mark_all_done();
                    }
                    job.progress = Some(p);
                }
            }
            Task::LoadModel(path, generation) => {
                let loaded = Model::load(&path);
                let mut st = lock(&shared);
                if st.generation != generation {
                    return;
                }
                self.model_generation = generation;
                match loaded {
                    Ok(m) => {
                        // Plans were made with a guessed segment length:
                        // redo any that differ before splitting starts.
                        for job in st.jobs.iter_mut().flatten() {
                            if let Some(p) = job.progress.as_mut() {
                                if p.plan().segment() != m.segment()
                                    && !p.is_done()
                                    && p.untouched()
                                {
                                    *p = Progress::new(Plan::new(
                                        m.segment(),
                                        job.track.frames(),
                                        job.track.sample_rate,
                                    ));
                                }
                            }
                        }
                        self.model = Some(m);
                        st.model_ready = true;
                    }
                    Err(e) => {
                        eprintln!("stems: couldn't load the model: {e}");
                        st.model_error = Some(e.to_string());
                    }
                }
            }
            Task::Region {
                deck,
                id,
                k,
                plan,
                track,
            } => {
                let Some(model) = self.model.as_mut() else {
                    return;
                };
                let input = plan.input(k, &track.samples);
                let result = model.run(&input[0], &input[1]);
                let mut st = lock(&shared);
                let cache_limit = st.settings.cache_limit;
                let cache_dir = st.settings.cache_dir.clone();
                let Some(job) = st.jobs[deck].as_mut().filter(|j| j.id == id) else {
                    return;
                };
                match result {
                    Ok(sep) => {
                        let Some(p) = job.progress.as_mut() else {
                            return;
                        };
                        let Some(stems) = job.stems.clone() else {
                            return;
                        };
                        p.finish(k, &sep, &stems);
                        if p.is_done() {
                            let key = job.key.clone();
                            drop(st);
                            if let (Some(dir), Some(key)) = (cache_dir, key) {
                                if let Err(e) = cache::save(&dir, &key, &stems, cache_limit) {
                                    eprintln!("stems: couldn't save to the cache: {e}");
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("stems: splitting failed: {e}");
                        job.failed = Some(e.to_string());
                    }
                }
            }
        }
    }
}

/// HTDemucs's segment length: 7.8 s at 44.1 kHz. Used to plan a split
/// before the model has loaded.
const DEFAULT_SEGMENT: usize = 343_980;

/// Default folders under the app's data folder.
pub fn cache_dir(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("stems")
}
