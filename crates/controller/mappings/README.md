# Controller mappings from Mixxx

These are the controller mappings from [Mixxx](https://mixxx.org)'s 2.6
branch (`res/controllers` at commit
f0708563f0002dab0bd45481eb154c583e21d5fa, 2026-11-18), unchanged: the
`*.midi.xml` and `*.hid.xml` mapping files and the JavaScript they load.
Mixxx's screen mappings (QML), its dummy screen device and API type
definitions are left out.

## From openDJ

These come from [openDJ](https://github.com/openwave-studio/opendj)'s
`res/controllers` (GPL-2.0-or-later, Mixxx's format), unchanged except as
noted. openDJ wrote the Pioneer ones from Pioneer's and AlphaTheta's MIDI
message lists; as far as we know none has been tried on the hardware yet.

- `Pioneer-DDJ-FLX6.*`, `Pioneer-DDJ-FLX10.*`, `Pioneer-XDJ-RX3.*`,
  `Pioneer-XDJ-AZ.*`, `Pioneer-OPUS-QUAD.*`: openDJ's own.
- `Pioneer-DDJ-800.*`: openDJ's own, built on openDJ's version of the
  DDJ-FLX4 script, which is here as `Pioneer-DDJ-800-base-script.js`
  (renamed, and the mapping file changed to load it, so Mixxx's own
  DDJ-FLX4 script stays as it is).
- `Pioneer DDJ-SX2.midi.xml`, `Pioneer DDJ-RX.midi.xml`,
  `Pioneer-DDJ-RX-scripts.js`: Mixxx's DDJ-SX mapping adapted for the SX2
  and RX.
- `Reloop-Beatmix-2-4-MK2.*`: a Mixxx-format mapping by Sébastien Blaisot.

Their scripts call `midi.routeNote(channel, from, to)`, an openDJ addition
that makes a note arrive as another one (pads following the page shown);
`src/script.rs` supports it.

oss-dj ships them so that every controller Mixxx supports works without
Mixxx installed. They're licensed under the GNU General Public License,
version 2 or later (see [LICENSE](LICENSE)); individual files name their
authors.

To update, copy `res/controllers/*.xml` and `res/controllers/*.js` from a
newer Mixxx release over these (leaving out `Dummy Device Screen.hid.xml`), update the version above, and run
`cargo test -p dj-controller` (which loads every mapping) plus
`cargo test -p dj-controller -- --ignored --nocapture` for the full report.
