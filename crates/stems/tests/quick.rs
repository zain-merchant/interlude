//! The copy of the model that loads quickly, with the stand-in model.

use std::path::{Path, PathBuf};

use dj_stems::{quick, Model};

/// A folder with the model in it, gone again afterwards.
struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Self {
        let d = std::env::temp_dir().join(format!("stems-quick-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let from = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/fake-stems.onnx");
        std::fs::copy(from, d.join("model.onnx")).unwrap();
        Self(d)
    }
    fn model(&self) -> PathBuf {
        self.0.join("model.onnx")
    }
    /// Everything beside the model.
    fn others(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.0)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| *p != self.model())
            .collect()
    }
    fn copy(&self) -> PathBuf {
        let others = self.others();
        assert_eq!(others.len(), 1, "{others:?}");
        others[0].clone()
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// What a loaded model makes of some audio, bit for bit.
fn output(path: &Path) -> Vec<u32> {
    let mut m = Model::load(path).expect("loads");
    let n = m.segment();
    let audio: Vec<f32> = (0..n).map(|i| (i as f32 * 0.05).sin() * 0.4).collect();
    let out = m.run(&audio, &audio).expect("runs");
    [out.vocals, out.bass, out.drums]
        .iter()
        .flatten()
        .flatten()
        .map(|s| s.to_bits())
        .collect()
}

#[test]
fn gives_exactly_what_the_model_does() {
    let d = Dir::new("same");
    let plain = output(&d.model());
    assert!(!quick::exists(&d.model()));
    quick::make(&d.model()).unwrap();
    assert!(quick::exists(&d.model()));
    assert!(quick::size(&d.model()) > 0);
    assert_eq!(output(&d.model()), plain);
    // Made once.
    let copy = d.copy();
    let made = std::fs::metadata(&copy).unwrap().modified().unwrap();
    quick::make(&d.model()).unwrap();
    assert_eq!(
        std::fs::metadata(d.copy()).unwrap().modified().unwrap(),
        made
    );
}

#[test]
fn a_damaged_copy_is_never_used() {
    for (name, damage) in [
        (
            "flipped",
            (|b: &mut Vec<u8>| {
                let n = b.len() / 2;
                b[n] ^= 0xFF
            }) as fn(&mut Vec<u8>),
        ),
        ("short", |b| b.truncate(b.len() / 2)),
        ("empty", |b| b.clear()),
        ("junk", |b| b.iter_mut().for_each(|x| *x = 7)),
    ] {
        let d = Dir::new(name);
        let plain = output(&d.model());
        quick::make(&d.model()).unwrap();
        let copy = d.copy();
        let mut bytes = std::fs::read(&copy).unwrap();
        damage(&mut bytes);
        std::fs::write(&copy, bytes).unwrap();
        assert_eq!(output(&d.model()), plain, "{name}");
        assert!(!copy.exists(), "{name}: deleted");
        quick::make(&d.model()).unwrap();
        assert_eq!(output(&d.model()), plain, "{name}: made again");
    }
}

/// One that has the right hash but isn't a model the app can use.
#[test]
fn a_copy_that_will_not_load_falls_back_to_the_model() {
    let d = Dir::new("notamodel");
    let plain = output(&d.model());
    quick::make(&d.model()).unwrap();
    let copy = d.copy();
    let name = copy.file_name().unwrap().to_str().unwrap().to_string();
    let parts: Vec<&str> = name.split('.').collect();
    std::fs::write(&copy, b"not a model").unwrap();
    let hash = dj_stems::download::file_sha256(&copy).unwrap();
    let fake = d.0.join(format!(
        "{}.{}.{}.quick.onnx",
        parts[0],
        parts[1],
        &hash[..16]
    ));
    std::fs::rename(&copy, &fake).unwrap();
    assert!(quick::exists(&d.model()));
    assert_eq!(output(&d.model()), plain);
    assert!(!fake.exists(), "and it's gone");
}

#[test]
fn copies_of_something_else_are_ignored_and_cleared() {
    let d = Dir::new("stale");
    // From another version, and one that was never finished.
    let old =
        d.0.join("model.0123456789abcdef.0123456789abcdef.quick.onnx");
    let unfinished = d.0.join("model.quick.building");
    std::fs::write(&old, b"old").unwrap();
    std::fs::write(&unfinished, b"half").unwrap();
    // Not ours.
    let other = d.0.join("model.notes.txt");
    std::fs::write(&other, b"mine").unwrap();
    assert!(!quick::exists(&d.model()));
    let plain = output(&d.model());
    quick::make(&d.model()).unwrap();
    assert!(!old.exists() && !unfinished.exists());
    assert!(other.exists());
    assert_eq!(output(&d.model()), plain);

    // The model is replaced: the copy of the old one isn't used.
    assert!(quick::exists(&d.model()));
    let bytes = std::fs::read(d.model()).unwrap();
    std::fs::remove_file(d.model()).unwrap();
    assert!(!quick::exists(&d.model()), "no model, no copy");
    std::thread::sleep(std::time::Duration::from_millis(20));
    std::fs::write(d.model(), bytes).unwrap();
    assert!(!quick::exists(&d.model()));
    quick::make(&d.model()).unwrap();
    assert_eq!(d.others().len(), 2, "one copy, and the notes");

    quick::remove(&d.model()).unwrap();
    assert_eq!(d.others(), [other]);
    assert_eq!(output(&d.model()), plain);
}

#[cfg(unix)]
#[test]
fn nowhere_to_write_leaves_the_model_as_it_is() {
    use std::os::unix::fs::PermissionsExt;
    let d = Dir::new("readonly");
    let plain = output(&d.model());
    let set = |mode| {
        std::fs::set_permissions(&d.0, std::fs::Permissions::from_mode(mode)).unwrap();
    };
    set(0o555);
    assert!(quick::make(&d.model()).is_err());
    assert_eq!(output(&d.model()), plain);
    set(0o755);
    assert!(d.others().is_empty());
}

#[test]
fn many_at_once_make_one() {
    let d = Dir::new("many");
    let threads: Vec<_> = (0..4)
        .map(|_| {
            let m = d.model();
            std::thread::spawn(move || quick::make(&m).unwrap())
        })
        .collect();
    threads.into_iter().for_each(|t| t.join().unwrap());
    d.copy();
}

#[test]
fn no_model_is_an_error() {
    let d = Dir::new("none");
    std::fs::remove_file(d.model()).unwrap();
    assert!(quick::make(&d.model()).is_err());
    assert!(d.others().is_empty());
}

#[cfg(unix)]
#[test]
fn no_room_on_the_disk_makes_nothing() {
    let d = Dir::new("full");
    // Takes no room itself.
    let f = std::fs::File::create(d.model()).unwrap();
    f.set_len(1 << 45).unwrap();
    let e = quick::make(&d.model()).unwrap_err().to_string();
    assert!(e.contains("no room"), "{e}");
    assert!(d.others().is_empty());
}
