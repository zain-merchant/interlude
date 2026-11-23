//! What making stems takes on this computer, noted as it happens.
//!
//! Nothing is run to find out: each figure comes from work that was being
//! done anyway. The last few of each are kept in a small file, so the user
//! can be told what to expect. Medians are used for time, so one slow go on
//! a busy computer doesn't count for much, and the most that was seen for
//! memory, since that's said as "up to".

use std::fs;
use std::path::Path;

/// How many of each figure are kept.
const KEEP: usize = 15;
/// Longer than this isn't a measurement: the computer slept, say.
const LONGEST: f32 = 600.0;
/// The first line of the file, which is dropped if it's for another layout.
const HEADER: &str = "interlude stems measurements 1";

/// What's noted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Figure {
    /// Seconds from first using a track's stems to hearing them, with
    /// nothing prepared.
    Heard,
    /// GB more than before the model was loaded, at the most.
    Memory,
}

const FIGURES: [(Figure, &str); 2] = [(Figure::Heard, "heard"), (Figure::Memory, "memory")];

/// The figures noted so far.
#[derive(Debug, Clone, PartialEq)]
pub struct Measured {
    /// The computer they're from.
    machine: String,
    kept: [Vec<f32>; FIGURES.len()],
    changed: bool,
}

/// What there is to say about them.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Summary {
    /// Seconds from a press to the sound.
    pub heard: Option<f32>,
    /// GB, at the most.
    pub memory: Option<f32>,
}

impl Measured {
    /// Nothing noted yet, on `machine`.
    pub fn new(machine: &str) -> Self {
        Self {
            machine: machine.replace(['\n', '\r'], " "),
            kept: Default::default(),
            changed: false,
        }
    }

    /// What was noted in `path` on `machine`. Anything from another computer
    /// (a copied home folder) or that can't be read is left out.
    pub fn read(path: &Path, machine: &str) -> Self {
        let mut m = Self::new(machine);
        let Ok(text) = fs::read_to_string(path) else {
            return m;
        };
        let mut lines = text.lines();
        if lines.next() != Some(HEADER) || lines.next() != Some(&m.machine) {
            return m;
        }
        for line in lines {
            let mut words = line.split_whitespace();
            let name = words.next().unwrap_or_default();
            if let Some(i) = FIGURES.iter().position(|(_, n)| *n == name) {
                for v in words.filter_map(|w| w.parse().ok()) {
                    m.push(i, v);
                }
            }
        }
        m.changed = false;
        m
    }

    /// Whether anything has been noted since it was read or written.
    pub fn is_new(&self) -> bool {
        self.changed
    }

    /// Writes them to `path`, if any are new.
    pub fn write(&mut self, path: &Path) {
        if !std::mem::take(&mut self.changed) {
            return;
        }
        let mut text = format!("{HEADER}\n{}\n", self.machine);
        for ((_, name), kept) in FIGURES.iter().zip(&self.kept) {
            let values: Vec<String> = kept.iter().map(|v| format!("{v:.3}")).collect();
            text += &format!("{name} {}\n", values.join(" "));
        }
        // Renamed into place, so it's never half written.
        let part = path.with_extension("part");
        let _ = fs::write(&part, text).and_then(|()| fs::rename(&part, path));
    }

    /// Notes one figure.
    pub fn note(&mut self, figure: Figure, value: f32) {
        if let Some(i) = FIGURES.iter().position(|(f, _)| *f == figure) {
            self.push(i, value);
        }
    }

    fn push(&mut self, i: usize, value: f32) {
        if !value.is_finite() || value <= 0.0 || value > LONGEST {
            return;
        }
        let kept = &mut self.kept[i];
        if kept.len() == KEEP {
            kept.remove(0);
        }
        kept.push(value);
        self.changed = true;
    }

    fn of(&self, figure: Figure) -> &[f32] {
        FIGURES
            .iter()
            .position(|(f, _)| *f == figure)
            .map_or(&[], |i| &self.kept[i])
    }

    /// How many of a figure have been noted.
    pub fn count(&self, figure: Figure) -> usize {
        self.of(figure).len()
    }

    /// The middle one of a figure's last few.
    pub fn median(&self, figure: Figure) -> Option<f32> {
        let mut v = self.of(figure).to_vec();
        v.sort_by(f32::total_cmp);
        v.get(v.len() / 2).copied()
    }

    pub fn summary(&self) -> Summary {
        Summary {
            heard: self.median(Figure::Heard),
            memory: self.of(Figure::Memory).iter().copied().reduce(f32::max),
        }
    }
}

