//! Splitting a track piece by piece, in any order.
//!
//! The model works on fixed segments of about 8 seconds. We cut the track
//! into *regions* a bit shorter than that, and give each region a second of
//! extra audio on both sides as context, since the model's output is least
//! accurate at a segment's edges. Each region's result is written straight
//! into the track's [`Stems`], so the deck can use it at once.
//!
//! Neighbouring regions overlap by a short fringe, crossfaded so the stems
//! have no seams. Regions can be done in any order: a fringe is written from
//! whichever side is done first and blended once both are.
//!
//! Positions are worked out in the model's time (44.1 kHz) and mapped to the
//! track's frames, so tracks at other sample rates work too.

use dj_engine::stems::{BLOCK_FRAMES, STORED, STORED_BASS, STORED_DRUMS, STORED_VOCALS};
use dj_engine::Stems;

use crate::model::{Separated, MODEL_RATE};

/// One stored stem frame: vocals, bass, drums, each (left, right).
type Frame = [(f32, f32); STORED];

/// How a track is cut into regions.
#[derive(Debug, Clone, Copy)]
pub struct Plan {
    /// Model segment length, in model samples.
    segment: usize,
    /// Extra audio on each side of a region's output, in model samples.
    context: usize,
    /// Region length, in model samples.
    stride: usize,
    /// Crossfade between regions, in model samples.
    fringe: usize,
    /// The track's length and sample rate.
    frames: usize,
    rate: u32,
    regions: usize,
}

impl Plan {
    pub fn new(segment: usize, frames: usize, rate: u32) -> Self {
        let context = segment / 8;
        let fringe = (segment / 64).max(2) & !1;
        let stride = segment - 2 * context - fringe;
        let model_len = (frames as f64 * MODEL_RATE as f64 / rate as f64).ceil() as usize;
        Self {
            segment,
            context,
            stride,
            fringe,
            frames,
            rate,
            regions: model_len.div_ceil(stride).max(1),
        }
    }

    pub fn regions(&self) -> usize {
        self.regions
    }

    /// The model segment length this plan was made for.
    pub fn segment(&self) -> usize {
        self.segment
    }

    fn ratio(&self) -> f64 {
        self.rate as f64 / MODEL_RATE as f64
    }

    /// Track frame where region `k` begins (the middle of its left fringe).
    fn boundary(&self, k: usize) -> usize {
        if k >= self.regions {
            return self.frames;
        }
        ((k * self.stride) as f64 * self.ratio()).round() as usize
    }

    /// Half the fringe, in track frames.
    fn half_fringe(&self) -> usize {
        ((self.fringe / 2) as f64 * self.ratio()).round() as usize
    }

    /// Track frames region `k` writes: its own stretch plus a fringe on
    /// each side.
    pub fn extent(&self, k: usize) -> (usize, usize) {
        let h = self.half_fringe();
        let start = if k == 0 { 0 } else { self.boundary(k) - h };
        let end = if k + 1 >= self.regions {
            self.frames
        } else {
            (self.boundary(k + 1) + h).min(self.frames)
        };
        (start, end)
    }

    /// The region that holds track frame `frame`.
    pub fn region_at(&self, frame: f64) -> usize {
        let model = (frame.max(0.0) / self.ratio()) as usize;
        (model / self.stride).min(self.regions - 1)
    }

    /// First model sample fed to the model for region `k` (may be negative:
    /// before the track starts is silence).
    fn input_start(&self, k: usize) -> i64 {
        (k * self.stride) as i64 - (self.fringe / 2 + self.context) as i64
    }

    /// The model input for region `k`: `segment` samples per channel taken
    /// from the track (interleaved stereo at the track's rate).
    pub fn input(&self, k: usize, samples: &[f32]) -> [Vec<f32>; 2] {
        let start = self.input_start(k);
        let frames = (samples.len() / 2) as i64;
        let at = |i: i64, ch: usize| -> f32 {
            if i < 0 || i >= frames {
                0.0
            } else {
                samples[i as usize * 2 + ch]
            }
        };
        let ratio = self.ratio();
        let mut out = [
            Vec::with_capacity(self.segment),
            Vec::with_capacity(self.segment),
        ];
        for j in 0..self.segment as i64 {
            let pos = (start + j) as f64 * ratio;
            let i = pos.floor() as i64;
            let t = (pos - i as f64) as f32;
            for (ch, o) in out.iter_mut().enumerate() {
                o.push(if t == 0.0 {
                    at(i, ch)
                } else {
                    dj_engine::dsp::hermite(
                        t,
                        at(i - 1, ch),
                        at(i, ch),
                        at(i + 1, ch),
                        at(i + 2, ch),
                    )
                });
            }
        }
        out
    }

