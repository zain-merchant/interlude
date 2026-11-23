# Feature parity checklist

Where Interlude stands against rekordbox, Serato DJ Pro, djay Pro and Traktor,
from the point of view of someone playing on a Pioneer DDJ-FLX4. Checked
against the code on 18 November 2026. Tick items off here as they land.

## Already there

- [x] Two decks: sync (tempo and beat phase), pitch ±8/16/50%, key lock, slip,
      quantize, audible scratching, nudge
- [x] Key shift (±12 semitones, tempo unchanged) and key sync to the other
      deck's Camelot code, from the key on each deck and the FLX4's KEY SHIFT
      pads
- [x] 8 hot cues, beat loops, loop in/out, beat jump
- [x] BPM and beatgrid analysis (with Beat This!), hand-fixed grids
- [x] Key detection (KeyNet), shown in Camelot
- [x] Mixer: trim, 3-band EQ with kills, filter, crossfader, headphone cue
      blend, auto gain, master limiter
- [x] Beat FX unit per deck (echo, reverb, flanger, phaser) and 16 pad FX
- [x] Stems: mute or solo vocals, melody, bass, drums
- [x] 8-slot sampler
- [x] Set recording (WAV)
- [x] Library: search, sortable columns, playlists, history, missing files kept
- [x] Import from rekordbox XML and Serato (cues, loops, grids, playlists/crates)
- [x] FLX4 mapped in full; Mixxx mappings; MIDI learn;
      guided controller setup

## Still missing, by impact for an FLX4 DJ

### 1. You'll feel it in a set

- [ ] **Faster stems.** Splitting runs on the CPU only (about 50 s for a
      4½-minute track). rekordbox, Serato and djay use the GPU / Neural
      Engine and feel near-instant. On a Mac that means ONNX Runtime's CoreML
      path (or a Core ML model).
- [ ] **More beat FX and Smart CFX.** Only 4 beat FX, where rekordbox gives
      the FLX4 about 14 (delay, ping pong, spiral, helix, slip roll, and so
      on). The CFX knobs only drive the filter; rekordbox lets each one be a
      different colour effect (space, dub echo, pitch, noise, crush).
- [ ] **Memory cues and more than one saved loop.** Imported rekordbox memory
      cues collapse into the main cue, and each track keeps one loop. Hot cue
      names and colours aren't kept either.
- [ ] **Stem FX and stem levels.** Stems are on or off. Rivals let you turn a
      stem down partway and send one stem to an effect (vocal echo, drum roll).

### 2. Library and prep, before the gig

- [ ] **Track colours, ratings, comments and tag editing.** None of these are
      stored, and tags are read-only. rekordbox's My Tag and Serato's colours
      are how many DJs sort a set.
- [x] **Filters** by BPM range and key, and **Fits**: only the tracks whose
      key and tempo mix with what's playing (rekordbox's Related Tracks,
      djay's Match). Columns can be shown or hidden.
- [ ] **Crates, playlist folders and smart playlists** (already on the
      roadmap).
- [ ] **A prepare list / queue** for the next few tracks.
- [ ] **Variable-tempo beatgrids.** Grids are constant tempo, so live drums
      and older records drift.
- [ ] **More libraries to import from:** Apple Music, Traktor, Engine DJ.

### 3. Nice to have

- [ ] Crossfader curve setting (a sharp cut for scratching).
- [ ] Recording to MP3, AAC or FLAC; export a set's history as a tracklist.
- [ ] Automix (djay and rekordbox have it; handy for warm-up or breaks).
- [ ] Sampler banks and a sequencer.
- [ ] Waveform options (colour styles, stacked view).

### 4. Later, big pieces

- [ ] Streaming (Beatport, SoundCloud, TIDAL, Apple Music), which needs
      licensing deals.
- [ ] USB export for CDJs, cloud library sync.
- [ ] 4 decks, DVS, HID jog displays, video, lighting, Ableton Link.
- [ ] Windows and Linux builds.
