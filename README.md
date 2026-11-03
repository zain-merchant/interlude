# oss-dj

A free, open-source DJ app that is fast, modern and uncluttered. No paywalled
"pro" features, no lock-in.

![oss-dj running on Linux with two test tracks loaded](docs/screenshot.png)

> **Status: early development (Phase 2 under way).** You can load two
> tracks, see their BPM, sync them, cue, change pitch, EQ and crossfade.
> The Pioneer DDJ-FLX4 works as a controller, including hot cues, loops and
> beat jump. See the roadmap below.

## What works today

- **Audio engine (Rust):** two decks with varispeed playback, CDJ-style cue
  (set, hold to preview, play from preview), nudge, ±8/16/50% pitch.
- **Tempo:** BPM and beatgrid detected on load (about 0.2 s for a 6-minute
  track), shown on each deck and as beat lines on the waveform (a stronger
  line every 4 beats). SYNC matches tempo and beat phase to the other deck,
  picking half or double time when that's closer (e.g. 87 vs 174 BPM).
  Detection range is 80-160 BPM; constant tempo only for now.
- **Hot cues, loops, beat jump:** 8 hot cues per deck (4 on screen, all 8
  on the FLX4 pads): set, jump, hold on a paused deck to preview. Beat loops
  snap to the beatgrid, halve and double, and wrap without clicks. Beat jump
  moves by the loop size and carries an active loop with it. Cues are kept
  until the track is unloaded; saving them with the library comes later.
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
- **Controller: Pioneer DDJ-FLX4.** Plug it in (before or after starting the
  app) and it connects by itself; audio goes through its sound card, with
  headphones on its headphone jack. Mapped: play, cue, sync (SHIFT + SYNC
  changes pitch range), pitch fader (picks up the current rate after SYNC
  rather than jumping), jog wheels (top: audible vinyl-style scratching,
  forwards and backwards; outer ring: nudge while playing, audible scrub
  while paused; SHIFT + jog: fast search), trim, EQ, channel
  faders, crossfader, headphone cue, browse knob and load buttons, with
  play/cue/headphone LEDs. Pads in hot cue (SHIFT + pad clears), beat loop
  and beat jump modes; loop in, out, reloop/exit, 4-beat loop (SHIFT + IN),
  CUE/LOOP CALL halves and doubles the loop (with SHIFT: beat jump), all
  with LEDs. FX and CFX come later.

The engine renders two playing decks at about 1% of one CPU core, and a
test guarantees the audio thread never allocates memory.

## Keyboard

The keyboard splits down the middle: the left hand plays deck A, the right
hand deck B, mirrored. Keys follow their position, so the layout keeps its
shape on AZERTY, QWERTZ and Dvorak.

| Deck A | Deck B | Action |
| --- | --- | --- |
| Q | P | Cue (hold to preview) |
| W | O | Play / pause |
| E | I | Sync tempo and beats to the other deck |
| Z / X | , / . | Nudge slower / faster (hold) |
| G | H | Headphone cue |
| 1 2 3 4 | 7 8 9 0 | Hot cues 1 to 4 (hold to preview a paused deck, Shift clears) |
| R | U | Loop on / off (snaps to the beat) |
| D / F | J / K | Halve / double the loop |
| C / V | N / M | Beat jump back / forward by the loop size |
| Shift ← | Shift → | Load the selected track |

| Key | Action |
| --- | --- |
| [ / ] | Crossfader left / right (Shift snaps to the end) |
| − / = | Zoom waveforms out / in (or ⌘ + scroll on a waveform) |
| Ctrl/⌘ F | Search the library |
| ↑ / ↓, Page Up / Down, Home / End, Enter | Pick a track, load it |
| F6 / Shift F6 | Move focus between the library, decks, mixer and waveforms |
| Esc | Clear the search, or hand the keys back to the decks |
| Shift F10 | Open the right-click menu for the focused control |

Knobs and faders: drag (Shift for fine), scroll, or arrow keys (Home / End for
the ends). They snap gently at their default; Shift ignores that. Double-click
or right-click to reset. Click an EQ's label to kill that band. Hover any
control for its value and shortcut. Drag the scrolling waveforms to scratch (you hear it, like a record under
your hand; a playing deck picks back up when you let go), click or drag the
overview to jump, and drag the
line above the library to resize it.

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
cargo run --release -p dj-cli -- midi                      # print what a controller sends
```

## Roadmap

1. **Phase 0/1 · Playable** (now): two decks, mixer, waveforms, basic library.
   Gate: you can mix two tracks by ear for an hour.
2. **Phase 2 · DJ-ready:** BPM, beatgrid and key analysis; sync, keylock,
   quantize; saved cues; effects; recording; MIDI learn and
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