    /// Region `k`'s output, resampled to the track's frames over its extent.
    fn output(&self, k: usize, sep: &Separated) -> Vec<Frame> {
        let (start, end) = self.extent(k);
        let in_start = self.input_start(k) as f64;
        let n = self.segment as i64;
        let ratio = self.ratio();
        let get = |v: &[Vec<f32>; 2], i: i64, ch: usize| v[ch][i.clamp(0, n - 1) as usize];
        let interp = |v: &[Vec<f32>; 2], pos: f64| -> (f32, f32) {
            let i = pos.floor() as i64;
            let t = (pos - i as f64) as f32;
            let ch = |c| {
                if t == 0.0 {
                    get(v, i, c)
                } else {
                    dj_engine::dsp::hermite(
                        t,
                        get(v, i - 1, c),
                        get(v, i, c),
                        get(v, i + 1, c),
                        get(v, i + 2, c),
                    )
                }
            };
            (ch(0), ch(1))
        };
        (start..end)
            .map(|f| {
                let pos = f as f64 / ratio - in_start;
                let mut frame = [(0.0, 0.0); STORED];
                frame[STORED_VOCALS] = interp(&sep.vocals, pos);
                frame[STORED_BASS] = interp(&sep.bass, pos);
                frame[STORED_DRUMS] = interp(&sep.drums, pos);
                frame
            })
            .collect()
    }
}

/// Splitting one track: which regions are done, and the fringes kept to
/// blend with neighbours that aren't done yet.
pub struct Progress {
    plan: Plan,
    done: Vec<bool>,
    /// Each done region's full output over its extent. Only the fringes are
    /// needed later, but keeping the lot keeps the bookkeeping simple; it's
    /// dropped as soon as both neighbours are done.
    kept: Vec<Option<Vec<Frame>>>,
}

impl Progress {
    pub fn new(plan: Plan) -> Self {
        Self {
            plan,
            done: vec![false; plan.regions],
            kept: vec![None; plan.regions],
        }
    }

    pub fn plan(&self) -> &Plan {
        &self.plan
    }

    pub fn is_done(&self) -> bool {
        self.done.iter().all(|&d| d)
    }

    /// No region has been split yet.
    pub fn untouched(&self) -> bool {
        !self.done.iter().any(|&d| d)
    }

    /// Everything came from the cache.
    pub fn mark_all_done(&mut self) {
        self.done.fill(true);
        self.kept.fill(None);
    }

    /// The next region to split for a play head at track frame `head`: the
    /// ones a deck standing there plays from, then the first one not done
    /// from the play head on, or else the nearest one before it.
    ///
    /// `still` is whether the deck stays at `head`, so it's worth finishing
    /// what is just behind it.
    pub fn next(&self, head: f64, still: bool) -> Option<usize> {
        let p = self.plan.region_at(head);
        // Right after a region's start a deck also needs the one before it:
        // a block of stems can straddle the two.
        let (from, to) = dj_engine::stems::around(head as i64, self.plan.rate);
        let block = |f: i64| f as usize / BLOCK_FRAMES;
        let first = self.plan.region_at((block(from) * BLOCK_FRAMES) as f64);
        let last = self
            .plan
            .region_at(((block(to) + 1) * BLOCK_FRAMES - 1) as f64);
        (p..=last)
            .chain((first..p).rev().filter(|_| still))
            .chain(p..self.plan.regions)
            .chain((0..p).rev())
            .find(|&k| !self.done[k])
    }

    /// How far ahead of `head` the stems are ready, in track frames.
    pub fn lead(&self, head: f64) -> f64 {
        let p = self.plan.region_at(head);
        match (p..self.plan.regions).find(|&k| !self.done[k]) {
            Some(k) => (self.plan.extent(k).0 as f64 - head).max(0.0),
            None => f64::INFINITY,
        }
    }

