//! Keeping heavy background work (analysis, Beat This!, stem splitting)
//! below what the user hears and touches.
//!
//! On macOS a thread's quality-of-service class tells the scheduler how
//! much it matters. Threads start at the default class whatever made them,
//! so each background thread lowers itself with [`lower`], and threads a
//! background thread spawns for its own work take its class with
//! [`Priority::current`] and [`Priority::apply`]. The audio callback runs
//! on Core Audio's real-time thread, which none of this touches. Elsewhere
//! these do nothing.
//!
//! The two neural networks, Beat This! and the stem splitter, also take
//! turns ([`turn`]). On an M5 MacBook Air either one running beside the
//! audio is fine, but both at once now and then hold up the audio thread
//! for 3 to 50 ms (it keeps its priority and barely uses the CPU meanwhile,
//! so it's held up in the system, not crowded out): a dropout. In a test
//! playing two decks while both networks ran over and over, 4 runs of 6
//! dropped out; taking turns, none of 12 did.

use std::sync::{Condvar, Mutex};

/// A thread's priority, as [`Priority::current`] read it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Priority(#[allow(dead_code)] u32);

impl Priority {
    /// The calling thread's priority.
    pub fn current() -> Self {
        #[cfg(target_os = "macos")]
        {
            // SAFETY: reads the calling thread's own class.
            Self(unsafe { qos_class_self() } as u32)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Self(0)
        }
    }

    /// Gives the calling thread this priority.
    pub fn apply(self) {
        #[cfg(target_os = "macos")]
        if self != Self::current() {
            if let Some(class) = class(self.0) {
                // SAFETY: changes only the calling thread's own class.
                unsafe { libc::pthread_set_qos_class_self_np(class, 0) };
            }
        }
    }

    /// Whether this is below what the user is waiting on.
    pub fn is_background(self) -> bool {
        #[cfg(target_os = "macos")]
        {
            matches!(
                class(self.0),
                Some(
                    libc::qos_class_t::QOS_CLASS_UTILITY | libc::qos_class_t::QOS_CLASS_BACKGROUND
                )
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    // In libSystem (pthread/qos.h); the libc crate doesn't declare it.
    fn qos_class_self() -> libc::qos_class_t;
}

#[cfg(target_os = "macos")]
fn class(raw: u32) -> Option<libc::qos_class_t> {
    use libc::qos_class_t::*;
    [
        QOS_CLASS_USER_INTERACTIVE,
        QOS_CLASS_USER_INITIATED,
        QOS_CLASS_DEFAULT,
        QOS_CLASS_UTILITY,
        QOS_CLASS_BACKGROUND,
    ]
    .into_iter()
    .find(|&c| c as u32 == raw)
}

/// Lowers the calling thread below anything the user is waiting on (the
/// utility class: it still runs at full speed on an idle Mac, but gives way
/// to the audio, the UI and other apps).
pub fn lower() {
    #[cfg(target_os = "macos")]
    // SAFETY: changes only the calling thread's own class.
    unsafe {
        libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0);
    }
}

/// Turns on the networks, served in the order they were asked for.
struct Lane {
    /// The next ticket to hand out, and the one being served.
    tickets: Mutex<(u64, u64)>,
    next: Condvar,
}

static LANE: Lane = Lane {
    tickets: Mutex::new((0, 0)),
    next: Condvar::new(),
};

/// A turn on the networks, from [`turn`]; it ends when dropped.
#[must_use = "the turn ends when this is dropped"]
pub struct Turn(());

/// Waits for a turn to run a neural network (one stretch of it: a region
/// of stems, a minute of Beat This!), so only one runs at a time. Turns
/// are served first come, first served, so neither network starves the
/// other.
pub fn turn() -> Turn {
    let mut t = LANE.tickets.lock().unwrap_or_else(|e| e.into_inner());
    let mine = t.0;
    t.0 += 1;
    while t.1 != mine {
        t = LANE.next.wait(t).unwrap_or_else(|e| e.into_inner());
    }
    Turn(())
}

impl Drop for Turn {
    fn drop(&mut self) {
        LANE.tickets.lock().unwrap_or_else(|e| e.into_inner()).1 += 1;
        LANE.next.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn one_turn_at_a_time_and_in_order() {
        let inside = Arc::new(AtomicUsize::new(0));
        let order = Arc::new(Mutex::new(Vec::new()));
        // Hold the lane while the others line up, one after another.
        let first = turn();
        let waiting: Vec<_> = (0..4)
            .map(|i| {
                let (inside, order) = (inside.clone(), order.clone());
                let t = std::thread::spawn(move || {
                    let _t = turn();
                    assert_eq!(
                        inside.fetch_add(1, Ordering::SeqCst),
                        0,
                        "two turns at once"
                    );
                    order.lock().unwrap().push(i);
                    std::thread::sleep(Duration::from_millis(5));
                    inside.fetch_sub(1, Ordering::SeqCst);
                });
                // Give it time to take its ticket.
                std::thread::sleep(Duration::from_millis(30));
                t
            })
            .collect();
        drop(first);
        for t in waiting {
            t.join().unwrap();
        }
        assert_eq!(*order.lock().unwrap(), vec![0, 1, 2, 3]);
    }

    #[test]
    fn a_thread_that_keeps_coming_back_lets_the_other_in() {
        // The splitter asks again as soon as a region is done; Beat This!
        // still gets its turn next.
        let other_ran = Arc::new(AtomicUsize::new(0));
        let first = turn();
        let other = {
            let other_ran = other_ran.clone();
            std::thread::spawn(move || {
                let _t = turn();
                other_ran.store(1, Ordering::SeqCst);
            })
        };
        std::thread::sleep(Duration::from_millis(30));
        drop(first);
        let again = turn();
        assert_eq!(other_ran.load(Ordering::SeqCst), 1);
        drop(again);
        other.join().unwrap();
    }

    #[test]
    fn a_lowered_thread_is_background_and_passes_it_on() {
        std::thread::spawn(|| {
            lower();
            let mine = Priority::current();
            if cfg!(target_os = "macos") {
                assert!(mine.is_background());
            }
            // A new thread starts at the default, and takes it when asked.
            std::thread::scope(|s| {
                s.spawn(|| {
                    if cfg!(target_os = "macos") {
                        assert!(!Priority::current().is_background());
                    }
                    mine.apply();
                    assert_eq!(Priority::current(), mine);
                });
            });
        })
        .join()
        .unwrap();
    }
}
