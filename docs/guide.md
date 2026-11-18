# Feature guide

Everything Interlude does, in detail. For a short overview, see the
[README](../README.md).

- **Audio engine (Rust):** two decks with varispeed playback, CDJ-style cue
  (set, hold to preview, play from preview), nudge, ±8/16/50% pitch.
- **Tempo:** BPM and beatgrid detected on load (about 0.2 s for a 6-minute
  track), shown on each deck and as beat lines on the waveform (a stronger
  line every 4 beats). SYNC matches tempo and beat phase to the other deck,
  picking half or double time when that's closer (e.g. 87 vs 174 BPM).
  Detection range is 80-160 BPM; constant tempo only for now. After a
  track loads, the Beat This! beat tracker (Foscarin et al., ISMIR 2024,
  MIT licence, built in) listens to the whole track in the background:
  where it agrees with the grid on the beats, its downbeats set bar 1, and
  where it's sure of a steady tempo the grid missed (live drums, mostly),
  its grid is used. A grid you've fixed by hand is never changed.
- **Hot cues, loops, beat jump:** 8 hot cues per deck (4 on screen, all 8
  on the FLX4 pads): set, jump, hold on a paused deck to preview. Beat loops
  snap to the beatgrid, halve and double, and wrap without clicks. Beat jump
  moves by the loop size and carries an active loop with it (Shift: 4
  bars). Hot cues, the
  cue point and the loop are saved with the library as you set them, and
  come back when the track is loaded again.
- **Slip** (the Slip toggle under Key lock, A / ;, or SHIFT + PLAY on the
  FLX4): while a scratch, loop, held hot cue or pause interrupts a playing
  deck, the track keeps time underneath, shown as a fainter second play
  head on the waveform. When it ends, playback picks up where the track
  would have been, so a loop or scratch never knocks the mix out of time.
  With slip on, a hot cue pressed mid-play rolls while held. Cue, a seek
  or turning slip off ends a slip where it is.
- **Key shift and key sync:** each deck shows the key it's playing in, in
  Camelot, next to the BPM. Click it to move the key a semitone up or down
  (up to an octave either way), go back to the track's key, or match the
  other deck's key. Key sync picks the smallest shift that puts the deck on
  the other deck's Camelot code (its key, or the relative major or minor),
  so the two mix in key; it allows for the tempo, so it works with key lock
  on or off. The tempo doesn't change. While a key is shifted, the deck
  shows how far after the Camelot code ("12A +2"); loading a track puts it
  back. On the FLX4, KEY SHIFT pad mode (SHIFT + SAMPLER) does the same;
  the commands have no keys until you give them some in Settings ›
  Keyboard.
- **Quantize** (on by default; the Quantize button in the mixer, or B):
  hot cues, the cue point, loop in and out snap to the nearest beat, and a
  hot cue or reloop pressed mid-play lands at the same point in the beat, so
  the mix stays in time. Off, everything happens exactly at the play head.
- **Mixer:** trim, 3-band isolator EQ with full kills, channel faders,
  constant-power crossfader, master gain, headphone cue with cue/master blend
  (on interfaces with 4+ outputs, headphones go to channels 3-4). A master
  limiter keeps the output (and recordings) under -0.3 dBFS without the
  distortion of clipping; LIM lights by the master meter while it's working.
- **Auto gain** (on by default; Settings > Library): each track's loudness
  is measured when it's analyzed (EBU R128, in LUFS) and the deck plays it
  at a common -12 LUFS, so trim starts from matched levels and works on top.
  Loud masters are turned down in full; quiet tracks are turned up only as
  far as their peaks allow, so auto gain never makes a track clip.
- **Effects:** a filter knob per channel (left low-pass, right high-pass,
  centre off), sixteen pad FX on the controller's PAD FX pads (see the
  DDJ-FLX4 below), and a beat FX unit per deck: echo, reverb, flanger and phaser,
  timed in beats (1/8 to 8) from the deck's tempo, with level and on. Echo
  and reverb tails ring out after you switch them off.
- **Sampler:** eight one-shot slots that play straight to the master
  (past the crossfader), with one level knob. The Sampler button above the
  library (or S) opens a row of slots at the top of the library. It starts
  with eight built-in sounds (air horn, siren, kick, clap, snare, rewind,
  riser, laser). Click a slot to play it from the top, ⇧-click to stop.
  Click an empty slot to choose a sound file, or drag a short track onto
  any slot (up to 60 seconds). Right-click a slot to swap, clear or put
  its built-in sound back. Slots are kept between sessions.