    /// Writes region `k`'s result into `stems` and marks every block that is
    /// now complete as ready.
    pub fn finish(&mut self, k: usize, sep: &Separated, stems: &Stems) {
        let plan = self.plan;
        let out = plan.output(k, sep);
        let (start, end) = plan.extent(k);
        let h = plan.half_fringe();
        let write = |f: usize, fr: &Frame| {
            for (s, &(l, r)) in fr.iter().enumerate() {
                stems.write(f, s, l, r);
            }
        };
        // The fringe shared with region `j` on the given side: blended if
        // `j` is done, else this region's own output.
        let blend =
            |lo: usize, hi: usize, other: Option<&Vec<Frame>>, other_start: usize, rising: bool| {
                for f in lo..hi {
                    let mine = &out[f - start];
                    match other {
                        Some(o) => {
                            // Weight of this region: rises across a left fringe,
                            // falls across a right one.
                            let x = (f - lo) as f32 / (hi - lo).max(1) as f32;
                            let w = if rising { x } else { 1.0 - x };
                            let theirs = &o[f - other_start];
                            let mut fr = [(0.0, 0.0); STORED];
                            for s in 0..STORED {
                                fr[s] = (
                                    mine[s].0 * w + theirs[s].0 * (1.0 - w),
                                    mine[s].1 * w + theirs[s].1 * (1.0 - w),
                                );
                            }
                            write(f, &fr);
                        }
                        None => write(f, mine),
                    }
                }
            };
        let left = if k == 0 {
            start
        } else {
            (plan.boundary(k) + h).min(end)
        };
        let right = if k + 1 >= plan.regions {
            end
        } else {
            plan.boundary(k + 1).saturating_sub(h).max(left)
        };
        if k > 0 {
            let prev = self.kept[k - 1].as_ref();
            blend(start, left, prev, plan.extent(k - 1).0, true);
        }
        for f in left..right {
            write(f, &out[f - start]);
        }
        if k + 1 < plan.regions {
            let next = self.kept[k + 1].as_ref();
            blend(right, end, next, plan.extent(k + 1).0, false);
        }
        self.done[k] = true;
        self.kept[k] = Some(out);
        // Free what no fringe needs any more.
        for j in [k.wrapping_sub(1), k, k + 1] {
            if j < plan.regions && self.done[j] {
                let left_done = j == 0 || self.done[j - 1];
                let right_done = j + 1 >= plan.regions || self.done[j + 1];
                if left_done && right_done {
                    self.kept[j] = None;
                }
            }
        }
        // A block is ready once every region that owns part of it is done.
        let first = start / BLOCK_FRAMES;
        let last = end.saturating_sub(1) / BLOCK_FRAMES;
        for b in first..=last.min(stems.blocks().saturating_sub(1)) {
            let lo = (b * BLOCK_FRAMES) as f64;
            let hi = ((b + 1) * BLOCK_FRAMES).min(plan.frames).saturating_sub(1) as f64;
            if (plan.region_at(lo)..=plan.region_at(hi)).all(|j| self.done[j]) {
                stems.mark_ready(b);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in model: vocals are 0.5 × the mix, bass 0.25 ×, drums 0.125 ×,
    /// but only away from the segment's edges (the edges get garbage), so the
    /// test also checks that edges never reach the output.
    fn fake(plan: &Plan, input: &[Vec<f32>; 2]) -> Separated {
        let n = plan.segment;
        let edge = plan.context / 2;
        let scaled = |g: f32| -> [Vec<f32>; 2] {
            std::array::from_fn(|ch| {
                (0..n)
                    .map(|i| {
                        if i < edge || i >= n - edge {
                            9.0
                        } else {
                            input[ch][i] * g
                        }
                    })
                    .collect()
            })
        };
        Separated {
            vocals: scaled(0.5),
            bass: scaled(0.25),
            drums: scaled(0.125),
        }
    }

    fn track(frames: usize) -> Vec<f32> {
        (0..frames * 2)
            .map(|i| ((i as f32 * 0.0137).sin() * 0.5) * if i % 2 == 0 { 1.0 } else { -0.8 })
            .collect()
    }

    fn run(frames: usize, rate: u32, segment: usize, order: impl Fn(&Progress) -> Option<usize>) {
        let samples = track(frames);
        let stems = Stems::new(frames);
        let plan = Plan::new(segment, frames, rate);
        let mut p = Progress::new(plan);
        let mut steps = 0;
        while let Some(k) = order(&p) {
            let sep = fake(&plan, &plan.input(k, &samples));
            p.finish(k, &sep, &stems);
            steps += 1;
            assert!(steps <= plan.regions(), "a region was split twice");
        }
        assert!(p.is_done());
        assert!(stems.is_complete(), "every block ready");
        let tol = if rate == MODEL_RATE { 2e-4 } else { 0.02 };
        for f in (0..frames).step_by(7) {
            let v = stems.get(f, STORED_VOCALS);
            let d = stems.get(f, STORED_DRUMS);
            let (l, r) = (samples[f * 2], samples[f * 2 + 1]);
            assert!(
                (v.0 - l * 0.5).abs() < tol && (v.1 - r * 0.5).abs() < tol,
                "vocals at {f}: {v:?} vs {l} {r}"
            );
            assert!((d.0 - l * 0.125).abs() < tol, "drums at {f}");
        }
    }

    #[test]
    fn forward_from_the_start() {
        run(50_000, 44_100, 4096, |p| p.next(0.0, true));
    }

    #[test]
    fn from_the_middle_then_back() {
        run(50_000, 44_100, 4096, |p| p.next(31_000.0, true));
    }

    #[test]
    fn other_sample_rates() {
        run(40_000, 48_000, 4096, |p| p.next(12_345.0, false));
    }

    #[test]
    fn shorter_than_one_segment() {
        run(1000, 44_100, 4096, |p| p.next(0.0, true));
    }

    #[test]
    fn next_follows_the_play_head() {
        let plan = Plan::new(4096, 100_000, 44_100);
        let mut p = Progress::new(plan);
        let stems = Stems::new(100_000);
        let start = plan.region_at(60_000.0);
        assert_eq!(p.next(60_000.0, false), Some(start));
        let silent = Separated {
            vocals: [vec![0.0; 4096], vec![0.0; 4096]],
            bass: [vec![0.0; 4096], vec![0.0; 4096]],
            drums: [vec![0.0; 4096], vec![0.0; 4096]],
        };
        p.finish(start, &silent, &stems);
        assert_eq!(p.next(60_000.0, false), Some(start + 1));
        assert!(p.lead(60_000.0) > 0.0);
        // Past the end: wraps back to the nearest region before.
        for k in start + 1..plan.regions() {
            p.finish(k, &silent, &stems);
        }
        assert_eq!(p.next(60_000.0, false), Some(start - 1));
        assert_eq!(p.lead(60_000.0), f64::INFINITY);
    }
    /// A deck standing just after a region's start can't play until the one
    /// before it is in too, so that one doesn't wait until last.
    #[test]
    fn a_still_deck_gets_both_sides_of_a_boundary() {
        let frames = 44_100 * 60;
        let plan = Plan::new(343_980, frames, 44_100);
        let mut p = Progress::new(plan);
        let stems = Stems::new(frames);
        let silent = Separated {
            vocals: [vec![0.0; 343_980], vec![0.0; 343_980]],
            bass: [vec![0.0; 343_980], vec![0.0; 343_980]],
            drums: [vec![0.0; 343_980], vec![0.0; 343_980]],
        };
        let head = plan.boundary(3) as f64 + 100.0;
        for want in [3, 2] {
            assert!(!stems.is_ready_at(head as i64, 44_100));
            assert_eq!(p.next(head, true), Some(want));
            p.finish(want, &silent, &stems);
        }
        assert!(stems.is_ready_at(head as i64, 44_100));
        assert_eq!(p.next(head, true), Some(4));
        // A playing deck doesn't go back for what it has just left.
        let mut q = Progress::new(plan);
        q.finish(3, &silent, &stems);
        assert_eq!(q.next(head, false), Some(4));
        // Mid-region, the one under the head is enough.
        let head = (plan.boundary(5) + plan.boundary(6)) as f64 / 2.0;
        p.finish(5, &silent, &stems);
        assert!(stems.is_ready_at(head as i64, 44_100));
    }
}
