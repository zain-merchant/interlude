<p align="center">
  <img src="site/img/icon.svg" width="80" height="80" alt="Interlude icon">
</p>

<h1 align="center">Interlude</h1>

<p align="center">A free, open-source DJ app for the Mac.</p>

<p align="center">
  <a href="https://github.com/zain-merchant/interlude/releases/latest/download/Interlude.dmg"><strong>Download</strong></a> ·
  <a href="https://interludedj.com">Website</a> ·
  <a href="docs/guide.md">Feature guide</a> ·
  <a href="https://github.com/zain-merchant/interlude/releases">Changelog</a> ·
  <a href="https://github.com/zain-merchant/interlude/issues">Issues</a>
</p>

![Interlude with two tracks playing in sync: waveforms on top, two decks around the mixer, the library below](docs/screenshot.jpg)

Interlude is a two-deck DJ app with no account and no subscription.

## What you get

- **Beautiful to use.** A calm, clear interface that keeps your set in
  front of you, with every control where your hands expect it.
- **Fast.** Instant library search, and an audio engine written in Rust
  that stays light on your Mac.
- **Everything you'd expect from pro DJ software.** Sync, stems, effects,
  Rekordbox and Serato import, and full controller support, for free.
- **Decks.** BPM, key and beatgrid found on load, sync, hot cues, loops,
  slip and key lock.
- **Mixer and effects.** 3-band EQ with kills, filter, beat-timed effects,
  pad FX and a limiter so the output never clips.
- **Stems.** Mute or solo vocals, melody, bass and drums, separated on your
  Mac.
- **Library.** Instant search, playlists, set history, and import from
  Rekordbox and Serato with your cues, loops and grids.
- **Controllers.** The Pioneer DDJ-FLX4 is mapped in full, 150+ others work
  through Mixxx mappings, and MIDI learn covers the rest.
- **And more.** Set recording, an 8-slot sampler and remappable shortcuts.

## Install

[Download Interlude](https://github.com/zain-merchant/interlude/releases/latest/download/Interlude.dmg)
for Macs with Apple silicon (macOS 11 or later). Open the disk image and drag
Interlude into Applications. After that it keeps itself up to date.

Interlude is in beta. If something goes wrong, use Help › Report a Problem
and [open an issue](https://github.com/zain-merchant/interlude/issues) with
the report it saves.

## Documentation

- [Feature guide](docs/guide.md)
- [Keyboard and mouse](docs/keyboard.md)
- [Logs, problem reports and updates](docs/help.md)
- [What's still missing](docs/parity.md)
- [Controller accuracy](docs/controller-accuracy.md)
- [Development: architecture, building and checks](docs/development.md)
- [Releasing the app and the website](docs/releasing.md)

## Contributing

Bug reports and pull requests are welcome. Keep changes focused. To build
from source and run the checks, see [docs/development.md](docs/development.md).

## License

[GPL-3.0-or-later](LICENSE). This lets Interlude use controller mappings and
algorithms from Mixxx, and GPL libraries such as Rubber Band and libKeyFinder.
