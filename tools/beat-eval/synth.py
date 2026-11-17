"""Renders synthetic tracks with exact ground truth for the beat evaluation.

Each track is a small arrangement in one of fifteen styles (house, techno,
drum & bass, boom bap, trap, reggaeton, amapiano, live disco...), with an
intro, a drop, a breakdown and an outro. Some have a tempo that drifts like
a live band, swing, sloppy timing, long beatless intros, or no drums for
whole sections. Ground truth is every beat time and which beats start a
bar, written as JSON next to the WAV.

    python synth.py OUT_DIR [--count 150] [--seed 1]
"""

import argparse
import json
import math
import os

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

SR = 44100
TAU = 2 * math.pi

# Steps are sixteenths: 0..15 in a 4/4 bar. `label` is the tempo a DJ
# would call the track (what Rekordbox/Serato show by default); `ambiguous`
# marks styles where half or double is just as commonly used.
STYLES = {
    "house": dict(bpm=(118, 128), kick=[0, 4, 8, 12], snare=[4, 12], snd="clap",
                  hat=[2, 6, 10, 14], hat_open=True, shaker=list(range(16)),
                  bass=[2, 6, 10, 14], chords="stab"),
    "deep-house": dict(bpm=(115, 124), kick=[0, 4, 8, 12], snare=[4, 12], snd="clap",
                       hat=[2, 6, 10, 14], hat_open=True, shaker=[1, 3, 5, 7, 9, 11, 13, 15],
                       bass=[3, 6, 11, 14], chords="pad", swing=0.54),
    "techno": dict(bpm=(126, 140), kick=[0, 4, 8, 12], snare=[], hat=list(range(16)),
                   hat_open=False, oh=[2, 6, 10, 14], bass=[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
                   chords="none"),
    "trance": dict(bpm=(136, 142), kick=[0, 4, 8, 12], snare=[4, 12], snd="clap",
                   hat=[2, 6, 10, 14], hat_open=True, bass=[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
                   chords="supersaw"),
    "hardstyle": dict(bpm=(148, 156), kick=[0, 4, 8, 12], snare=[4, 12], snd="clap",
                      hat=[2, 6, 10, 14], hat_open=True, bass=[], chords="supersaw", dist=True),
    "dnb": dict(bpm=(170, 176), kick=[0, 10], snare=[4, 12], snd="snare", ghost=[7, 15],
                hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, bass=[0, 3, 6, 10],
                chords="pad"),
    "boom-bap": dict(bpm=(84, 96), kick=[0, 7, 10], snare=[4, 12], snd="snare",
                     hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, bass=[0, 7, 10],
                     chords="keys", swing=0.6, human=0.008),
    "trap": dict(bpm=(130, 150), kick=[0, 3, 11], snare=[8], snd="clap",
                 hat=list(range(16)), hat_open=False, bass=[0, 3, 11], chords="keys",
                 ambiguous=True, rolls=True),
    "dubstep": dict(bpm=(138, 142), kick=[0, 10], snare=[8], snd="snare",
                    hat=[2, 6, 10, 14], hat_open=False, bass=[0, 6, 10, 14], chords="none",
                    ambiguous=True),
    "reggaeton": dict(bpm=(88, 100), kick=[0, 4, 8, 12], snare=[3, 6, 11, 14], snd="snare",
                      hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, bass=[0, 3, 6, 8, 11, 14],
                      chords="keys"),
    "afro-house": dict(bpm=(119, 124), kick=[0, 4, 8, 12], snare=[], hat=[2, 6, 10, 14],
                       hat_open=True, perc=[3, 6, 7, 10, 13, 15], shaker=list(range(16)),
                       bass=[3, 7, 11], chords="pad", swing=0.53),
    "amapiano": dict(bpm=(108, 115), kick=[0, 8], snare=[4, 12], snd="clap",
                     hat=[], shaker=list(range(16)), logdrum=[3, 6, 10, 11, 14],
                     bass=[], chords="keys", swing=0.55),
    "garage": dict(bpm=(130, 135), kick=[0, 9], snare=[4, 12], snd="snare",
                   hat=[2, 6, 10, 14], hat_open=False, shaker=[1, 3, 5, 7, 9, 11, 13, 15],
                   bass=[0, 9, 11], chords="stab", swing=0.62),
    "disco-live": dict(bpm=(110, 126), kick=[0, 4, 8, 12], snare=[4, 12], snd="snare",
                       hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, oh=[2, 6, 10, 14],
                       bass=[0, 2, 4, 6, 8, 10, 12, 14], chords="keys", human=0.012,
                       drift=0.012),
    "funk-live": dict(bpm=(92, 112), kick=[0, 6, 10], snare=[4, 12], snd="snare",
                      ghost=[7, 9, 15], hat=list(range(16)), hat_open=False,
                      bass=[0, 3, 6, 10, 13], chords="keys", human=0.014, drift=0.02,
                      swing=0.55),
    "pop": dict(bpm=(96, 124), kick=[0, 8, 10], snare=[4, 12], snd="clap",
                hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, bass=[0, 8, 10],
                chords="pad", vocals=True),
    "lofi": dict(bpm=(72, 90), kick=[0, 9], snare=[4, 12], snd="snare",
                 hat=[0, 2, 4, 6, 8, 10, 12, 14], hat_open=False, bass=[0, 9],
                 chords="keys", swing=0.62, human=0.015, label_double_ok=True),
}


class Rng:
    def __init__(self, seed):
        self.r = np.random.default_rng(seed)

    def u(self, a, b):
        return float(self.r.uniform(a, b))

    def chance(self, p):
        return self.r.random() < p

    def pick(self, xs):
        return xs[int(self.r.integers(len(xs)))]


def env_exp(n, decay):
    return np.exp(-np.arange(n) / SR * decay)


def kick(rng, dist=False):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f0, f1 = rng.u(45, 60), rng.u(120, 220)
    f = f0 + (f1 - f0) * np.exp(-t * rng.u(25, 45))
    ph = TAU * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * rng.u(5, 10))
    click = rng.r.normal(0, 1, n) * np.exp(-t * 400) * 0.3
    x = x + click
    if dist:
        x = np.tanh(x * 4) * 0.8
    return x


def snare(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    tone = np.sin(TAU * rng.u(170, 230) * t) * np.exp(-t * 30)
    noise = hp(rng.r.normal(0, 1, n), 0.6) * np.exp(-t * rng.u(14, 22))
    return 0.5 * tone + 0.6 * noise


def clap(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = hp(rng.r.normal(0, 1, n), 0.5)
    e = np.zeros(n)
    for d in (0.0, 0.009, 0.019):
        k = int(d * SR)
        e[k:] += np.exp(-(t[: n - k]) * 120)
    e += np.exp(-t * 18) * 0.5
    return noise * e * 0.6


def hat(rng, open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    noise = hp(hp(rng.r.normal(0, 1, n), 0.9), 0.9)
    return noise * np.exp(-t * (9 if open_ else 70)) * 0.35


def shaker(rng):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    a = np.minimum(t / 0.012, 1.0)
    return hp(rng.r.normal(0, 1, n), 0.85) * a * np.exp(-t * 60) * 0.15


def perc(rng, f):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.5 * np.exp(-t * 60))
    return np.sin(TAU * np.cumsum(fr) / SR) * np.exp(-t * 18) * 0.45


def logdrum(rng, f):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.3 * np.exp(-t * 30))
    x = np.sin(TAU * np.cumsum(fr) / SR) * np.exp(-t * 6)
    return np.tanh(x * 2.5) * 0.5


def hp(x, a):
    """One-pole high-pass, a in (0, 1)."""
    return lfilter([a, -a], [1, -a], x)


def lp_fft(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def saw(freq, n, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in ([0.0] if detune == 0 else [-detune, 0, detune]):
        out += 2 * ((t * freq * (1 + d) + phase) % 1.0) - 1
    return out / (1 if detune == 0 else 3)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Timeline:
    """Maps beat positions (floats) to seconds, through a tempo curve."""

    def __init__(self, rng, bpm, n_beats, offset, drift):
        self.offset = offset
        lengths = np.full(n_beats + 8, 60.0 / bpm)
        if drift:
            # Slow random walk around the nominal tempo, like a band.
            walk = np.cumsum(rng.r.normal(0, 1, len(lengths)))
            walk = np.convolve(walk, np.ones(16) / 16, mode="same")
            walk -= walk.mean()
            walk /= max(1e-9, np.abs(walk).max())
            lengths *= 1 + drift * walk
        self.starts = offset + np.concatenate([[0.0], np.cumsum(lengths)])

    def time(self, beat):
        i = int(math.floor(beat))
        f = beat - i
        return self.starts[i] + f * (self.starts[i + 1] - self.starts[i])


def place(buf, x, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf) or i < 0:
        return
    m = min(len(x), len(buf) - i)
    buf[i:i + m] += gain * x[:m]


def render(seed, style_name=None):
    rng = Rng(seed)
    if style_name is None:
        style_name = rng.pick(sorted(STYLES))
    st = STYLES[style_name]
    bpm = rng.u(*st["bpm"])
    if rng.chance(0.6):
        bpm = round(bpm)  # most club music sits on whole tempos
    elif rng.chance(0.3):
        bpm = round(bpm * 2) / 2
    else:
        bpm = round(bpm, 2)
    # Arrangement in bars: (name, bars, drums?, kick?, bass?, chords?)
    intro_kind = rng.pick(["drums", "hats", "ambient", "drums"])
    intro = rng.pick([8, 16, 16, 32])
    sections = []
    if intro_kind == "ambient":
        sections.append(("intro", intro, dict(kick=False, hats=False, bass=False, chords=True, snare=False)))
    elif intro_kind == "hats":
        sections.append(("intro", intro, dict(kick=False, hats=True, bass=False, chords=False, snare=False)))
    else:
        sections.append(("intro", intro, dict(kick=True, hats=True, bass=False, chords=False, snare=False)))
    sections.append(("drop", rng.pick([16, 32]), dict(kick=True, hats=True, bass=True, chords=True, snare=True)))
    sections.append(("breakdown", rng.pick([8, 16]), dict(kick=False, hats=rng.chance(0.4), bass=False, chords=True, snare=False)))
    sections.append(("drop", rng.pick([16, 32]), dict(kick=True, hats=True, bass=True, chords=True, snare=True)))
    sections.append(("outro", rng.pick([8, 16]), dict(kick=True, hats=True, bass=False, chords=False, snare=False)))
    bars = sum(s[1] for s in sections)
    n_beats = bars * 4
    lead = rng.u(0.0, 1.5) if rng.chance(0.7) else 0.0
    drift = st.get("drift", 0.0)
    tl = Timeline(rng, bpm, n_beats, lead, drift)
    total = tl.time(n_beats) + 2.0
    n = int(total * SR)
    drums = np.zeros(n)
    music = np.zeros(n)

    swing = st.get("swing", 0.5)
    human = st.get("human", 0.002)
    k_s, sn_s, h_s, oh_s = kick(rng, st.get("dist", False)), (clap(rng) if st.get("snd") == "clap" else snare(rng)), hat(rng), hat(rng, True)
    sh_s = shaker(rng)
    pc_s = [perc(rng, f) for f in (rng.u(250, 350), rng.u(380, 480))]
    ld_s = [logdrum(rng, f) for f in (55, 62, 73.4, 49)]
    key = int(rng.r.integers(36, 47))
    prog = rng.pick([[0, 5, 3, 7], [0, 8, 3, 10], [0, 3, 8, 7], [0, 0, 5, 5]])

    def step_beat(bar, step):
        b = bar * 4 + step / 4
        # Swing pushes every second sixteenth late.
        if step % 2 == 1:
            b += (swing - 0.5) * 0.5
        return b

    def jitter():
        return rng.r.normal(0, human)

    bar0 = 0
    for name, nb, on in sections:
        for bar in range(bar0, bar0 + nb):
            fill = (bar - bar0) % 8 == 7
            chord_root = key + prog[(bar // 2) % len(prog)]
            for step in range(16):
                t = tl.time(step_beat(bar, step))
                vel = 1.0 if step % 4 == 0 else 0.8
                if on["kick"] and step in st["kick"]:
                    place(drums, k_s, t + jitter(), 0.9)
                if on["snare"] and step in st.get("snare", []):
                    place(drums, sn_s, t + jitter(), 0.7)
                if on["snare"] and step in st.get("ghost", []):
                    place(drums, sn_s, t + jitter(), 0.18)
                if on["hats"]:
                    if step in st.get("hat", []):
                        place(drums, oh_s if st.get("hat_open") else h_s, t + jitter(), 0.5 * vel)
                    if step in st.get("oh", []):
                        place(drums, oh_s, t + jitter(), 0.4)
                    if step in st.get("shaker", []):
                        place(drums, sh_s, t + jitter(), 0.6 * vel)
                    if step in st.get("perc", []):
                        place(drums, pc_s[step % 2], t + jitter(), 0.5)
                    if st.get("rolls") and fill and step >= 12:
                        for k in range(1, 3):
                            place(drums, h_s, tl.time(step_beat(bar, step) + k / 12), 0.35)
                if on["bass"] or (on["kick"] and name == "drop"):
                    if step in st.get("logdrum", []):
                        place(music, ld_s[(step + bar) % 4], t + jitter(), 0.7)
                if on["bass"] and step in st.get("bass", []):
                    dur = tl.time(step_beat(bar, step) + 0.22) - t
                    m = int(dur * SR)
                    f = midi_hz(chord_root - 12 + (7 if step % 8 == 6 and rng.chance(0.3) else 0))
                    x = lp_fft(saw(f, m), 400) * np.minimum(1, np.arange(m) / (0.004 * SR)) * env_exp(m, 6)
                    place(music, x, t, 0.35)
            if on["chords"] and st["chords"] != "none":
                kind = st["chords"]
                notes = [chord_root + 24 + i for i in (0, 3 if chord_root % 2 else 4, 7, 10)]
                if kind in ("pad", "supersaw"):
                    t0, t1 = tl.time(bar * 4), tl.time(bar * 4 + 4)
                    m = int((t1 - t0) * SR)
                    a = np.minimum(1, np.arange(m) / (0.25 * SR)) * np.minimum(1, (m - np.arange(m)) / (0.1 * SR))
                    x = sum(saw(midi_hz(p), m, 0.006, rng.u(0, 1)) for p in notes)
                    x = lp_fft(x, 2500 if kind == "pad" else 6000) * a
                    place(music, x, t0, 0.05 if kind == "pad" else 0.07)
                else:
                    hits = [2, 6, 10, 14] if kind == "stab" else [0, 6, 10]
                    for step in hits:
                        t = tl.time(step_beat(bar, step))
                        dur = 0.12 if kind == "stab" else 0.6
                        m = int(dur * SR)
                        x = sum(saw(midi_hz(p), m, 0.003) for p in notes)
                        x = lp_fft(x, 3000) * env_exp(m, 14 if kind == "stab" else 4)
                        place(music, x, t + jitter(), 0.05)
            if st.get("vocals") and on["chords"] and bar % 2 == 0:
                # A sung phrase that starts off the grid.
                t0 = tl.time(bar * 4 + rng.u(0.3, 1.2))
                m = int(rng.u(0.8, 2.0) * SR)
                f0 = midi_hz(chord_root + 24 + rng.pick([0, 3, 7]))
                tt = np.arange(m) / SR
                vib = 1 + 0.01 * np.sin(TAU * 5.5 * tt)
                x = np.sin(TAU * np.cumsum(f0 * vib) / SR)
                x += 0.5 * np.sin(2 * TAU * np.cumsum(f0 * vib) / SR)
                x *= np.minimum(1, tt / 0.08) * np.minimum(1, (m / SR - tt) / 0.2)
                place(music, x, t0, 0.12)
        bar0 += nb

    mix = drums + music
    # Bus compression and a soft limiter, like a mastered track.
    mix /= max(1e-9, np.percentile(np.abs(mix), 99.5))
    mix = np.tanh(mix * 0.9) * 0.9
    noise = rng.r.normal(0, 10 ** (-60 / 20), n)
    mix = (mix + noise).astype(np.float32)

    beats = [tl.time(b) for b in range(n_beats)]
    return style_name, bpm, mix, dict(
        style=style_name,
        bpm=bpm,
        label_bpm=bpm,
        ambiguous=bool(st.get("ambiguous", False)),
        drift=drift,
        beats=beats,
        downbeats=beats[::4],
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--count", type=int, default=150)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    styles = sorted(STYLES)
    for i in range(args.count):
        style = styles[i % len(styles)]
        name, bpm, mix, gt = render(args.seed * 100_000 + i, style)
        base = os.path.join(args.out, f"{i:03d}-{name}")
        sf.write(base + ".wav", mix, SR, subtype="PCM_16")
        with open(base + ".json", "w") as f:
            json.dump(gt, f)
        print(base, f"{bpm:.2f}", flush=True)


if __name__ == "__main__":
    main()
