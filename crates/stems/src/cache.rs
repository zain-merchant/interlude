//! The stems cache: finished stems saved to disk, so a track you've split
//! before has its stems the moment it loads.
//!
//! One file per track, named by a hash of the track's path, size and
//! modification time (so an edited file is split again) and the model. The
//! oldest files go first when the cache grows past its size limit.
//!
//! The format is a small lossless codec for 16-bit audio, the same idea as
//! FLAC's fixed predictors: each 4096-sample block of each channel is
//! predicted from the samples before it, and the small leftovers are Rice
//! coded. Stems are mostly quiet, so this roughly halves their size.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use dj_engine::stems::STORED;
use dj_engine::Stems;

const MAGIC: &[u8; 8] = b"OSSDJSTM";
const VERSION: u32 = 1;
const BLOCK: usize = 4096;
/// Six channels: vocals, bass, drums, each left and right.
const CHANNELS: usize = STORED * 2;
const EXT: &str = "stems";

/// Identifies one track's stems in the cache.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheKey(String);

impl CacheKey {
    /// The key for the file at `path` split with model `model`. `None` if
    /// the file can't be read.
    pub fn for_file(path: &Path, model: &str) -> Option<Self> {
        let meta = fs::metadata(path).ok()?;
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_nanos());
        let mut h = Fnv::new();
        h.write(path.to_string_lossy().as_bytes());
        h.write(&meta.len().to_le_bytes());
        h.write(&mtime.to_le_bytes());
        h.write(model.as_bytes());
        Some(Self(format!("{:016x}", h.0)))
    }

    fn file(&self, dir: &Path) -> PathBuf {
        dir.join(format!("{}.{EXT}", self.0))
    }
}

/// FNV-1a: a hash that stays the same across Rust versions and platforms.
struct Fnv(u64);

impl Fnv {
    fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 ^= b as u64;
            self.0 = self.0.wrapping_mul(0x0100_0000_01b3);
        }
    }
}

/// Fills `stems` from the cache and marks it all ready. Returns false if
/// there's no usable entry. A hit counts as a use, for eviction.
pub fn load(dir: &Path, key: &CacheKey, stems: &Stems) -> bool {
    let path = key.file(dir);
    let Ok(bytes) = fs::read(&path) else {
        return false;
    };
    if decode(&bytes, stems).is_err() {
        let _ = fs::remove_file(&path);
        return false;
    }
    for b in 0..stems.blocks() {
        stems.mark_ready(b);
    }
    if let Ok(f) = fs::File::options().append(true).open(&path) {
        let _ = f.set_modified(SystemTime::now());
    }
    true
}

/// Saves finished stems, then trims the cache to `limit` bytes. A limit of
/// 0 turns the cache off.
pub fn save(dir: &Path, key: &CacheKey, stems: &Stems, limit: u64) -> io::Result<()> {
    if limit == 0 {
        return Ok(());
    }
    fs::create_dir_all(dir)?;
    let bytes = encode(stems);
    let path = key.file(dir);
    let tmp = path.with_extension("part");
    fs::File::create(&tmp)?.write_all(&bytes)?;
    fs::rename(&tmp, &path)?;
    trim(dir, limit, Some(&path))
}

/// Total size of the cache in bytes.
pub fn size(dir: &Path) -> u64 {
    entries(dir).iter().map(|e| e.1).sum()
}

/// Deletes everything in the cache.
pub fn clear(dir: &Path) -> io::Result<()> {
    for (path, _, _) in entries(dir) {
        fs::remove_file(path)?;
    }
    Ok(())
}

/// Removes the least recently used entries until the cache fits in `limit`
/// bytes, keeping `keep` (the entry just written).
pub fn trim(dir: &Path, limit: u64, keep: Option<&Path>) -> io::Result<()> {
    let mut all = entries(dir);
    let mut total: u64 = all.iter().map(|e| e.1).sum();
    all.sort_by_key(|e| e.2);
    for (path, len, _) in all {
        if total <= limit {
            break;
        }
        if Some(path.as_path()) == keep {
            continue;
        }
        fs::remove_file(&path)?;
        total -= len;
    }
    Ok(())
}

fn entries(dir: &Path) -> Vec<(PathBuf, u64, SystemTime)> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    rd.flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == EXT))
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some((
                e.path(),
                m.len(),
                m.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            ))
        })
        .collect()
}

