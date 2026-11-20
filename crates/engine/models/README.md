# Key detection network

The weights file was converted by openDJ (https://github.com/openwave-studio/opendj)
and is used here unchanged.

`keynet.bin` holds the weights of the neural key detector (`src/keynet.rs`):
the `openkeyscan3.pt` checkpoint of openkeyscan-analyzer
(https://github.com/rekordcloud/openkeyscan-analyzer, commit d5cac64), which
builds on MusicalKeyCNN (https://github.com/a1ex90/MusicalKeyCNN). It was
converted with `tools/keynet/export-keynet.py` (from openDJ, GPL-2.0-or-later): batch norms folded into the
convolutions, weights stored as 16-bit floats.

The network is KeyNet from F. Korzeniowski and G. Widmer, "Genre-Agnostic Key
Classification With Convolutional Neural Networks", ISMIR 2018.

The weights come under the MIT licence below, which lets them be used in
Interlude's GPL code as long as this notice stays with them.

```
MIT License

Copyright (c) 2025 Alexander Sommer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

# Beat detection networks

`beat-this-mel.onnx` (the log-mel front end) and `beat-this-small.onnx`
(the small beat and downbeat model, about 2M parameters) are the
`models/mel_spectrogram.onnx` and `models/beat_this_small.onnx` of
beat-this-rs (https://github.com/danigb/beat-this-rs, commit
1ae768e), its ONNX export of Beat This! by the Institute of
Computational Perception, JKU Linz (https://github.com/CPJKU/beat_this).
`src/beatthis.rs` runs them.

S. Foscarin, J. Schlüter and G. Widmer, "Beat This! Accurate and
Generalizable Beat Tracking", ISMIR 2024.

Both come under the MIT licence below, which lets them be used in
Interlude's GPL code as long as this notice stays with them.

```
MIT License

beat-this-rs is a Rust port of "Beat This!" by the Institute of Computational
Perception, JKU Linz, Austria (https://github.com/CPJKU/beat_this), which is
itself distributed under the MIT License. Both copyright notices are retained
below under the same MIT terms.

Copyright (c) 2025 danigb (Rust port)
Copyright (c) 2024 Institute of Computational Perception, JKU Linz, Austria ("Beat This!" original work)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
