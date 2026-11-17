"""Makes the sampler's built-in one-shots. Everything is synthesised here,
so the sounds are ours to ship. Run from anywhere: python3 gen.py
Writes 44.1 kHz, 16-bit mono WAVs next to this file."""

import os
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def t(secs):
    return np.arange(int(SR * secs)) / SR


def env(n, attack=0.002, release=0.05):
    """A flat envelope with short linear fades in and out, so nothing clicks."""
    e = np.ones(n)
    a, r = int(SR * attack), int(SR * release)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff can be a number or an array (a sweep)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    k = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc)
        y[i] = acc
    return y


def saw(phase):
    return 2 * (phase % 1.0) - 1


def write(name, x, peak=0.89):
    x = x / max(1e-9, np.max(np.abs(x))) * peak
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(HERE, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def air_horn():
    # Three detuned saws a fifth and an octave apart, in short stabs.
    out = []
    for secs in (0.16, 0.16, 0.7):
        tt = t(secs)
        f = 466 * (1 + 0.006 * np.sin(2 * np.pi * 6 * tt))
        x = sum(saw(np.cumsum(f * m) / SR) for m in (1, 1.004, 1.5, 2.002))
        x = lowpass(x, 3500) * env(len(tt), 0.004, 0.04)
        out += [x, np.zeros(int(SR * 0.05))]
    return np.tanh(1.6 * np.concatenate(out))


def siren():
    # A square wave whose pitch wails up and down.
    tt = t(2.4)
    f = 700 + 450 * np.sin(2 * np.pi * 1.25 * tt - np.pi / 2)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    return lowpass(x, 2800) * env(len(tt), 0.01, 0.2)


def kick():
    tt = t(0.6)
    f = 45 + 110 * np.exp(-tt * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6)
    click = rng.standard_normal(len(tt)) * np.exp(-tt * 400) * 0.3
    return np.tanh(2.2 * (body + click))


def clap():
    n = int(SR * 0.45)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 900)  # thin out the lows
    noise = lowpass(noise, 6000)
    e = np.zeros(n)
    for start in (0, 0.011, 0.022):  # three hands, slightly apart
        s = int(SR * start)
        e[s:] += np.exp(-(tt[: n - s]) * 160)
    e += np.exp(-np.maximum(tt - 0.033, 0) * 22) * (tt >= 0.033) * 0.8
    return noise * e


def snare():
    tt = t(0.4)
    tone = np.sin(2 * np.pi * np.cumsum(190 + 60 * np.exp(-tt * 40)) / SR) * np.exp(-tt * 25)
    noise = rng.standard_normal(len(tt))
    noise = lowpass(noise - lowpass(noise, 1500), 9000) * np.exp(-tt * 14)
    return tone * 0.7 + noise


def rewind():
    # A tape spinback: a bright buzz that slurs down and slows to a stop.
    tt = t(1.3)
    speed = np.clip(1 - tt / 1.3, 0, 1) ** 1.6
    f = 120 + 900 * speed
    buzz = saw(np.cumsum(f) / SR) + 0.5 * saw(np.cumsum(f * 2.01) / SR)
    wobble = 1 + 0.4 * np.sin(2 * np.pi * np.cumsum(9 * speed + 2) / SR)
    x = lowpass(buzz * wobble, 400 + 5000 * speed)
    return x * env(len(tt), 0.005, 0.15)


def riser():
    # White noise swept up over four seconds, getting louder.
    tt = t(4.0)
    noise = rng.standard_normal(len(tt))
    cutoff = 200 * (60 ** (tt / tt[-1]))
    x = lowpass(lowpass(noise, cutoff), cutoff * 1.2)
    x = x - lowpass(x, cutoff * 0.25)
    return x * (tt / tt[-1]) ** 1.5 * env(len(tt), 0.01, 0.03)


def laser():
    tt = t(0.5)
    f = 3200 * np.exp(-tt * 9) + 120
    x = np.sin(2 * np.pi * np.cumsum(f) / SR + 2.5 * np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR))
    return x * np.exp(-tt * 5) * env(len(tt), 0.001, 0.05)


SOUNDS = {
    '1 Air horn': air_horn,
    '2 Siren': siren,
    '3 Kick': kick,
    '4 Clap': clap,
    '5 Snare': snare,
    '6 Rewind': rewind,
    '7 Riser': riser,
    '8 Laser': laser,
}

if __name__ == '__main__':
    for name, make in SOUNDS.items():
        write(name, make())
        print('wrote', name)
