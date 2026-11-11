# Controller mappings from Mixxx

These are the controller mappings from [Mixxx](https://mixxx.org) 2.5.6
(`res/controllers` at tag `2.5.6`, commit
3ebac449e7e5fe2a0186596657696e87ce8b0e56), unchanged: the `*.midi.xml` and
`*.hid.xml` mapping files and the JavaScript they load. Mixxx's screen
mappings (QML) and API type definitions are left out.

oss-dj ships them so that every controller Mixxx supports works without
Mixxx installed. They're licensed under the GNU General Public License,
version 2 or later (see [LICENSE](LICENSE)); individual files name their
authors.

To update, copy `res/controllers/*.xml` and `res/controllers/*.js` from a
newer Mixxx release over these, update the version above, and run
`cargo test -p dj-controller` (which loads every mapping) plus
`cargo test -p dj-controller -- --ignored --nocapture` for the full report.