/// The 16-bit sample of channel `c` at `frame`, as stored in `stems`.
fn sample(stems: &Stems, frame: usize, c: usize) -> i16 {
    let (l, r) = stems.get(frame, c / 2);
    let x = if c % 2 == 0 { l } else { r };
    (x * 16384.0).round().clamp(-32768.0, 32767.0) as i16
}

pub(crate) fn encode(stems: &Stems) -> Vec<u8> {
    let frames = stems.frames();
    let mut w = BitWriter::default();
    let mut block = Vec::with_capacity(BLOCK);
    for start in (0..frames).step_by(BLOCK) {
        let end = (start + BLOCK).min(frames);
        for c in 0..CHANNELS {
            block.clear();
            block.extend((start..end).map(|f| sample(stems, f, c) as i32));
            encode_block(&block, &mut w);
        }
    }
    let mut out = Vec::with_capacity(w.bytes.len() + 32);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    out.extend_from_slice(&(frames as u64).to_le_bytes());
    out.extend_from_slice(&w.finish());
    out
}

pub(crate) fn decode(bytes: &[u8], stems: &Stems) -> Result<(), &'static str> {
    let mut header = bytes;
    let mut magic = [0u8; 8];
    header.read_exact(&mut magic).map_err(|_| "short")?;
    if &magic != MAGIC {
        return Err("not a stems file");
    }
    let mut v = [0u8; 4];
    header.read_exact(&mut v).map_err(|_| "short")?;
    if u32::from_le_bytes(v) != VERSION {
        return Err("old version");
    }
    let mut n = [0u8; 8];
    header.read_exact(&mut n).map_err(|_| "short")?;
    let frames = u64::from_le_bytes(n) as usize;
    if frames != stems.frames() {
        return Err("length differs");
    }
    let mut r = BitReader::new(header);
    let mut block = vec![[0i32; CHANNELS]; BLOCK];
    let mut one = Vec::with_capacity(BLOCK);
    for start in (0..frames).step_by(BLOCK) {
        let len = (start + BLOCK).min(frames) - start;
        for c in 0..CHANNELS {
            one.clear();
            decode_block(&mut r, len, &mut one)?;
            for (i, &x) in one.iter().enumerate() {
                block[i][c] = x;
            }
        }
        for (i, s) in block.iter().take(len).enumerate() {
            for st in 0..STORED {
                stems.write(
                    start + i,
                    st,
                    s[st * 2] as f32 / 16384.0,
                    s[st * 2 + 1] as f32 / 16384.0,
                );
            }
        }
    }
    Ok(())
}

/// Leftover of predictor `order` (0, 1 or 2) at sample `i`.
fn residual(x: &[i32], i: usize, order: usize) -> i32 {
    match order.min(i) {
        0 => x[i],
        1 => x[i] - x[i - 1],
        _ => x[i] - 2 * x[i - 1] + x[i - 2],
    }
}

fn zigzag(v: i32) -> u32 {
    ((v << 1) ^ (v >> 31)) as u32
}

fn unzigzag(u: u32) -> i32 {
    ((u >> 1) as i32) ^ -((u & 1) as i32)
}

fn encode_block(x: &[i32], w: &mut BitWriter) {
    // Pick the predictor that leaves the least.
    let cost = |o| {
        x.iter()
            .enumerate()
            .map(|(i, _)| residual(x, i, o).unsigned_abs() as u64)
            .sum::<u64>()
    };
    let (order, total) = (0..3)
        .map(|o| (o, cost(o)))
        .min_by_key(|&(_, c)| c)
        .unwrap_or((0, 0));
    let mean = total / x.len().max(1) as u64;
    let k = (64 - mean.leading_zeros()).min(30);
    w.put(order as u32, 2);
    w.put(k, 5);
    for i in 0..x.len() {
        let u = zigzag(residual(x, i, order));
        let q = u >> k;
        if q < 32 {
            // Unary quotient, then the low bits.
            for _ in 0..q {
                w.put(1, 1);
            }
            w.put(0, 1);
            w.put(u & ((1 << k) - 1), k);
        } else {
            // Rare big leftover: an escape, then the value in full.
            for _ in 0..32 {
                w.put(1, 1);
            }
            w.put(u, 32);
        }
    }
}

