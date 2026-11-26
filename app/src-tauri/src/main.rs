// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Beat detection (Beat This!) runs on a pool of its own, but rten still
    // uses its global pool to prepare the models as they load: keep that to
    // two threads too. Set here, before any thread starts, because rten
    // reads it once.
    if std::env::var_os("RTEN_NUM_THREADS").is_none() {
        std::env::set_var("RTEN_NUM_THREADS", "2");
    }
    interlude_lib::run()
}
