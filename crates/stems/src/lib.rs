//! Stems for Interlude: splits tracks into vocals, melody, bass and drums in
//! the background.
//!
//! A [`Splitter`] runs one worker thread. When a track loads onto a deck,
//! [`Splitter::split`] tells it, and it looks for the track's stems in a
//! cache on disk. A track that isn't there is split when [`When`] says so:
//! as it loads, or once its stems are used. The worker then attaches an
//! empty [`Stems`] buffer to the track and fills it in about 6-second
//! regions, starting at the deck's play head and running ahead of it, so
//! the part you're about to play is ready first. With two decks splitting,
//! the one whose ready audio runs out soonest goes first. Finished stems
//! are saved to the cache.
//!
//! The separation model is HTDemucs (Meta, MIT licence), run through ONNX
//! Runtime on the CPU.

pub mod cache;
pub mod download;
pub mod model;
pub mod quick;
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
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl From<ort::Error<ort::session::builder::SessionBuilder>> for Error {
    fn from(e: ort::Error<ort::session::builder::SessionBuilder>) -> Self {
        Error::Ort(e.into())
    }
}

/// The model file Interlude downloads once it's set up: HTDemucs v4, exported to
/// ONNX with its weights stored as 16-bit floats (it still computes in
/// 32-bit). Parity-checked against Meta's PyTorch model by its exporter.
pub const MODEL_ID: &str = "htdemucs-v4";
pub const MODEL_FILE: &str = "htdemucs_fp16weights.onnx";
/// Pinned to a commit, so the file can't change under the hash.
pub const MODEL_URL: &str = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/d54ed9eb60e258ea82131c6ee14578628816456a/htdemucs_fp16weights.onnx";
/// SHA-256 of the file at [`MODEL_URL`]; a mismatch refuses the download.
pub const MODEL_SHA256: &str = "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a";
/// Its size.
pub const MODEL_BYTES: u64 = 165_612_636;

/// The model, as something to [`download`].
pub fn model_source() -> download::Source {
    download::Source {
        url: MODEL_URL.into(),
        sha256: MODEL_SHA256.into(),
        bytes: MODEL_BYTES,
    }
}

/// When tracks are split. Stems that are in the cache play in all of them
/// but [`When::Never`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    /// Stems are off.
    Never,
    /// The user hasn't said yet.
    Unchosen,
    /// Once a track's stems are used.
    OnUse,
    /// As soon as a track loads.
    Always,
}

/// How the splitter should run. Changing it takes effect on the next region.
#[derive(Debug, Clone, PartialEq)]
pub struct Settings {
    pub when: When,
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
            when: When::Always,
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
    /// Waiting for the user to say when tracks are split.
    Unchosen,
    /// Will be split once its stems are used.
    OnUse,
    /// The model hasn't been downloaded yet.
    NeedsModel,
    /// Getting the model ready.
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
    /// The cache has been looked at.
    looked: bool,
    /// `None` until there's a reason to split it.
    progress: Option<Progress>,
    /// Its stems have been used, so it's split whatever [`When`] says
    /// (other than never).
    used: bool,
    failed: Option<String>,
}

impl Job {
    /// It's to be split.
    fn wanted(&self, when: When) -> bool {
        match when {
            When::Never | When::Unchosen => false,
            When::OnUse => self.used,
            When::Always => true,
        }
    }

