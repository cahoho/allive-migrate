#!/usr/bin/env python3
"""
Generate 3 universal ethereal UI interaction sound effects per Section 5.1 of
the AI Music Design Document for "Allive Migration".

Output files:
    route_drag_start.wav   — dragging a species to begin a migration route (0.30s)
    route_node_pass.wav    — route passes through an ecological node (0.18s)
    route_complete.wav     — route completed, migration task begins (0.80s)

All three share an ethereal aesthetic: light, transparent, organic.
They are designed to be pleasant when heard 20+ times per session.
"""

import sys
import os

# Ensure the script can find sfx_utils in the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sfx_utils import (
    SAMPLE_RATE, write_wav, dur_to_samples,
    sine_wave, white_noise, pink_noise, triangle_wave,
    fm_synth, adsr_envelope, linear_envelope, exp_decay_envelope,
    lowpass_filter, highpass_filter, bandpass_filter,
    simple_reverb, mix_layers, apply_envelope, gain, normalize, fade,
)


def generate_route_drag_start(output_dir: str = ".") -> str:
    """
    5.1a — Mouse drag species to start migration route.
    0.30 seconds, 1kHz–8kHz, ethereal.
    Concept: invisible silk thread pulled — glass pluck + air breath + droplet.
    """
    sr = SAMPLE_RATE
    dur = 0.30
    n = dur_to_samples(dur, sr)

    # Layer 1: soft glass string pluck — single tone at 3.2kHz (within 2.5-4kHz)
    # with sharp attack (5ms) and exponential decay
    freq1 = 3200.0
    pluck = sine_wave(freq1, dur, 0.6)
    env1 = exp_decay_envelope(n, 0.20)
    pluck = apply_envelope(pluck, env1)
    # Sharper attack: ramp from 0 to 1 over 5ms
    attack_s = int(0.005 * sr)
    for i in range(attack_s):
        pluck[i] *= i / attack_s

    # Layer 2: thin air breath — ascending filtered noise 1kHz→6kHz
    noise_raw = white_noise(dur, 0.15)
    # Bandpass around breathing frequencies, sweeping up
    # Simulate upward sweep by bandpass with moving center
    breath = []
    for i in range(n):
        t = i / n
        center_freq = 1000.0 + t * 5000.0  # 1kHz → 6kHz
        bw = max(200, center_freq * 0.3)
        breath.append(noise_raw[i])
    breath = bandpass_filter(breath, 800, 6000, sr)
    # Envelope: soft in, soft out, peaks at middle
    env_breath = []
    for i in range(n):
        t = i / n
        if t < 0.1:
            env_breath.append(t / 0.1)
        elif t < 0.5:
            env_breath.append(1.0)
        else:
            env_breath.append(1.0 - (t - 0.5) / 0.5)
    breath = apply_envelope(breath, env_breath)

    # Layer 3: single water droplet at 5.5kHz — very subtle
    droplet_freq = 5500.0
    droplet = sine_wave(droplet_freq, dur, 0.08)
    env_drop = exp_decay_envelope(n, 0.08)
    droplet = apply_envelope(droplet, env_drop)

    # Mix
    mixed = mix_layers(pluck, breath, droplet)
    mixed = normalize(mixed, 0.85)

    # Near-field reverb: 3ms pre-delay, 0.25s decay, 12% wet
    mixed = simple_reverb(mixed, decay=0.25, wet_mix=0.12, pre_delay_ms=3.0, sr=sr)
    # Trim to exact duration
    mixed = mixed[:n]
    mixed = fade(mixed, fade_in=0.005, fade_out=0.01, sr=sr)

    filename = os.path.join(output_dir, "route_drag_start.wav")
    write_wav(filename, mixed, sr)
    print(f"  [OK]  {filename} ({dur:.2f}s)")
    return filename


def generate_route_node_pass(output_dir: str = ".") -> str:
    """
    5.1b — Route passes through an ecological node.
    0.18 seconds, 500Hz–5kHz, ethereal.
    Concept: two nodes connecting — wood tap + soft chime.
    Must be comfortable to hear 20+ times per session.
    """
    sr = SAMPLE_RATE
    dur = 0.18
    n = dur_to_samples(dur, sr)

    # Layer 1: soft wood tap — muffled knock at 800Hz (within 500-1500Hz)
    # Hard attack (2ms), fast decay (100ms)
    wood_freq = 800.0
    wood = sine_wave(wood_freq, dur, 0.5)
    wood += triangle_wave(wood_freq * 1.5, dur, 0.15)  # subtle harmonic
    env_wood = exp_decay_envelope(n, 0.10)
    wood = apply_envelope(wood, env_wood)
    # 2ms attack
    attack_s = int(0.002 * sr)
    for i in range(attack_s):
        wood[i] *= i / attack_s

    # Layer 2: soft chime — bell overtone at 3kHz (within 2-4kHz)
    # Soft attack (8ms), decay to silence by 180ms
    chime = sine_wave(3000.0, dur, 0.15)
    chime += sine_wave(3000.0 * 1.7, dur, 0.06)  # inharmonic bell character
    chime += sine_wave(3000.0 * 2.4, dur, 0.03)
    env_chime = exp_decay_envelope(n, 0.12)
    chime = apply_envelope(chime, env_chime)
    # 8ms soft attack
    attack_c = int(0.008 * sr)
    for i in range(attack_c):
        chime[i] *= i / attack_c

    # Mix
    mixed = mix_layers(wood, chime)
    mixed = normalize(mixed, 0.80)

    # Small room reverb: 5ms pre-delay, 0.30s decay, 15% wet
    mixed = simple_reverb(mixed, decay=0.30, wet_mix=0.15, pre_delay_ms=5.0, sr=sr)
    mixed = mixed[:n]
    mixed = fade(mixed, fade_in=0.002, fade_out=0.005, sr=sr)

    filename = os.path.join(output_dir, "route_node_pass.wav")
    write_wav(filename, mixed, sr)
    print(f"  [OK]  {filename} ({dur:.2f}s)")
    return filename


