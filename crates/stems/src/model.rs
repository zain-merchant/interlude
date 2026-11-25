//! The separation model: HTDemucs, exported to ONNX.
//!
//! The model takes a fixed-length stereo segment at 44.1 kHz (input `mix`,
//! shape `[1, 2, N]`) and returns four stems (output `stems`, shape
//! `[1, 4, 2, N]`) in the order drums, bass, other, vocals. The STFT is
//! inside the graph, so all we do is feed it audio.
//!
//! It runs on the CPU everywhere. Core ML was measured on an M5 and was
//! either broken or about 100x slower for this model, so it isn't used.

use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

use ort::environment::Environment;
use ort::session::builder::{AutoDevicePolicy, GraphOptimizationLevel, SessionBuilder};
use ort::session::Session;
use ort::value::Tensor;

use crate::{quick, Error};

/// The sample rate the model was trained at.
pub const MODEL_RATE: u32 = 44_100;

/// Output rows, as the model orders them.
const OUT_DRUMS: usize = 0;
const OUT_BASS: usize = 1;
const OUT_VOCALS: usize = 3;
const OUT_STEMS: usize = 4;

/// Threads the model runs on.
pub const THREADS: usize = 2;
/// Threads it runs on for the first region, where that's worth it and safe.
pub const FIRST_THREADS: usize = 4;

/// Whether this computer has the cores for [`FIRST_THREADS`] beside
/// everything else the app does.
pub fn many_cores() -> bool {
    let logical = std::thread::available_parallelism().map_or(1, |n| n.get());
    enough(performance_cores(), logical)
}

/// With `fast` performance cores, where they're told apart, of `logical`.
fn enough(fast: Option<usize>, logical: usize) -> bool {
    fast.map_or(logical >= 8, |n| n >= 6)
}