fn decode_block(r: &mut BitReader, len: usize, out: &mut Vec<i32>) -> Result<(), &'static str> {
    let order = r.get(2)? as usize;
    let k = r.get(5)?;
    for i in 0..len {
        let mut q = 0;
        while q < 32 && r.get(1)? == 1 {
            q += 1;
        }
        let u = if q == 32 {
            r.get(32)?
        } else {
            (q << k) | r.get(k)?
        };
        let e = unzigzag(u);
        let x = match order.min(i) {
            0 => e,
            1 => e + out[i - 1],
            _ => e + 2 * out[i - 1] - out[i - 2],
        };
        out.push(x);
    }
    Ok(())
}

#[derive(Default)]
struct BitWriter {
    bytes: Vec<u8>,
    acc: u64,
    bits: u32,
}

impl BitWriter {
    fn put(&mut self, value: u32, n: u32) {
        if n == 0 {
            return;
        }
        self.acc = (self.acc << n) | (value as u64 & ((1u64 << n) - 1));
        self.bits += n;
        while self.bits >= 8 {
            self.bits -= 8;
            self.bytes.push((self.acc >> self.bits) as u8);
        }
    }

    fn finish(mut self) -> Vec<u8> {
        if self.bits > 0 {
            let pad = 8 - self.bits;
            self.put(0, pad);
        }
        self.bytes
    }
}

struct BitReader<'a> {
    bytes: &'a [u8],
    pos: usize,
    acc: u64,
    bits: u32,
}

impl<'a> BitReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            pos: 0,
            acc: 0,
            bits: 0,
        }
    }

    fn get(&mut self, n: u32) -> Result<u32, &'static str> {
        if n == 0 {
            return Ok(0);
        }
        while self.bits < n {
            let b = *self.bytes.get(self.pos).ok_or("truncated")?;
            self.pos += 1;
            self.acc = (self.acc << 8) | b as u64;
            self.bits += 8;
        }
        self.bits -= n;
        Ok(((self.acc >> self.bits) & ((1u64 << n) - 1)) as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filled(frames: usize) -> Stems {
        let s = Stems::new(frames);
        for f in 0..frames {
            let t = f as f32;
            s.write(f, 0, (t * 0.01).sin() * 0.4, (t * 0.011).sin() * 0.3);
            s.write(f, 1, (t * 0.002).sin() * 0.9, -(t * 0.002).sin() * 0.9);
            // Noise-like drums, and a loud clipped spot.
            let n = ((f * 7919) % 2003) as f32 / 1001.0 - 1.0;
            s.write(f, 2, n * 0.5, if f == 100 { 1.99 } else { 0.0 });
        }
        s
    }

    #[test]
    fn round_trips_exactly() {
        let a = filled(10_000);
        let bytes = encode(&a);
        let b = Stems::new(10_000);
        decode(&bytes, &b).unwrap();
        for f in 0..10_000 {
            for st in 0..STORED {
                assert_eq!(a.get(f, st), b.get(f, st), "frame {f} stem {st}");
            }
        }
        // Smaller than raw 16-bit.
        assert!(bytes.len() < 10_000 * CHANNELS * 2, "{} bytes", bytes.len());
        // A wrong length is refused.
        assert!(decode(&bytes, &Stems::new(9_999)).is_err());
        assert!(decode(&bytes[..bytes.len() / 2], &b).is_err());
    }

    #[test]
    fn save_load_and_trim() {
        let dir = std::env::temp_dir().join(format!("oss-dj-stems-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let a = filled(5000);
        let k1 = CacheKey("one".into());
        let k2 = CacheKey("two".into());
        save(&dir, &k1, &a, u64::MAX).unwrap();
        let one = size(&dir);
        assert!(one > 0);
        let b = Stems::new(5000);
        assert!(load(&dir, &k1, &b));
        assert!(b.is_complete());
        assert!(!load(&dir, &k2, &Stems::new(5000)));
        // Room for one entry only: saving a second drops the first.
        std::thread::sleep(std::time::Duration::from_millis(20));
        save(&dir, &k2, &a, one + one / 2).unwrap();
        assert!(!k1.file(&dir).exists());
        assert!(k2.file(&dir).exists());
        clear(&dir).unwrap();
        assert_eq!(size(&dir), 0);
        let _ = fs::remove_dir_all(&dir);
    }
}
