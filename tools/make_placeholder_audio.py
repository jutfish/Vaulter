"""Synthesizes placeholder sound effects and a music loop into public/assets/audio/.

Offline only (never run by the game). Python standard library only.
Run from the project root:  python tools/make_placeholder_audio.py

These are stand-ins until approved ElevenLabs assets replace them
(see docs/audio-assets.md). File names are the keys in src/audio/sounds.ts.
"""

import math
import random
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio"
RATE = 22050
rng = random.Random(1234)  # deterministic output


def write(name: str, samples: list[float]) -> None:
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.89 / peak if peak > 0.89 else 1.0
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * scale)) * 32767)) for s in samples))


def env(i: int, n: int, attack: float = 0.005, curve: float = 4.0) -> float:
    t = i / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    return a * math.exp(-curve * i / n)


def noise_burst(dur: float, lowpass: float, curve: float = 6.0, gain: float = 1.0) -> list[float]:
    n = int(dur * RATE)
    out, y = [], 0.0
    for i in range(n):
        y += lowpass * (rng.uniform(-1, 1) - y)
        out.append(y * env(i, n, 0.002, curve) * gain)
    return out


def tone(freq_fn, dur: float, wave_fn=math.sin, curve: float = 4.0, attack: float = 0.005, gain: float = 1.0) -> list[float]:
    n = int(dur * RATE)
    out, phase = [], 0.0
    for i in range(n):
        phase += 2 * math.pi * freq_fn(i / RATE) / RATE
        out.append(wave_fn(phase) * env(i, n, attack, curve) * gain)
    return out


def square(p: float) -> float:
    return 1.0 if math.sin(p) >= 0 else -1.0


def tri(p: float) -> float:
    return 2 / math.pi * math.asin(math.sin(p))


def mix(*parts: list[float]) -> list[float]:
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def make_sfx() -> None:
    write("step", noise_burst(0.05, 0.25, 9, 0.5))
    write("hop", tone(lambda t: 300 + 900 * t, 0.12, square, 5, gain=0.25))
    write("plant", mix(noise_burst(0.08, 0.5, 8, 0.6), tone(lambda t: 110 - 200 * t, 0.12, tri, 6, gain=0.8)))
    # Creak while the pole loads: slow wobbling low saw-ish tone.
    write("bend", tone(lambda t: 70 + 25 * math.sin(t * 40), 0.45, tri, 2.5, 0.03, 0.6))
    # Twang on release: falling pluck with harmonics.
    write("release", mix(
        tone(lambda t: 220 * (1 + 0.6 * math.exp(-t * 18)), 0.5, math.sin, 5, gain=0.8),
        tone(lambda t: 440 * (1 + 0.6 * math.exp(-t * 18)), 0.4, math.sin, 7, gain=0.35),
    ))
    # Perfect launch: bright rising arpeggio.
    perfect = []
    for k, f in enumerate((523.25, 659.25, 783.99, 1046.5)):
        perfect = mix(perfect, [0.0] * int(k * 0.06 * RATE) + tone(lambda t, f=f: f, 0.35, square, 6, gain=0.18))
    write("perfect", perfect)
    write("land", mix(noise_burst(0.12, 0.3, 7, 0.8), tone(lambda t: 90 - 120 * t, 0.1, math.sin, 6, gain=0.7)))
    write("bonk", mix(tone(lambda t: 160 - 300 * t, 0.18, square, 6, gain=0.35), noise_burst(0.06, 0.6, 9, 0.4)))
    write("ui_click", tone(lambda t: 880, 0.05, square, 8, gain=0.2))


def make_music() -> None:
    """8-bar loop, 120 bpm, simple triangle bass + square lead. Loops seamlessly."""
    bpm, bars = 120, 8
    beat = 60 / bpm
    total = int(bars * 4 * beat * RATE)
    buf = [0.0] * total
    chords = [(220.0, 277.18, 329.63), (174.61, 220.0, 261.63), (130.81, 164.81, 196.0), (196.0, 246.94, 293.66)]

    def add(start_s: float, samples: list[float]) -> None:
        s0 = int(start_s * RATE)
        for i, v in enumerate(samples):
            buf[(s0 + i) % total] += v

    for bar in range(bars):
        root, third, fifth = chords[bar % 4]
        for b in range(4):
            t0 = (bar * 4 + b) * beat
            add(t0, tone(lambda t, f=root / 2: f, beat * 0.9, tri, 3, 0.01, 0.35))
            arp = (root, third, fifth, third * 2)
            for s in range(2):
                f = arp[(b * 2 + s) % 4] * 2
                add(t0 + s * beat / 2, tone(lambda t, f=f: f, beat / 2 * 0.8, square, 5, 0.005, 0.06))
            add(t0, noise_burst(0.03, 0.9, 10, 0.12 if b % 2 else 0.2))
    write("music_loop", buf)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_sfx()
    make_music()
    print(f"wrote audio to {OUT}")
