# Development

How Interlude is laid out, how to build it, and the checks to run before a change is merged.

## Architecture

```
crates/engine   Real-time audio engine (no UI). Decks, mixer, DSP, decoding,
                waveform analysis, sound card output.
crates/controller  MIDI and HID controllers: Mixxx mappings (and their
                scripts), MIDI learn, the built-in DDJ-FLX4 mapping.
crates/stems    Makes stems in the background (ONNX Runtime +
                HTDemucs), and the stems cache.
crates/cli      `dj` command-line tool for testing the engine headless.
app/            Desktop app: Tauri 2 shell (app/src-tauri) + Svelte 5 UI (app/src).
site/           The website, interludedj.com.
```

The UI never touches audio. It sends small commands to the engine through a
lock-free queue and reads state back from atomics, so a slow UI frame can't
cause a dropout. The audio thread never locks, allocates or touches the disk;
tracks are decoded up front on a worker thread and freed off the audio thread.

## Building

You need Rust (stable) and Node 20+.

**Linux** also needs: `libasound2-dev libudev-dev libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`
(Debian/Ubuntu names). **macOS** and **Windows** need nothing extra beyond
the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
The first build downloads ONNX Runtime (for stems) through the `ort` crate;
to use a copy you already have, set `ORT_LIB_LOCATION` to its folder.

```sh
# Desktop app (dev mode with hot reload)
cd app
npm install
npm run tauri dev

# Release build / installer
npm run tauri build

# UI only, in a browser, with a simulated engine (no Rust needed)
npm run dev        # then open http://localhost:1420

# Engine tests and benchmark
cargo test
cargo run --release -p dj-engine --example bench

# Headless CLI
cargo run --release -p dj-cli -- info track.mp3
cargo run --release -p dj-cli -- play a.mp3 b.mp3          # auto-crossfade A into B
cargo run --release -p dj-cli -- render a.mp3 b.mp3 mix.wav
cargo run --release -p dj-cli -- midi                      # print what a controller sends
cargo run --release -p dj-cli -- mappings                  # list controller mappings found
```

## Running the checks

There is no hosted CI, so run these before merging a change. The Tauri crate
embeds the built UI, so build the UI first.

```sh
# UI: type and Svelte checks, then build
cd app
npm ci
npm run check
npm run build
cd ..

# Rust: formatting, lints and tests
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

UI design notes are in [design-direction.md](design-direction.md).