- **Stems:** each deck's Stems tab has four buttons, Vocals, Melody, Bass
  and Drums. Click mutes a stem, ⇧-click plays it alone (again: all back
  on). Stems fade in and out over a few milliseconds, so there are no
  clicks, and the waveforms show only what you hear. With every stem on,
  you hear the original file exactly: melody is the original minus the
  other three. Tracks are split on your computer by HTDemucs (Meta, MIT
  licence; Rouard et al., ICASSP 2023), a one-time 166 MB download from
  Settings › Stems, run on the CPU through ONNX Runtime. On an M5 MacBook
  Air a 4½-minute track splits in about 50 seconds. Splitting starts at the
  play head when a track loads and runs ahead of it, so the part you're
  about to play is ready first; anything not split yet plays as normal.
  Finished stems are kept in a cache (5 GB by default, oldest out first), so
  a track you've played before has them at once. Settings › Stems turns
  splitting off, sets the cache size and clears it. Stems have no keys
  until you give them some in Settings › Keyboard.
- **Recording:** the Rec button in the mixer records the master output to a
  24-bit WAV in `Music/Interlude recordings`. The file is written off the
  audio thread and its header is refreshed every few seconds, so a crash
  still leaves a playable file.
- **Formats:** MP3, AAC/M4A, FLAC, WAV, AIFF, OGG/Vorbis, ALAC via Symphonia.
- **Waveforms:** smooth low, mid and high bands in tones of each deck's
  colour, with beat lines, hot cues and loops: a scrolling view per deck
  plus a full-track overview you can click to jump.
- **Phrases:** a thin strip under each overview marks the track's sections
  (intro, build, drop, breakdown, verse, outro), and the deck shows the one
  playing and how many bars are left before the music changes ("Drop · 12
  bars left"). They're found from the waveform's bass, mids and highs on
  the beatgrid, in phrases of 4 to 32 bars, so fixing the grid moves them
  too. A guide, not a rule: it reads the energy, not the arrangement.
- **Library:** add music folders, instant search across artist, title and
  folder, load with double-click, Enter, or Shift+←/→. Columns for title,
  artist, BPM, key, length and folder; click a heading to sort (again to
  reverse). Title, artist, album and genre come from the file's tags (or
  an "Artist - Title" file name). BPM, key and length are found in the
  background, one track at a time, and saved. The library lives in one
  SQLite file (`library.db` in the app's data folder, backed up daily to
  `backups/`); your music files are never changed. Rescans only re-read
  new or changed files, and a file that has gone stays listed, greyed out,
  with its cues kept. If the library file is ever damaged, it's set aside
  and the newest good backup restored, and the app says so.
- **Playlists and History:** make playlists in the sidebar (+ New playlist,
  or right-click a track and Add to new playlist), add tracks by dragging
  them onto a playlist or from the right-click menu, drag rows to reorder,
  and Backspace to remove. Double-click a playlist to rename it. Every
  change can be undone. History lists what you played, one entry per
  session (a gap of 4 hours starts a new one); a track counts once it has
  been on air for 30 seconds with its fader up and the crossfader open.
- **Fixing a beatgrid:** right-click a deck's BPM to halve or double it,
  put the downbeat at the play head, or move the grid 10 ms earlier or
  later; double-click the BPM to type an exact one. A grid fixed by hand is
  saved and kept when the track is analyzed again, until you pick Reset to
  detected grid. Every change can be undone.
- **Import from Rekordbox or Serato:** File › Import from Rekordbox or
  Serato… (or Settings › Library). For Rekordbox it reads a rekordbox.xml
  export (File › Export Collection in xml format, Rekordbox 5, 6 or 7) and
  brings over hot cues, memory cues, loops, beatgrids and playlists. For
  Serato DJ it finds the `_Serato_` folder (in Music, or at the top of a
  drive) and brings over crates as playlists, plus the hot cues, saved
  loops and beatgrids Serato keeps in MP3, AIFF, WAV, FLAC and M4A files.
  Both fill in empty tags. Cues or grids
  you've already set in Interlude are never replaced, and imported grids are
  kept when a track is analyzed again. Music files aren't touched.
