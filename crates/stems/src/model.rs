//! The separation model: HTDemucs, exported to ONNX.
//!
//! The model takes a fixed-length stereo segment at 44.1 kHz (input `mix`,
//! shape `[1, 2, N]`) and returns four stems (output `stems`, shape
//! `[1, 4, 2, N]`) in the order drums, bass, other, vocals. The STFT is
//! inside the graph, so all we do is feed it audio.
//!
//! On a Mac it runs through Core ML, which puts the work on the GPU and the
//! Neural Engine; elsewhere it runs on the CPU.

use std::path::Path;

use ort::session::Session;
use ort::value::Tensor;

use crate::Error;

/// The sample rate the model was trained at.
pub const MODEL_RATE: u32 = 44_100;

/// Output rows, as the model orders them.
const OUT_DRUMS: usize = 0;
const OUT_BASS: usize = 1;
const OUT_VOCALS: usize = 3;
const OUT_STEMS: usize = 4;

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
    /// Loads a model file. `accelerate` uses Core ML on a Mac, which keeps
    /// its compiled model in `cache_dir` so later loads are quick.
    pub fn load(path: &Path, accelerate: bool, cache_dir: Option<&Path>) -> Result<Self, Error> {
        let env = ort::init().with_name("oss-dj stems").build()?;
        let mut builder = Session::builder(&env)?;
        // Leave a core free for the audio thread and the UI.
        let threads =
            std::thread::available_parallelism().map_or(2, |n| n.get().saturating_sub(1).max(1));
        builder = builder.with_intra_threads(threads)?;
        if accelerate {
            builder = accelerated(builder, cache_dir)?;
        }
        let session = builder.commit_from_file(path)?;
        let segment = Self::check_shapes(&session)?;
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

#[cfg(target_os = "macos")]
fn accelerated(
    builder: ort::session::builder::SessionBuilder,
    cache_dir: Option<&Path>,
) -> Result<ort::session::builder::SessionBuilder, Error> {
    use ort::ep::coreml::{ComputeUnits, ModelFormat};
    let mut ep = ort::ep::CoreML::default()
        .with_model_format(ModelFormat::MLProgram)
        .with_compute_units(ComputeUnits::All);
    if let Some(dir) = cache_dir {
        let _ = std::fs::create_dir_all(dir);
        ep = ep.with_model_cache_dir(dir.display());
    }
    Ok(builder.with_execution_providers([ep.build()])?)
}

#[cfg(not(target_os = "macos"))]
fn accelerated(
    builder: ort::session::builder::SessionBuilder,
    _cache_dir: Option<&Path>,
) -> Result<ort::session::builder::SessionBuilder, Error> {
    Ok(builder)
}
