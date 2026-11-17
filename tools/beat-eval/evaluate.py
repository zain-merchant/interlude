"""Scores beatgrids against ground truth.

    python evaluate.py DATA_DIR [DATA_DIR...] [--algo interlude|essentia|librosa]
                       [--bin PATH] [--details]

Every DATA_DIR holds WAV files with a JSON file of the same name (from
synth.py or groove.py). Interlude's grids come from the engine's `beats`
example, built in release mode.

Metrics, per set and per style:
  exact   tempo within 0.05 BPM of the label (tracks with a steady tempo)
  acc1    tempo within 4% of the label: the right tempo octave
  acc2    tempo within 4% of the label, x2, x1/2, x3 or x1/3
  F       beat F-measure of the grid against every true beat (70 ms window)
  onbeat  grid lands on the beats rather than between them (when acc2)
  bar     the grid's beat 0 lands on a bar's first beat (when F >= 0.8)
  ms      median distance from a true beat to the grid
"""

import argparse
import collections
import glob
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MIN_BPM, MAX_BPM = 70.0, 180.0


def run_interlude(wavs, binary):
    out = subprocess.run([binary, "-"], input="\n".join(wavs), capture_output=True,
                         text=True, check=True).stdout
    res = {}
    for line in out.splitlines():
        parts = line.split("\t")
        path = parts[0]
        if len(parts) >= 3 and parts[1] and not parts[1].startswith("error"):
            # The grid's beat 0 starts a bar.
            res[path] = dict(bpm=float(parts[1]), first_beat=float(parts[2]),
                             downbeat=float(parts[2]))
        else:
            res[path] = None
    return res


def run_essentia(wav):
    import essentia.standard as es
    audio = es.MonoLoader(filename=wav, sampleRate=44100)()
    bpm, beats, _, _, _ = es.RhythmExtractor2013(method="multifeature")(audio)
    return dict(bpm=float(bpm), beats=[float(b) for b in beats])


def run_librosa(wav):
    import librosa
    y, sr = librosa.load(wav, sr=22050)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    return dict(bpm=float(np.atleast_1d(tempo)[0]), beats=[float(b) for b in beats])


def fold(bpm):
    while bpm < MIN_BPM:
        bpm *= 2
    while bpm >= MAX_BPM:
        bpm /= 2
    return bpm


def nearest(ref, est):
    """Signed distance from each ref time to the nearest est time."""
    est = np.asarray(est)
    i = np.clip(np.searchsorted(est, ref), 1, len(est) - 1)
    left, right = est[i - 1], est[i]
    return np.where(ref - left < right - ref, ref - left, ref - right)


def f_measure(ref, est, window=0.07):
    import mir_eval
    ref = mir_eval.beat.trim_beats(np.asarray(ref))
    est = mir_eval.beat.trim_beats(np.asarray(est))
    if len(est) == 0 or len(ref) == 0:
        return 0.0
    return mir_eval.beat.f_measure(ref, est, window)