    fn done(&self) -> bool {
        self.progress.as_ref().is_some_and(|p| p.is_done())
    }
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
    heads: Arc<PlayHeads>,
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
        let heads = Arc::new(heads);
        let worker = {
            let (shared, heads) = (shared.clone(), heads.clone());
            std::thread::Builder::new()
                .name("stems".into())
                .spawn(move || Worker::new(shared, heads).run())
                .ok()
        };
        Self {
            shared,
            heads,
            worker,
        }
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
                }
            }
            if st.settings.when == When::Never {
                st.jobs = Default::default();
            }
        }
        self.shared.wake.notify_all();
    }

    /// Takes on the track just loaded on `deck`, replacing whatever that deck
    /// was splitting. `key` finds it in the cache.
    pub fn split(&self, deck: usize, track: Arc<Track>, key: Option<CacheKey>) {
        let mut st = self.lock();
        if deck >= NUM_DECKS {
            return;
        }
        if st.settings.when == When::Never {
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
            looked: false,
            progress: None,
            used: false,
            failed: None,
        });
        drop(st);
        self.shared.wake.notify_all();
    }

    /// `deck`'s stems are being used: split its track, if it isn't being.
    pub fn use_stems(&self, deck: usize) {
        self.with_job(deck, |job| job.used = true);
    }

    fn with_job(&self, deck: usize, f: impl FnOnce(&mut Job)) {
        if let Some(job) = self.lock().jobs.get_mut(deck).and_then(|j| j.as_mut()) {
            f(job);
        }
        self.shared.wake.notify_all();
    }

    /// Whether `deck` can play its stems where its play head is.
    pub fn is_here(&self, deck: usize) -> bool {
        let head = (self.heads)(deck).max(0.0);
        let st = self.lock();
        let Some(job) = st.jobs.get(deck).and_then(|j| j.as_ref()) else {
            return false;
        };
        let rate = job.track.sample_rate;
        job.stems
            .as_ref()
            .is_some_and(|s| s.is_ready_at((head * rate as f64) as i64, rate))
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
        if job.looked && st.settings.model.is_none() {
            return Status::NeedsModel;
        }
        match st.settings.when {
            When::Unchosen => return Status::Unchosen,
            When::OnUse if !job.used => return Status::OnUse,
            _ => {}
        }
        if job.looked && !st.model_ready {
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
    /// Make the copy of the model that loads quickly.
    MakeQuick(PathBuf),
}

struct Worker {
    shared: Arc<Shared>,
    heads: Arc<PlayHeads>,
    model: Option<Model>,
    model_generation: u64,
    /// The model a quick copy was last made of, or tried to be: once each.
    quickened: Option<PathBuf>,
}

impl Worker {
    fn new(shared: Arc<Shared>, heads: Arc<PlayHeads>) -> Self {
        Self {
            shared,
            heads,
            model: None,
            model_generation: u64::MAX,
            quickened: None,
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
                    if let Some(t) = self.pick(&mut st) {
                        break t;
                    }
                    // Nothing to split: give back the memory the model holds.
                    // Loading it again doesn't take long.
                    self.model = None;
                    st.model_ready = false;
                    // And make the next time quick, while there's nothing
                    // else to do.
                    if st.settings.when != When::Never && self.quickened != st.settings.model {
                        self.quickened = st.settings.model.clone();
                        if let Some(path) = st.settings.model.clone() {
                            break Task::MakeQuick(path);
                        }
                    }
                    st = shared.wake.wait(st).unwrap_or_else(|e| e.into_inner());
                }
            };
            self.perform(task);
        }
    }

    fn pick(&self, st: &mut State) -> Option<Task> {
        let when = st.settings.when;
        // Cache lookups first: they're quick and may save a whole split.
        for (deck, job) in st.jobs.iter().enumerate() {
            if let Some(job) = job.as_ref().filter(|j| !j.looked) {
                return Some(Task::Cache {
                    deck,
                    id: job.id,
                    track: job.track.clone(),
                    key: job.key.clone(),
                    dir: st.settings.cache_dir.clone(),
                });
            }
        }
        let path = st.settings.model.clone()?;
        if st.model_error.is_some() {
            return None;
        }
        let active = |j: &Job| j.failed.is_none() && j.wanted(when);
        for job in st.jobs.iter_mut().flatten().filter(|j| active(j)) {
            if job.progress.is_none() {
                let segment = self.model.as_ref().map_or(DEFAULT_SEGMENT, |m| m.segment());
                job.progress = Some(Progress::new(Plan::new(
                    segment,
                    job.track.frames(),
                    job.track.sample_rate,
                )));
            }
        }
        if !st.jobs.iter().flatten().any(|j| active(j) && !j.done()) {
            return None;
        }
        if self.model.is_none() || self.model_generation != st.generation {
            return Some(Task::LoadModel(path, st.generation));
        }
        // The deck whose ready audio runs out soonest goes first.
        let mut best: Option<(f64, Task)> = None;
        for (deck, job) in st.jobs.iter().enumerate() {
            let Some(job) = job.as_ref().filter(|j| active(j)) else {
                continue;
            };
            let Some(p) = job.progress.as_ref() else {
                continue;
            };
            let rate = job.track.sample_rate as f64;
            let head = (self.heads)(deck).max(0.0) * rate;
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
            } => {
                let mut hit = None;
                if let (Some(d), Some(k)) = (&dir, &key) {
                    if cache::contains(d, k) {
                        let stems = attach(&track);
                        if cache::load(d, k, &stems) {
                            hit = Some(stems);
                        }
                    }
                }
                let mut st = lock(&shared);
                if let Some(job) = st.jobs[deck].as_mut().filter(|j| j.id == id) {
                    job.looked = true;
                    if let Some(stems) = hit {
                        let plan =
                            Plan::new(DEFAULT_SEGMENT, job.track.frames(), job.track.sample_rate);
                        let mut p = Progress::new(plan);
                        p.mark_all_done();
                        job.progress = Some(p);
                        job.stems = Some(stems);
                    }
                }
            }
            Task::MakeQuick(path) => {
                // Checking one that's there now saves the next load doing it.
                let _ = quick::find(&path);
                if let Err(e) = quick::make(&path) {
                    eprintln!("stems: couldn't make a quick copy of the model: {e}");
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
                // Made out here, since it takes a moment.
                let made = result.is_ok().then(|| attach(&track));
                let mut st = lock(&shared);
                let cache_limit = st.settings.cache_limit;
                let cache_dir = st.settings.cache_dir.clone();
                let Some(job) = st.jobs[deck].as_mut().filter(|j| j.id == id) else {
                    return;
                };
                match result {
                    Ok(sep) => {
                        job.stems = job.stems.take().or(made);
                        let (Some(p), Some(stems)) = (job.progress.as_mut(), job.stems.clone())
                        else {
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

/// The track's stems, empty if it had none.
fn attach(track: &Track) -> Arc<Stems> {
    track
        .stems
        .get_or_init(|| Arc::new(Stems::new(track.frames())))
        .clone()
}

/// HTDemucs's segment length: 7.8 s at 44.1 kHz. Used to plan a split
/// before the model has loaded.
const DEFAULT_SEGMENT: usize = 343_980;

/// Default folders under the app's data folder.
pub fn cache_dir(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("stems")
}