- **Safety:** loading onto a playing deck is blocked.
- **Controller: Pioneer DDJ-FLX4.** Plug it in (before or after starting the
  app) and it connects by itself; audio goes through its sound card, with
  headphones on its headphone jack. To keep the controller for control but
  hear the master from the laptop's speakers (or any other sound card), pick
  that device in Settings > Audio; the choice is remembered. Mapped: play, cue, sync (SHIFT + SYNC
  changes pitch range), pitch fader (picks up the current rate after SYNC
  rather than jumping), jog wheels (top: audible vinyl-style scratching,
  forwards and backwards; outer ring: nudge while playing, audible scrub
  while paused; SHIFT + jog: fast search), trim, EQ, channel
  faders, crossfader, headphone cue, browse knob and load buttons, with
  play/cue/headphone LEDs. Pads in hot cue (SHIFT + pad clears), beat loop
  and beat jump modes (SHIFT + a beat jump pad jumps 16 times as far: 4 to
  32 bars), SHIFT + PLAY for slip; loop in, out, reloop/exit, 4-beat loop (SHIFT + IN),
  CUE/LOOP CALL halves and doubles the loop (with SHIFT: beat jump), all
  with LEDs. Sampler pad mode plays sampler slots 1 to 8 from either deck's
  pads (lit when loaded); SHIFT + pad stops a slot, or loads the selected
  library track into an empty one. PAD FX1 and PAD FX2 are pad FX: hold
  a pad and its effect plays, let go and it stops (lit while held). PAD
  FX1: echo, reverb, trans, roll 1/4, high-pass sweep, bit crush, brake,
  spin back. PAD FX2: roll 1, roll 1/2, roll 1/8, roll 1/16, dub echo,
  trans 1/8, low-pass sweep, flanger. Rolls and trans land on the
  beatgrid; the track keeps playing underneath, so letting go comes back
  in where it would have been; echo and reverb tails ring out. KEYBOARD
  (SHIFT + HOT CUE) is stems, as in Mixxx's FLX4 mapping: pads 1 to 4
  mute and unmute vocals, melody, bass and drums (lit while playing), pads
  5 to 8 play one alone (lit while soloed). KEY SHIFT (SHIFT + SAMPLER)
  sets the key: top pads to the track's key, +1, +2 and +3 semitones,
  bottom pads to key sync, -1, -2 and -3, so each column is a distance from
  the original; with SHIFT, pads 7 and 8 step down and up a semitone at a
  time, as far as an octave. The pad for the current shift lights. The first time a track's stems
  are ready, a one-time tip says where they are. CFX knobs drive the channel
  filters. The beat FX section works as in rekordbox: the channel select
  lever picks the deck (MASTER runs the effect on both), BEAT FX SELECT
  changes the effect (SHIFT goes back), BEAT ◀ ▶ the beat length,
  LEVEL/DEPTH the level, and ON/OFF switches it, lit while on (SHIFT +
  ON/OFF turns every effect off). Moving the lever takes the effect with it
  to the new deck.
- **Other controllers (early): Mixxx mappings, built in.** Interlude ships
  every controller mapping from Mixxx's 2.6 branch, plus openDJ's
  untested Mixxx-format mappings for the Pioneer DDJ-FLX6, DDJ-FLX10,
  DDJ-800, DDJ-SX2, DDJ-RX, XDJ-RX3, XDJ-AZ and OPUS-QUAD (in
  `crates/controller/mappings`, GPL-2.0-or-later), so a controller Mixxx
  supports connects when it's plugged in, alongside any others, with no
  Mixxx install needed. Mapping files in the app's own `controllers`
  folder (in its data folder), folders listed in `INTERLUDE_MAPPINGS` and
  Mixxx's user folder come first, so a mapping you've changed wins.
  Direct bindings and LEDs work for about 64% of the controls across the
  153 MIDI mappings (decks 3 and 4, and Mixxx-only features, are left
  out). The mappings' JavaScript runs too, in an embedded engine with
  Mixxx's script API (controls, connections, timers, jog scratching, MIDI
  out); all 130 scripted mappings load, and each script call has a time
  and memory limit so a broken mapping can't hang the app. Mixxx's own
  FLX4 mapping drives the decks the same way the built-in one does. Not
  yet tested on hardware beyond the FLX4. `dj mappings` lists what was
  found and how much of each works.
- **USB HID controllers: Mixxx HID mappings.** Controllers that speak
  HID rather than MIDI (Native Instruments' Traktor Kontrol S2, S3, S4,
  F1, Z1 and MX2, Pioneer CDJs in HID mode, EKS Otus) connect through
  Mixxx's `*.hid.xml` mappings, whose scripts do all the work: reports
  from the device go to the script and the reports it sends light the
  controller up. All 16 scripted HID mappings load; none has been tried on
  real hardware yet. Mappings that don't name their USB ids (the older
  Hercules consoles) aren't connected automatically, and game controllers
  are left alone. On Linux, opening a HID device needs a udev rule giving
  you access to it; Mixxx's packages install one.
- **Controller not working? Set it up step by step.** Help › Controller
  Not Working… (or Settings › Controllers) asks which controller and model
  it is, then walks through about 37 controls on a picture of a two-deck
  controller: press or move each one as it lights up, or skip it. The
  controller is paused meanwhile so pressing PLAY doesn't start a deck. The
  result is saved like a MIDI learn mapping, and Share on GitHub opens a
  prefilled issue in the browser (nothing is sent until it's submitted) so
  the mapping can ship with the app.
- **Any other MIDI controller: MIDI learn.** In Settings → Controllers,
  pick the controller, pick an action (play, cue, faders, EQ, hot cues,
  loops, effects, browsing, samples) and press Learn, then move the
  control. It tells buttons, knobs, 14-bit faders, jog encoders and pitch
  bend apart on its own and moves straight on to the next action. The
  result is saved as a Mixxx mapping in the app's `controllers` folder and
  used for that controller ahead of any other, the built-in FLX4 one
  included.

The engine renders two playing decks at about 1% of one CPU core, and a
test guarantees the audio thread never allocates memory.