def generate_route_complete(output_dir: str = ".") -> str:
    """
    5.1c — Route completed, migration task begins.
    0.80 seconds, 200Hz–8kHz, ethereal.
    Concept: route accepted into ecological network — warm breath +
    ascending micro-glide + crystalline particles.
    Natural, peaceful, like releasing a bird. NOT a victory fanfare.
    """
    sr = SAMPLE_RATE
    dur = 0.80
    n = dur_to_samples(dur, sr)

    # Layer 1 (0–0.4s): low-frequency warm breath at 300Hz (200-500Hz)
    # Soft sine swell, attack 15ms, smooth decay
    breath_dur = 0.4
    breath_n = dur_to_samples(breath_dur, sr)
    breath = sine_wave(300.0, breath_dur, 0.5)
    # Add slight warmth through harmonics
    breath2 = sine_wave(300.0 * 2, breath_dur, 0.08)
    breath3 = sine_wave(300.0 * 3, breath_dur, 0.03)
    breath = [breath[i] + breath2[i] + breath3[i] for i in range(len(breath))]
    env_b = []
    for i in range(breath_n):
        t = i / breath_n
        if i < int(0.015 * sr):
            env_b.append(i / (0.015 * sr))
        else:
            env_b.append(math.exp(-3.0 * t) if hasattr(math, 'exp') else (1.0 - t) ** 2)
    env_b = []
    attack_s = int(0.015 * sr)
    for i in range(breath_n):
        if i < attack_s and attack_s > 0:
            env_b.append(i / attack_s)
        else:
            env_b.append(math.exp(-3.0 * (i - attack_s) / breath_n))
    breath = apply_envelope(breath, env_b)
    # Pad to full length
    breath += [0.0] * (n - len(breath))

    # Layer 2 (0.05–0.55s): ascending micro-glide at 800Hz→1000Hz (minor 3rd-ish)
    # Like a warm string or singing bowl rising
    glide_dur = 0.50
    glide_n = dur_to_samples(glide_dur, sr)
    start_idx = int(0.05 * sr)
    glide = []
    for i in range(glide_n):
        t = i / glide_n
        freq = 800.0 + t * 200.0  # 800→1000 Hz (minor 3rd ~ 800→952)
        glide.append(0.4 * math.sin(2.0 * math.pi * freq * i / sr))
    # Soft attack (40ms)
    env_g = []
    attack_g = int(0.04 * sr)
    for i in range(glide_n):
        if i < attack_g and attack_g > 0:
            env_g.append(i / attack_g)
        else:
            t = (i - attack_g) / (glide_n - attack_g)
            env_g.append(1.0 - t * 0.8)
    glide = apply_envelope(glide, env_g)
    # Pad and shift
    glide_padded = [0.0] * start_idx + glide + [0.0] * (n - start_idx - len(glide))

    # Layer 3 (0.2–0.8s): crystalline particle scatter at 3-8kHz
    # 3-5 tiny glass-bead tones, D major pentatonic: D6(1175), E6(1319), F#6(1480), A6(1760), B6(1976)
    notes = [1175, 1319, 1480, 1760, 1976]  # D major pentatonic octave 6
    particles = [0.0] * n
    import random
    random.seed(42)  # reproducible
    for _ in range(5):
        start_t = random.uniform(0.20, 0.65)
        freq = random.choice(notes)
        dur_p = random.uniform(0.04, 0.10)
        amp = random.uniform(0.03, 0.08)
        p_n = dur_to_samples(dur_p, sr)
        p_start = int(start_t * sr)
        for j in range(p_n):
            idx = p_start + j
            if idx < n:
                env_val = math.exp(-8.0 * j / p_n)
                particles[idx] += amp * math.sin(2.0 * math.pi * freq * j / sr) * env_val

    # Mix all layers
    mixed = mix_layers(breath, glide_padded, particles)
    mixed = normalize(mixed, 0.80)

    # Medium hall reverb: 12ms pre-delay, 1.0s decay, 20% wet
    mixed = simple_reverb(mixed, decay=1.0, wet_mix=0.20, pre_delay_ms=12.0, sr=sr)
    mixed = mixed[:n]
    mixed = fade(mixed, fade_in=0.01, fade_out=0.03, sr=sr)

    filename = os.path.join(output_dir, "route_complete.wav")
    write_wav(filename, mixed, sr)
    print(f"  [OK]  {filename} ({dur:.2f}s)")
    return filename


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate 3 ethereal UI sound effects for Allive Migration")
    parser.add_argument("-o", "--output", default="./output", help="Output directory (default: ./output)")
    args = parser.parse_args()

    output_dir = args.output
    os.makedirs(output_dir, exist_ok=True)

    print("[*] Generating Universal Interaction Sound Effects (Section 5.1)")
    print(f"   Output: {os.path.abspath(output_dir)}")
    print()

    generate_route_drag_start(output_dir)
    generate_route_node_pass(output_dir)
    generate_route_complete(output_dir)

    print()
    print("[OK]  All 3 UI sound effects generated successfully!")


if __name__ == "__main__":
    import math
    main()
