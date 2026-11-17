"""Fetches a subset of the Groove MIDI Dataset (Magenta, CC BY 4.0): real
drummers on an electronic kit, recorded to a click, with audio and MIDI.

The click tempo is the ground truth for the tempo. The beat times are only
nominal: the MIDI files don't start on a click, so the drummers' beats sit
at an arbitrary offset from k * 60 / bpm, and the evaluation scores only
the tempo of these files (`"phase": false`). Writes WAV + JSON pairs.

    python groove.py OUT_DIR [--count 120]
"""

import argparse
import collections
import csv
import io
import json
import os
import random
import shutil

import mido
from remotezip import RemoteZip

URL = "https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0.zip"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--count", type=int, default=120)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    z = RemoteZip(URL)
    info = csv.DictReader(io.TextIOWrapper(z.open("groove/info.csv")))
    rows = [r for r in info
            if r["beat_type"] == "beat" and r["time_signature"] == "4-4"
            and 25 <= float(r["duration"]) <= 150 and r["audio_filename"]]
    random.seed(1)
    random.shuffle(rows)
    by_style = collections.defaultdict(list)
    for r in rows:
        by_style[r["style"].split("/")[0]].append(r)
    picked = []
    while len(picked) < args.count and any(by_style.values()):
        for k in list(by_style):
            if by_style[k] and len(picked) < args.count:
                picked.append(by_style[k].pop())
    for r in picked:
        name = r["midi_filename"].replace("/", "_")[:-4]
        wav = os.path.join(args.out, name + ".wav")
        if not os.path.exists(wav):
            with z.open("groove/" + r["audio_filename"]) as src, open(wav, "wb") as dst:
                shutil.copyfileobj(src, dst)
        mid = mido.MidiFile(file=z.open("groove/" + r["midi_filename"]))
        tempos = {m.tempo for t in mid.tracks for m in t if m.type == "set_tempo"}
        assert len(tempos) == 1, tempos
        bpm = mido.tempo2bpm(tempos.pop())
        beat = 60.0 / bpm
        n = int(mid.length / beat) + 1
        beats = [k * beat for k in range(n)]
        gt = dict(style=r["style"].split("/")[0], bpm=bpm, label_bpm=bpm,
                  ambiguous=False, drift=0.0, phase=False, beats=beats,
                  downbeats=beats[::4])
        with open(wav[:-4] + ".json", "w") as f:
            json.dump(gt, f)
        print(name, round(bpm, 2), flush=True)


if __name__ == "__main__":
    main()
