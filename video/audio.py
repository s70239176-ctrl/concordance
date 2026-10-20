"""Sonified ambiguity. The soundtrack is driven by the SAME timeline as the on-screen needle (window.AMB in film.js):
high ambiguity = detuned voices beating against each other, a minor second and a tritone clashing, a nervous tremolo;
low ambiguity = a clean A-major chord. When the ruling lands (45 s) the harmony visibly resolves, you hear it.
Run: python video/audio.py   ->  video/audio.wav"""
import pathlib
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
SR = 44100
DUR = 90.0

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto((HERE / "film.html").resolve().as_uri())
    pg.wait_for_function("window.READY === true", timeout=30000)
    amb100 = pg.evaluate("Array.from({length: 9001}, (_, i) => window.AMB(i / 100))")
    events = pg.evaluate("window.EVENTS")
    b.close()

n = int(SR * (DUR + 1.0))
t = np.arange(n) / SR
d = np.interp(t, np.arange(len(amb100)) / 100.0, np.array(amb100) / 100.0)  # dissonance 0..1
d = np.convolve(d, np.ones(1500) / 1500, mode="same")  # ~34 ms smoothing so detune never clicks
rng = np.random.default_rng(7)


def voice(freq, detune, harmonics=((1, 1.0), (2, 0.28), (3, 0.12)), phase0=0.0):
    """Frequency-modulated sine stack; detune is a per-sample fractional offset (integrated, so no clicks)."""
    inst = freq * (1.0 + detune)
    ph = 2 * np.pi * np.cumsum(inst) / SR + phase0
    return sum(a * np.sin(h * ph) for h, a in harmonics)


# --- the chord: A major (A3, C#4, E4, A4) that decays into clash as ambiguity rises
chord = [(220.00, +0.034), (277.18, -0.027), (329.63, +0.052), (440.00, -0.041), (554.37, +0.030)]
pad = np.zeros(n)
for k, (f, dt) in enumerate(chord):
    pad += voice(f, d * dt, phase0=k * 1.3) * (0.55 if k < 3 else 0.32)
# unambiguous clashing intervals appear only as ambiguity rises
pad += 0.40 * (d ** 1.4) * voice(233.08, 0.0, harmonics=((1, 1.0), (2, 0.2)))   # A#3: a minor second against A3
pad += 0.30 * (d ** 1.8) * voice(311.13, d * 0.01, harmonics=((1, 1.0), (3, 0.1)))  # Eb4: a tritone against A
# once resolved, add the open fifth and a luminous 9th
res = np.clip(1.0 - d * 2.2, 0, 1)
pad += 0.26 * res * voice(659.26, 0.0, harmonics=((1, 1.0),))  # E5
pad += 0.16 * res * voice(493.88, 0.0, harmonics=((1, 1.0),))  # B4 (the 9th)
# nervous tremolo while unresolved
pad *= 1.0 - 0.38 * d * (0.5 + 0.5 * np.sin(2 * np.pi * (5.5 + 3.5 * d) * t))

bass = 0.5 * voice(55.0, 0.0, harmonics=((1, 1.0), (2, 0.35))) * (0.6 + 0.4 * (1 - d))
bass += 0.18 * d * voice(58.27, 0.0, harmonics=((1, 1.0),))  # a grumble: Bb1 against A1 while unresolved

# --- overall envelope: fade in, gentle swells at scene changes, resolve and fade out
env = np.clip(t / 2.5, 0, 1) * np.clip((DUR - 0.2 - t) / 3.0, 0, 1)
for ts in (9.5, 25.0, 36.0, 52.0, 64.0, 78.0):
    env *= 1.0 - 0.25 * np.exp(-((t - ts) / 0.35) ** 2)  # small duck at transitions, then the whoosh fills it
env *= 1.0 + 0.28 * np.exp(-((t - 45.2) / 1.6) ** 2) * (t > 45.0)  # the ruling lands: open up
env *= 1.0 + 0.30 * np.exp(-((t - 86.0) / 1.8) ** 2) * (t > 85.0)  # final resolve
mix = (pad * 0.18 + bass * 0.22) * env

# --- events
def add(sig, start, snd, gain=1.0):
    i = int(start * SR)
    m = min(len(snd), len(sig) - i)
    if m > 0:
        sig[i:i + m] += snd[:m] * gain


def tick(f=1900):
    k = np.arange(int(0.05 * SR)) / SR
    return np.sin(2 * np.pi * f * k) * np.exp(-k * 90) * 0.6


def whoosh():
    k = np.arange(int(0.9 * SR)) / SR
    noise = rng.standard_normal(len(k))
    sos = butter(2, [300, 3500], btype="band", fs=SR, output="sos")
    return sosfilt(sos, noise) * (np.sin(np.pi * np.clip(k / 0.9, 0, 1)) ** 2) * 0.22


def bell(f0, dur=3.2):
    k = np.arange(int(dur * SR)) / SR
    return sum(a * np.sin(2 * np.pi * f0 * r * k) * np.exp(-k * dc) for r, a, dc in ((1, 1.0, 1.4), (2.0, 0.45, 2.0), (2.76, 0.3, 2.6), (4.1, 0.18, 3.4))) * 0.5


def thud():
    k = np.arange(int(0.8 * SR)) / SR
    return (np.sin(2 * np.pi * (60 - 22 * k) * k) * np.exp(-k * 6) + 0.3 * rng.standard_normal(len(k)) * np.exp(-k * 120)) * 0.8


fx = np.zeros(n)
for e in events:
    if e["type"] == "tick":
        add(fx, e["t"], tick(1700 + int(rng.integers(0, 6)) * 220), 0.20)
    elif e["type"] == "whoosh":
        add(fx, e["t"] - 0.15, whoosh())
    elif e["type"] == "thud":
        add(fx, e["t"], thud(), 0.55)
    elif e["type"] == "chime":
        for j, f in enumerate((880.0, 1108.73, 1318.51)):  # A5, C#6, E6: the resolved triad
            add(fx, e["t"] + j * 0.14, bell(f), 0.42)

dry = mix + fx
# --- reverb (synthetic stereo impulse response)
irl = int(1.9 * SR)
ir = [rng.standard_normal(irl) * np.exp(-np.arange(irl) / (SR * 0.55)) for _ in range(2)]
wet = [fftconvolve(dry, ir[c])[:n] * 0.035 for c in range(2)]
left = dry * 0.92 + wet[0]
right = dry * 0.92 + wet[1]
# a hair of stereo width from a tiny delay on the right
sh = int(0.0007 * SR)
right = np.concatenate([np.zeros(sh), right[:-sh]])
st = np.stack([left, right], axis=1)
st = np.tanh(st / max(1e-9, np.abs(st).max()) * 2.4) / np.tanh(2.4)  # gentle soft limiter: raises loudness without hard clipping
st *= 0.85 / max(1e-9, np.abs(st).max())  # peak about -1.4 dBFS
st[: int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))[:, None]
wavfile.write(HERE / "audio.wav", SR, (st * 32767).astype(np.int16))
print("audio.wav", round(len(st) / SR, 1), "s; dissonance at 3s/12s/30s/50s/88s =", [round(float(d[int(x * SR)]), 2) for x in (3, 12, 30, 50, 88)])
