#!/usr/bin/env python3
"""
Core audio synthesis utilities for game sound effect generation.
Provides WAV writing, envelope generation, additive/FM synthesis,
filtered noise, reverb simulation, and mixing.
"""

import struct
import math
import random
import wave
import os
from typing import List, Tuple, Optional, Callable

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SAMPLE_RATE = 44100
BIT_DEPTH = 16
MAX_AMP = 32767  # 2^15 - 1

# ---------------------------------------------------------------------------
# WAV file I/O
# ---------------------------------------------------------------------------

def write_wav(filename: str, samples: List[float], sample_rate: int = SAMPLE_RATE) -> str:
    """Write mono float samples (-1.0 to 1.0) to a 16-bit WAV file."""
    os.makedirs(os.path.dirname(filename) or '.', exist_ok=True)
    int_samples = []
    for s in samples:
        clipped = max(-1.0, min(1.0, s))
        int_samples.append(int(clipped * MAX_AMP))

    with wave.open(filename, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f'<{len(int_samples)}h', *int_samples))
    return filename


def read_wav(filename: str) -> Tuple[List[float], int]:
    """Read a mono 16-bit WAV file, returning (samples, sample_rate)."""
    with wave.open(filename, 'r') as wf:
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        fmt = f'<{n_frames}h'
        int_samples = struct.unpack(fmt, raw)
        samples = [s / MAX_AMP for s in int_samples]
        return samples, wf.getframerate()


def stereo_to_mono(filename: str, output: str) -> str:
    """Convert stereo WAV to mono by averaging channels."""
    samples, sr = read_wav(filename)
    # If stereo, we'd need chunked reading; for short SFX, simple approach:
    with wave.open(filename, 'r') as wf:
        if wf.getnchannels() == 1:
            return filename
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        fmt = f'<{n_frames * 2}h'
        all_samples = struct.unpack(fmt, raw)
        mono = [(all_samples[i] + all_samples[i+1]) / 2 / MAX_AMP for i in range(0, len(all_samples), 2)]
    return write_wav(output, mono, sr)


# ---------------------------------------------------------------------------
# Duration helpers
# ---------------------------------------------------------------------------

def dur_to_samples(duration_sec: float, sr: int = SAMPLE_RATE) -> int:
    return int(duration_sec * sr)


def samples_to_dur(n_samples: int, sr: int = SAMPLE_RATE) -> float:
    return n_samples / sr


# ---------------------------------------------------------------------------
# Envelope generators
# ---------------------------------------------------------------------------

def adsr_envelope(total_samples: int, attack: float, decay: float,
                  sustain_level: float, release: float, sr: int = SAMPLE_RATE) -> List[float]:
    """Generate an ADSR envelope."""
    a_s = int(attack * sr)
    d_s = int(decay * sr)
    r_s = int(release * sr)
    s_s = max(0, total_samples - a_s - d_s - r_s)

    env = []
    for i in range(a_s):
        env.append(i / a_s if a_s > 0 else 1.0)
    for i in range(d_s):
        t = i / d_s if d_s > 0 else 1.0
        env.append(1.0 - (1.0 - sustain_level) * t)
    for _ in range(s_s):
        env.append(sustain_level)
    for i in range(r_s):
        t = i / r_s if r_s > 0 else 1.0
        env.append(sustain_level * (1.0 - t))
    return env[:total_samples]


def linear_envelope(total_samples: int, fade_in: float = 0.0, fade_out: float = 0.0,
                    sr: int = SAMPLE_RATE) -> List[float]:
    """Simple linear fade-in / fade-out envelope."""
    fi = int(fade_in * sr)
    fo = int(fade_out * sr)
    env = []
    for i in range(total_samples):
        v = 1.0
        if fi > 0 and i < fi:
            v = i / fi
        if fo > 0 and i >= total_samples - fo:
            v = (total_samples - 1 - i) / fo
        env.append(v)
    return env


def exp_decay_envelope(total_samples: int, decay_time: float, sr: int = SAMPLE_RATE) -> List[float]:
    """Exponential decay envelope from 1.0 to ~0.0."""
    decay_samples = int(decay_time * sr)
    env = []
    for i in range(total_samples):
        if i < decay_samples:
            env.append(math.exp(-5.0 * i / decay_samples))
        else:
            env.append(0.0)
    return env


# ---------------------------------------------------------------------------
# Signal generators
# ---------------------------------------------------------------------------