/// What kind of computer this is, to tell it from another one that the same
/// files have been copied to.
pub fn machine() -> String {
    let cores = std::thread::available_parallelism().map_or(0, |n| n.get());
    format!(
        "{} {} {cores} {}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        model_name().unwrap_or_default()
    )
}

#[cfg(target_os = "macos")]
fn model_name() -> Option<String> {
    let mut buf = [0u8; 64];
    let mut len = buf.len();
    let ok = unsafe {
        libc::sysctlbyname(
            c"hw.model".as_ptr(),
            buf.as_mut_ptr().cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    let end = buf[..len.min(buf.len())]
        .iter()
        .position(|b| *b == 0)
        .unwrap_or(0);
    (ok == 0).then(|| String::from_utf8_lossy(&buf[..end]).into_owned())
}

#[cfg(not(target_os = "macos"))]
fn model_name() -> Option<String> {
    None
}

/// The memory this app takes now, in bytes, as the system counts it. `None`
/// where that can't be read.
#[cfg(target_os = "macos")]
pub fn memory() -> Option<u64> {
    let mut info: libc::rusage_info_v4 = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        libc::proc_pid_rusage(
            libc::getpid(),
            libc::RUSAGE_INFO_V4,
            &mut info as *mut _ as *mut libc::rusage_info_t,
        )
    };
    (ok == 0).then_some(info.ri_phys_footprint)
}

#[cfg(target_os = "linux")]
pub fn memory() -> Option<u64> {
    let text = fs::read_to_string("/proc/self/statm").ok()?;
    let pages: u64 = text.split_whitespace().nth(1)?.parse().ok()?;
    let page = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    Some(pages * u64::try_from(page).ok()?)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn memory() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_slow_go_does_not_count_for_much() {
        let mut m = Measured::new("a");
        assert_eq!(m.summary(), Summary::default());
        for v in [4.0, 4.2, 55.0, 3.9, 4.1] {
            m.note(Figure::Heard, v);
        }
        assert_eq!(m.summary().heard, Some(4.1));
    }

    #[test]
    fn memory_is_the_most_there_was() {
        let mut m = Measured::new("a");
        for v in [2.1, 2.6, 2.3] {
            m.note(Figure::Memory, v);
        }
        assert_eq!(m.summary().memory, Some(2.6));
    }

    #[test]
    fn old_figures_make_way_for_new() {
        let mut m = Measured::new("a");
        for _ in 0..KEEP {
            m.note(Figure::Heard, 40.0);
        }
        for _ in 0..KEEP {
            m.note(Figure::Heard, 10.0);
        }
        assert_eq!(m.count(Figure::Heard), KEEP);
        assert_eq!(m.summary().heard, Some(10.0));
    }

    #[test]
    fn nonsense_is_not_noted() {
        let mut m = Measured::new("a");
        for v in [0.0, -1.0, f32::NAN, f32::INFINITY, 7200.0] {
            m.note(Figure::Heard, v);
        }
        assert_eq!(m.summary(), Summary::default());
    }

    #[test]
    fn kept_between_launches_on_the_same_computer_only() {
        let dir = std::env::temp_dir().join(format!("stems-measure-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("stems-measured.txt");
        let mut m = Measured::new("mac\none");
        m.note(Figure::Heard, 4.25);
        m.note(Figure::Memory, 2.4);
        m.write(&path);
        let again = Measured::read(&path, "mac\none");
        assert_eq!(again.summary(), m.summary());
        assert_eq!(
            Measured::read(&path, "another").summary(),
            Summary::default()
        );
        // Nothing new, nothing written.
        fs::remove_file(&path).unwrap();
        m.write(&path);
        assert!(!path.exists());
        // Damaged, or from another version.
        for text in [
            "",
            "junk",
            "interlude stems measurements 9\nmac one\nheard 1\n",
        ] {
            fs::write(&path, text).unwrap();
            assert_eq!(
                Measured::read(&path, "mac one").summary(),
                Summary::default()
            );
        }
        fs::write(
            &path,
            format!("{HEADER}\nmac one\nheard 3 x 5 4\nnew-one 9\nmemory\n"),
        )
        .unwrap();
        assert_eq!(Measured::read(&path, "mac one").summary().heard, Some(4.0));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn says_which_computer_and_how_much_memory() {
        assert!(machine().contains(std::env::consts::ARCH));
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        assert!(memory().unwrap() > 1_000_000);
    }
}
