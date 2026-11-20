# Beat evaluation

Scores the engine's BPM, beatgrid and bar detection against tracks whose
beats are known, so analysis changes can be measured instead of guessed.

## Data

Two sets, neither checked in (they are a few GB of WAV):

- **Synthetic** (`synth.py`): arranged tracks in 17 styles (house, techno,
  trance, hardstyle, drum & bass, dubstep, trap, boom bap, lo-fi, reggaeton,
  afro house, amapiano, UK garage, pop, live disco and funk), with intros,
  breakdowns, swing, sloppy timing and drifting tempos. Ground truth is
  exact: every beat and bar line. The label is the tempo a DJ would call the
  track (174 for drum & bass, 140 for dubstep, with half or double accepted
  where both are common: trap, dubstep, lo-fi).
- **Groove MIDI** (`groove.py`): 120 recordings of real drummers from
  Magenta's [Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove)
  (CC BY 4.0), in 14 styles. The click tempo is the ground truth. The MIDI
  files don't start on a click, so only the tempo is scored for this set.

```sh
cd tools/beat-eval
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python synth.py data/synth-dev --count 150 --seed 1
.venv/bin/python synth.py data/synth-holdout --count 75 --seed 2
.venv/bin/python groove.py data/groove-set --count 120
```

Tune on `synth-dev`; check `synth-holdout` before believing a change.

## Running

```sh
cargo build --release -p dj-engine --no-default-features --example beats
.venv/bin/python evaluate.py data/synth-dev data/synth-holdout data/groove-set --by-style
```

`--details` lists every track that's wrong. `--algo essentia` or
`--algo librosa` scores those libraries instead (install them first).

## Metrics

| Metric | Meaning |
| --- | --- |
| exact | tempo within 0.05 BPM of the label (steady-tempo tracks) |
| acc1 | tempo within 4% of the label: the right tempo octave |
| acc2 | within 4% of the label, or of x2, x1/2, x3, x1/3 of it |
| F | beat F-measure of the grid against every true beat, 70 ms window |
| onbeat | the grid lines sit on the beats, not between them |
| bar | the grid's beat 0 is a bar's first beat |

## Results

November 2026, 345 tracks (225 synthetic, 120 Groove MIDI).

| | exact | acc1 | acc2 | F | onbeat | bar |
| --- | --- | --- | --- | --- | --- | --- |
| Interlude 0.1.2 | 65.1 | 74.2 | 76.5 | 72.7 | 60.0 | 28.4 |
| Interlude, this analyzer | **87.1** | **97.1** | **98.3** | **81.6** | **77.3** | **71.6** |

On the held-out tracks only (75 synthetic + 120 Groove MIDI), against two
open-source analyzers. They report a tempo from their beat times rather
than a fitted one, so "exact" is not a fair comparison for them; they don't
find bars.

| | exact | acc1 | acc2 | F | onbeat |
| --- | --- | --- | --- | --- | --- |
| Interlude 0.1.2 | 61.3 | 74.9 | 79.0 | 71.2 | 60.0 |
| Essentia RhythmExtractor2013 | 28.5 | 87.2 | 97.9 | 44.6 | 38.7 |
| librosa beat_track | 1.6 | 76.4 | 87.7 | 31.5 | 22.7 |
| Interlude, this analyzer | **78.0** | **94.9** | 96.9 | **80.8** | **77.3** |

Known gaps:

- Live tracks whose tempo drifts (disco, funk) get the right average tempo,
  but a constant grid can't follow them: that needs a variable grid.
- Synthetic dubstep and trap, where the bass and most kicks land off the
  beat, get a grid shifted off the beat. Every other synthetic style is on
  the beat.
- Groove MIDI's swung and Latin grooves still sometimes read at 3/2 or 4/3
  of the tempo.