def sine_wave(freq: float, duration_sec: float, amplitude: float = 1.0,
              sr: int = SAMPLE_RATE) -> List[float]:
    """Generate a pure sine wave."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    for i in range(n):
        samples.append(amplitude * math.sin(2.0 * math.pi * freq * i / sr))
    return samples


def triangle_wave(freq: float, duration_sec: float, amplitude: float = 1.0,
                  sr: int = SAMPLE_RATE) -> List[float]:
    """Generate a triangle wave (softer than sawtooth)."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    period = sr / freq if freq > 0 else 1
    for i in range(n):
        phase = (i % period) / period
        val = 2.0 * abs(2.0 * phase - 1.0) - 1.0
        samples.append(amplitude * val)
    return samples


def square_wave(freq: float, duration_sec: float, amplitude: float = 1.0,
                duty: float = 0.5, sr: int = SAMPLE_RATE) -> List[float]:
    """Generate a square/pulse wave with adjustable duty cycle."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    period = sr / freq if freq > 0 else 1
    for i in range(n):
        phase = (i % period) / period
        samples.append(amplitude if phase < duty else -amplitude)
    return samples


def sawtooth_wave(freq: float, duration_sec: float, amplitude: float = 1.0,
                  sr: int = SAMPLE_RATE) -> List[float]:
    """Generate a sawtooth wave."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    period = sr / freq if freq > 0 else 1
    for i in range(n):
        phase = (i % period) / period
        samples.append(amplitude * (2.0 * phase - 1.0))
    return samples


def white_noise(duration_sec: float, amplitude: float = 1.0, sr: int = SAMPLE_RATE) -> List[float]:
    """Generate white noise."""
    n = dur_to_samples(duration_sec, sr)
    return [amplitude * (random.random() * 2.0 - 1.0) for _ in range(n)]


def pink_noise(duration_sec: float, amplitude: float = 1.0, sr: int = SAMPLE_RATE) -> List[float]:
    """Generate pink noise (1/f spectrum) using Voss-McCartney algorithm."""
    n = dur_to_samples(duration_sec, sr)
    num_octaves = 7
    samples = [0.0] * n
    for _ in range(num_octaves):
        white = [random.random() * 2.0 - 1.0 for _ in range(n)]
        for i in range(n):
            samples[i] += white[i]
    max_val = max(abs(s) for s in samples) if samples else 1.0
    if max_val > 0:
        samples = [amplitude * s / max_val for s in samples]
    return samples