def score(gt, pred, label_in_range):
    ref = np.asarray(gt["beats"])
    duration = ref[-1] + 60 / gt["bpm"]
    label = fold(gt["label_bpm"]) if label_in_range else gt["label_bpm"]
    steady = gt.get("drift", 0) == 0
    # Half or double is as common a label as the tempo itself for these.
    ambiguous = gt.get("ambiguous", False) or gt["style"] == "lofi"
    s = dict(style=gt["style"], label=label, ambiguous=ambiguous)
    if pred is None:
        phase = gt.get("phase", True)
        return dict(s, found=0, exact=0, acc1=0, acc2=0, F=0.0 if phase else None,
                    onbeat=0 if phase else None, bar=0 if phase else None, ms=None, bpm=None)
    bpm = pred["bpm"]
    bar_err = None
    if "beats" in pred:
        est = np.asarray(pred["beats"])
    else:
        beat = 60.0 / bpm
        est = pred["first_beat"] % beat + beat * np.arange(int(duration / beat) + 2)
        if pred.get("downbeat") is not None:
            # Median distance from the grid's bar lines to true bar lines.
            bars = pred["downbeat"] % (4 * beat) + 4 * beat * np.arange(int(duration / beat / 4) + 1)
            bars = bars[bars < ref[-1]]
            if len(bars):
                bar_err = float(np.median(np.abs(nearest(bars, np.asarray(gt["downbeats"])))))
    ratio = bpm / label
    octaves = (1, 2, 0.5) if s["ambiguous"] else (1,)
    acc1 = any(abs(ratio * k - 1) <= 0.04 for k in octaves)
    acc2 = any(abs(ratio * k - 1) <= 0.04 for k in (1, 2, 0.5, 3, 1 / 3))
    exact = steady and any(abs(bpm * k - label) <= 0.05 for k in octaves)
    if not gt.get("phase", True):
        return dict(s, found=1, exact=int(exact), acc1=int(acc1), acc2=int(acc2), F=None,
                    onbeat=None, bar=None, ms=None, bpm=bpm, steady=steady)
    F = f_measure(ref, est)
    d = np.abs(nearest(ref, est)) if len(est) > 1 else np.array([1.0])
    ms = float(np.median(d) * 1000)
    # On the beat: most true beats have a grid line within 70 ms, whatever
    # the octave (a double-time grid still lands on every beat).
    if acc2 and bpm >= label * 0.96:
        onbeat = float(np.mean(d < 0.07)) >= 0.8
    elif acc2:
        # Half-time grid: its lines must be on true beats.
        dd = np.abs(nearest(est[(est > ref[0]) & (est < ref[-1])], ref))
        onbeat = len(dd) > 0 and float(np.mean(dd < 0.07)) >= 0.8
    else:
        onbeat = False
    bar_ok = None if bar_err is None else (F >= 0.8 and bar_err < 0.07)
    return dict(s, found=1, exact=int(exact), acc1=int(acc1), acc2=int(acc2), F=F,
                onbeat=int(onbeat), bar=None if bar_ok is None else int(bar_ok),
                ms=ms, bpm=bpm, steady=steady)


def summarize(rows, title):
    n = len(rows)
    steady = [r for r in rows if r.get("steady", True)]
    bars = [r["bar"] for r in rows if r.get("bar") is not None]

    def pct(xs):
        return f"{100 * np.mean(xs):5.1f}" if xs else "    -"

    line = (f"{title:<34} {n:4d}  exact {pct([r['exact'] for r in steady])}"
            f"  acc1 {pct([r['acc1'] for r in rows])}  acc2 {pct([r['acc2'] for r in rows])}"
            f"  F {pct([r['F'] for r in rows if r['F'] is not None])}"
            f"  onbeat {pct([r['onbeat'] for r in rows if r['onbeat'] is not None])}  bar {pct(bars)}")
    print(line)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--algo", default="interlude")
    ap.add_argument("--bin", default=os.path.join(REPO, "target/release/examples/beats"))
    ap.add_argument("--details", action="store_true")
    ap.add_argument("--by-style", action="store_true")
    ap.add_argument("--cache", default=os.path.join(HERE, ".cache"))
    args = ap.parse_args()
    all_rows = []
    for d in args.dirs:
        wavs = sorted(glob.glob(os.path.join(d, "*.wav")))
        if args.algo == "interlude":
            preds = run_interlude(wavs, args.bin)
        else:
            os.makedirs(args.cache, exist_ok=True)
            cache = os.path.join(args.cache, f"{args.algo}-{os.path.basename(os.path.normpath(d))}.json")
            preds = json.load(open(cache)) if os.path.exists(cache) else {}
            fn = run_essentia if args.algo == "essentia" else run_librosa
            for w in wavs:
                if w not in preds:
                    preds[w] = fn(w)
                    json.dump(preds, open(cache, "w"))
        groove = "groove" in os.path.basename(os.path.normpath(d))
        rows = []
        for w in wavs:
            gt = json.load(open(w[:-4] + ".json"))
            r = score(gt, preds.get(w), label_in_range=groove)
            r["file"] = os.path.basename(w)
            rows.append(r)
        summarize(rows, os.path.basename(os.path.normpath(d)))
        if args.by_style:
            by = collections.defaultdict(list)
            for r in rows:
                by[r["style"]].append(r)
            for k in sorted(by):
                summarize(by[k], "  " + k)
        if args.details:
            for r in rows:
                if not (r["acc1"] and (r["F"] is None or r["F"] > 0.9)):
                    bpm = f"{r['bpm']:.2f}" if r["bpm"] else "none"
                    F = "-" if r["F"] is None else f"{r['F']:.2f}"
                    print(f"    {r['file']:<60} label {r['label']:7.2f} got {bpm:>7}  F {F}"
                          f"  ms {r['ms'] if r['ms'] is None else round(r['ms'])}")
        all_rows += rows
    if len(args.dirs) > 1:
        summarize(all_rows, "all")


if __name__ == "__main__":
    sys.exit(main())
