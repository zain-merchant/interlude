//! Which sound card the master plays through, from Settings > Audio.
//!
//! By default ("Automatic") the app plays through a DJ controller's own
//! sound card when one is plugged in, so its headphone output works, and
//! through the system default otherwise. Picking a device by name (the
//! laptop's speakers, say) keeps the controller for control only. The
//! choice lives in `audio.json` in the app's data folder.

use std::path::PathBuf;

use dj_engine::output::OutputTarget;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{AppState, Output};

/// Sound cards `Automatic` looks for, in the order given.
pub const PREFERRED: &[&str] = &["DDJ-FLX4"];

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    /// The device picked by name, or `None` for automatic.
    #[serde(default)]
    pub device: Option<String>,
}

fn path() -> Option<PathBuf> {
    crate::paths::data_dir().map(|d| d.join("audio.json"))
}

pub fn load() -> Saved {
    path()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(saved: &Saved) {
    let Some(p) = path() else { return };
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    if let Ok(json) = serde_json::to_vec_pretty(saved) {
        let _ = std::fs::write(p, json);
    }
}

pub fn target(saved: &Saved) -> OutputTarget {
    match &saved.device {
        Some(name) => OutputTarget::Named(name.clone()),
        None => OutputTarget::Auto,
    }
}

/// The Audio settings page.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputs {
    /// Output devices plugged in now.
    devices: Vec<String>,
    /// The saved choice: a device name, or null for automatic.
    choice: Option<String>,
}

#[tauri::command]
pub fn audio_outputs(state: State<'_, AppState>) -> AudioOutputs {
    AudioOutputs {
        devices: dj_engine::output::output_devices(),
        choice: state.audio.lock().expect("audio settings").device.clone(),
    }
}

/// Moves the master to `device` (null for automatic) and remembers it.
/// Returns the device now playing.
#[tauri::command]
pub async fn set_audio_output(
    state: State<'_, AppState>,
    device: Option<String>,
) -> Result<String, String> {
    let Output::Device(out) = &state.output else {
        return Err("there's no sound card to play through".into());
    };
    let saved = Saved { device };
    let playing = out.switch(target(&saved))?;
    save(&saved);
    *state.audio.lock().map_err(|_| "lock poisoned")? = saved;
    Ok(playing)
}