def brown_noise(duration_sec: float, amplitude: float = 1.0, sr: int = SAMPLE_RATE) -> List[float]:
    """Generate brown noise (1/f^2) by integrating white noise."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    val = 0.0
    for _ in range(n):
        val += random.random() * 0.02 - 0.01
        val = max(-1.0, min(1.0, val))
        samples.append(val)
    max_val = max(abs(s) for s in samples) if samples else 1.0
    if max_val > 0:
        samples = [amplitude * s / max_val for s in samples]
    return samples


# ---------------------------------------------------------------------------
# Frequency Modulation (FM) synthesis
# ---------------------------------------------------------------------------

def fm_synth(carrier_freq: float, modulator_freq: float, mod_index: float,
             duration_sec: float, amplitude: float = 1.0, sr: int = SAMPLE_RATE) -> List[float]:
    """Simple FM synthesis: sin(carrier + mod_index * sin(modulator))."""
    n = dur_to_samples(duration_sec, sr)
    samples = []
    phase_c = 0.0
    phase_m = 0.0
    inc_c = 2.0 * math.pi * carrier_freq / sr
    inc_m = 2.0 * math.pi * modulator_freq / sr
    for _ in range(n):
        mod = math.sin(phase_m) * mod_index
        samples.append(amplitude * math.sin(phase_c + mod))
        phase_c += inc_c
        phase_m += inc_m
    return samples


# ---------------------------------------------------------------------------
# Filter utilities using simple 1-pole/2-pole filters
# ---------------------------------------------------------------------------

def lowpass_filter(samples: List[float], cutoff: float, sr: int = SAMPLE_RATE) -> List[float]:
    """Simple 1-pole lowpass filter."""
    dt = 1.0 / sr
    rc = 1.0 / (2.0 * math.pi * cutoff) if cutoff > 0 else 0.001
    alpha = dt / (rc + dt)
    filtered = []
    prev = 0.0
    for s in samples:
        prev = prev + alpha * (s - prev)
        filtered.append(prev)
    return filtered


def highpass_filter(samples: List[float], cutoff: float, sr: int = SAMPLE_RATE) -> List[float]:
    """Simple 1-pole highpass filter."""
    dt = 1.0 / sr
    rc = 1.0 / (2.0 * math.pi * cutoff) if cutoff > 0 else 0.001
    alpha = rc / (rc + dt)
    filtered = []
    prev_x = 0.0
    prev_y = 0.0
    for s in samples:
        y = alpha * (prev_y + s - prev_x)
        filtered.append(y)
        prev_x = s
        prev_y = y
    return filtered


def bandpass_filter(samples: List[float], low_cut: float, high_cut: float,
                    sr: int = SAMPLE_RATE) -> List[float]:
    """Apply bandpass by chaining lowpass and highpass."""
    lp = lowpass_filter(samples, high_cut, sr)
    return highpass_filter(lp, low_cut, sr)


# ---------------------------------------------------------------------------
# Reverb simulation (simple Schroeder-style)
# ---------------------------------------------------------------------------

def simple_reverb(samples: List[float], decay: float = 0.3, wet_mix: float = 0.2,
                  pre_delay_ms: float = 5.0, sr: int = SAMPLE_RATE) -> List[float]:
    """
    Simple reverb using comb filters.
    decay: RT60-like decay time in seconds
    wet_mix: 0.0 (dry) to 1.0 (full wet)
    pre_delay_ms: initial delay before first reflection
    """
    pre_delay = int(pre_delay_ms / 1000.0 * sr)
    output = [0.0] * (len(samples) + pre_delay)

    # Comb filter delays (prime numbers for diffusion)
    comb_delays = [
        int(0.0297 * sr), int(0.0371 * sr), int(0.0411 * sr), int(0.0437 * sr)
    ]
    comb_gains = [0.7 ** (d / (decay * sr)) for d in comb_delays]

    # Copy dry signal with pre-delay
    for i, s in enumerate(samples):
        output[pre_delay + i] = s * (1.0 - wet_mix)

    # Apply comb filters for reverb tail
    reverb_bufs = [[0.0] * d for d in comb_delays]
    n_out = len(output)
    for i in range(n_out):
        reverb_sum = 0.0
        for j, d in enumerate(comb_delays):
            idx = i % d
            val = reverb_bufs[j][idx]
            reverb_sum += val * 0.25
            if i < len(samples):
                reverb_bufs[j][idx] = samples[i] + val * comb_gains[j]
            else:
                reverb_bufs[j][idx] = val * comb_gains[j]
        output[i] += reverb_sum * wet_mix

    # Normalize
    max_val = max(abs(s) for s in output) if output else 1.0
    if max_val > 1.0:
        output = [s / max_val * 0.95 for s in output]
    return output


# ---------------------------------------------------------------------------
# Mixing utilities
# ---------------------------------------------------------------------------

def mix_layers(*layers: List[float]) -> List[float]:
    """Mix multiple sample arrays by summing them. All must be same length."""
    if not layers:
        return []
    n = len(layers[0])
    result = [0.0] * n
    for layer in layers:
        if len(layer) != n:
            raise ValueError(f"Layer length mismatch: {len(layer)} vs {n}")
        for i in range(n):
            result[i] += layer[i]
    max_val = max(abs(s) for s in result) if result else 1.0
    if max_val > 1.0:
        result = [s / max_val * 0.95 for s in result]
    return result


def apply_envelope(samples: List[float], envelope: List[float]) -> List[float]:
    """Multiply samples by an envelope. Pads or truncates as needed."""
    n = min(len(samples), len(envelope))
    result = []
    for i in range(len(samples)):
        env_val = envelope[i] if i < n else 0.0
        result.append(samples[i] * env_val)
    return result


def gain(samples: List[float], db: float) -> List[float]:
    """Apply gain in decibels. Positive db = louder."""
    factor = 10.0 ** (db / 20.0)
    return [s * factor for s in samples]


def normalize(samples: List[float], target_peak: float = 0.95) -> List[float]:
    """Normalize samples to target peak amplitude."""
    max_val = max(abs(s) for s in samples) if samples else 1.0
    if max_val == 0.0:
        return samples
    factor = target_peak / max_val
    return [s * factor for s in samples]


def fade(samples: List[float], fade_in: float = 0.0, fade_out: float = 0.0,
         sr: int = SAMPLE_RATE) -> List[float]:
    """Apply fade-in and fade-out to samples."""
    env = linear_envelope(len(samples), fade_in, fade_out, sr)
    return apply_envelope(samples, env)


# ---------------------------------------------------------------------------
# Utility: rescale frequency to semitone
# ---------------------------------------------------------------------------

def note_to_freq(note_name: str) -> float:
    """Convert note name (e.g. 'A4', 'C#5') to frequency."""
    notes = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
             'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    match = __import__('re').match(r'^([A-G]#?)(\\d+)$', note_name.strip())
    if not match:
        raise ValueError(f"Invalid note name: {note_name}")
    note, octave = match.groups()
    semitone = notes[note] + (int(octave) + 1) * 12
    return 440.0 * (2.0 ** ((semitone - 69) / 12.0))


def midi_to_freq(midi_note: int) -> float:
    """Convert MIDI note number to frequency."""
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))