#[cfg(target_os = "macos")]
fn performance_cores() -> Option<usize> {
    let mut n: i32 = 0;
    let mut len = std::mem::size_of::<i32>();
    let ok = unsafe {
        libc::sysctlbyname(
            c"hw.perflevel0.physicalcpu".as_ptr(),
            (&mut n as *mut i32).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (ok == 0).then(|| usize::try_from(n).ok()).flatten()
}

#[cfg(not(target_os = "macos"))]
fn performance_cores() -> Option<usize> {
    None
}

/// ONNX Runtime allows one environment per process, ever: once the first
/// is made, building another fails even after it's dropped. The model is
/// unloaded whenever splitting goes idle and loaded again for the next
/// track, so the environment is made once and kept here.
static ENV: Mutex<Option<Environment>> = Mutex::new(None);

fn environment() -> Result<Environment, Error> {
    let mut env = ENV.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(e) = env.as_ref() {
        return Ok(e.clone());
    }
    let e = ort::init().with_name("Interlude stems").build()?;
    *env = Some(e.clone());
    Ok(e)
}

/// A session as every load of the model wants it, optimised to `level`.
pub(crate) fn builder(
    level: GraphOptimizationLevel,
    threads: usize,
) -> Result<SessionBuilder, Error> {
    let env = environment()?;
    // The model barely gains past two threads (on an M5: 1.46 s per
    // segment on one, 1.21 s on two, 1.07 s on four), so two keeps it
    // fast while leaving the rest for the audio thread and the UI.
    // Without the arena and memory pattern, memory stays flat from one
    // segment to the next (about 0.5 GB less at peak) for under 3% speed.
    // ort turns on automatic device selection by default, which on macOS
    // adds Core ML even with only the CPU provider listed, and Core ML
    // can't compile this model. PreferCPU keeps it off.
    Ok(Session::builder(&env)?
        .with_auto_device(AutoDevicePolicy::PreferCPU)?
        .with_optimization_level(level)?
        .with_intra_threads(threads)?
        .with_memory_pattern(false)?
        .with_execution_providers([ort::ep::CPU::default().with_arena_allocator(false).build()])?)
}

/// A loaded separation model.
pub struct Model {
    session: Session,
    segment: usize,
}

/// One segment's stems, planar: `vocals[ch][i]` and so on, `segment`
/// samples long per channel.
pub struct Separated {
    pub vocals: [Vec<f32>; 2],
    pub bass: [Vec<f32>; 2],
    pub drums: [Vec<f32>; 2],
}

impl Model {
    /// Loads a model file, or its [`quick`] copy if it has one.
    pub fn load(path: &Path) -> Result<Self, Error> {
        Self::load_on(path, THREADS)
    }

    /// [`Model::load`], to run on this many threads.
    pub fn load_on(path: &Path, threads: usize) -> Result<Self, Error> {
        if let Some(copy) = quick::find(path) {
            match Self::open(&copy, threads) {
                Ok(m) => return Ok(m),
                Err(e) => {
                    eprintln!("stems: the quick copy of the model won't load ({e})");
                    let _ = std::fs::remove_file(copy);
                }
            }
        }
        Self::open(path, threads)
    }

    fn open(path: &Path, threads: usize) -> Result<Self, Error> {
        let started = Instant::now();
        let session = builder(GraphOptimizationLevel::All, threads)?.commit_from_file(path)?;
        let segment = Self::check_shapes(&session)?;
        eprintln!(
            "stems: model loaded in {:.1} s",
            started.elapsed().as_secs_f64()
        );
        Ok(Self { session, segment })
    }

    /// The model's fixed segment length, in samples at [`MODEL_RATE`].
    pub fn segment(&self) -> usize {
        self.segment
    }

    fn check_shapes(session: &Session) -> Result<usize, Error> {
        let bad = |why: &str| Error::Model(format!("not a stems model: {why}"));
        let input = session.inputs().first().ok_or_else(|| bad("no input"))?;
        let shape = input
            .dtype()
            .tensor_shape()
            .ok_or_else(|| bad("input is not a tensor"))?;
        if shape.len() != 3 || shape[1] != 2 || shape[2] <= 0 {
            return Err(bad(&format!("input shape {shape:?}")));
        }
        let output = session.outputs().first().ok_or_else(|| bad("no output"))?;
        let out = output
            .dtype()
            .tensor_shape()
            .ok_or_else(|| bad("output is not a tensor"))?;
        if out.len() != 4 || out[1] != OUT_STEMS as i64 || out[2] != 2 {
            return Err(bad(&format!("output shape {out:?}")));
        }
        Ok(shape[2] as usize)
    }

    /// Separates one segment. `left` and `right` are exactly
    /// [`Model::segment`] samples at [`MODEL_RATE`].
    pub fn run(&mut self, left: &[f32], right: &[f32]) -> Result<Separated, Error> {
        let n = self.segment;
        assert!(left.len() == n && right.len() == n, "segment length");
        let mut mix = Vec::with_capacity(2 * n);
        mix.extend_from_slice(left);
        mix.extend_from_slice(right);
        let input = Tensor::<f32>::from_array(([1usize, 2, n], mix))?;
        let outputs = self.session.run(ort::inputs![input])?;
        let (_, data) = outputs[0].try_extract_tensor::<f32>()?;
        if data.len() != OUT_STEMS * 2 * n {
            return Err(Error::Model(format!(
                "unexpected output size {}",
                data.len()
            )));
        }
        let take = |stem: usize| -> [Vec<f32>; 2] {
            std::array::from_fn(|ch| {
                let at = (stem * 2 + ch) * n;
                data[at..at + n].to_vec()
            })
        };
        Ok(Separated {
            vocals: take(OUT_VOCALS),
            bass: take(OUT_BASS),
            drums: take(OUT_DRUMS),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_many_cores_are_enough() {
        // M1, M2 and so on; M1 Pro; an unknown computer.
        assert!(!enough(Some(4), 8));
        assert!(enough(Some(6), 8));
        assert!(enough(Some(8), 10));
        assert!(!enough(None, 4));
        assert!(enough(None, 8));
        #[cfg(target_arch = "aarch64")]
        #[cfg(target_os = "macos")]
        assert!(performance_cores().is_some_and(|n| n > 0));
    }
}
