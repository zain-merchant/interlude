// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Beat detection (Beat This! on rten) runs in the background, often
    // while a set plays: keep it to two threads, as stem splitting is. Set
    // here, before any thread starts, because rten reads it once.
    if std::env::var_os("RTEN_NUM_THREADS").is_none() {
        std::env::set_var("RTEN_NUM_THREADS", "2");
    }
    interlude_lib::run()
}
