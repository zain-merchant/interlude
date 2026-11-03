//! Fetching the model file on first use, checked against a known hash.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::Error;

/// Downloads `url` to `dest`, calling `progress(done, total)` as bytes
/// arrive (`total` is 0 if the server doesn't say). The file only appears
/// at `dest` once it's complete and its SHA-256 matches `sha256` (hex).
pub fn fetch(
    url: &str,
    sha256: &str,
    dest: &Path,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), Error> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir)?;
    }
    let response = ureq::get(url)
        .call()
        .map_err(|e| Error::Download(e.to_string()))?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mut body = response.into_body().into_reader();
    let part = dest.with_extension("part");
    let mut file = fs::File::create(&part)?;
    let mut hash = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    let mut done = 0u64;
    loop {
        let n = body.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        hash.update(&buf[..n]);
        done += n as u64;
        progress(done, total);
    }
    file.sync_all()?;
    drop(file);
    let got = hex(&hash.finalize());
    if !got.eq_ignore_ascii_case(sha256) {
        let _ = fs::remove_file(&part);
        return Err(Error::Download(format!(
            "the downloaded model doesn't match (expected {sha256}, got {got})"
        )));
    }
    fs::rename(&part, dest)?;
    Ok(())
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

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
