# oss-dj

A free, open-source DJ app that is fast, modern and uncluttered. No paywalled
"pro" features, no lock-in.

![oss-dj running on Linux with two test tracks loaded](docs/screenshot.png)

> **Status: early development (Phase 2 under way).** You can load two
> tracks, see their BPM, sync them, cue, change pitch, EQ and crossfade.
> Hot cues, loops and controller support come next. See the roadmap below.

## What works today

- **Audio engine (Rust):** two decks with varispeed playback, CDJ-style cue
  (set, hold to preview, play from preview), nudge, ±8/16/50% pitch.
- **Tempo:** BPM and beatgrid detected on load (about 0.2 s for a 6-minute
  track), shown on each deck and as beat lines on the waveform (a stronger
  line every 4 beats). SYNC matches tempo and beat phase to the other deck,
  picking half or double time when that's closer (e.g. 87 vs 174 BPM).
  Detection range is 80-160 BPM; constant tempo only for now.
- **Mixer:** trim, 3-band isolator EQ with full kills, channel faders,
  constant-power crossfader, master gain, headphone cue with cue/master blend
  (on interfaces with 4+ outputs, headphones go to channels 3-4).
- **Formats:** MP3, AAC/M4A, FLAC, WAV, AIFF, OGG/Vorbis, ALAC via Symphonia.
- **Waveforms:** frequency-colored (bass blue, mids amber, highs white),
  drawn on the GPU with WebGL2: scrolling view per deck plus a full-track
  overview you can click to jump.
- **Library:** add music folders, instant search across artist, title and
  folder, load with double-click, Enter, or Shift+←/→.
- **Safety:** loading onto a playing deck is blocked.

The engine renders two playing decks at about 1% of one CPU core, and a
test guarantees the audio thread never allocates memory.

## Keyboard

| Key | Action |
| --- | --- |
| Q / W | Deck A cue (hold) / play-pause |
| O / P | Deck B cue (hold) / play-pause |
| [ / ] | Crossfader left / right |
| − / = | Zoom waveforms out / in |
| Ctrl/⌘ F | Search the library |
| ↑ / ↓, Enter | Pick a track, load it |
| Shift ← / → | Load selected track to deck A / B |

Knobs: drag up/down (Shift for fine), scroll, or arrow keys. Double-click any
knob or fader to reset it.

## Architecture

```
crates/engine   Real-time audio engine (no UI). Decks, mixer, DSP, decoding,
                waveform analysis, sound card output.
crates/cli      `dj` command-line tool for testing the engine headless.
app/            Desktop app: Tauri 2 shell (app/src-tauri) + Svelte 5 UI (app/src).
```

The UI never touches audio. It sends small commands to the engine through a
lock-free queue and reads state back from atomics, so a slow UI frame can't
cause a dropout. The audio thread never locks, allocates or touches the disk;
tracks are decoded up front on a worker thread and freed off the audio thread.

## Building

You need Rust (stable) and Node 20+.

**Linux** also needs: `libasound2-dev libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`
(Debian/Ubuntu names). **macOS** and **Windows** need nothing extra beyond
the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

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
```

## Roadmap

1. **Phase 0/1 · Playable** (now): two decks, mixer, waveforms, basic library.
   Gate: you can mix two tracks by ear for an hour.
2. **Phase 2 · DJ-ready:** BPM, beatgrid and key analysis; sync, keylock,
   quantize; hot cues, loops, beat jump; effects; recording; MIDI learn and
   Mixxx controller mapping support; SQLite library.
   Gate: a full 2-hour set on your own controller.
3. **Phase 3 · Public beta, then 1.0:** Rekordbox and Serato import, crates,
   history; top 10 controllers tested; installers for macOS, Windows, Linux.
4. **Beyond 1.0:** stems, 4 decks, samplers, HID jog displays, DVS, CDJ USB
   export.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). This keeps the door open to port
algorithms and controller mappings from Mixxx (GPL-2.0-or-later) and to use
GPL libraries such as Rubber Band and libKeyFinder.
