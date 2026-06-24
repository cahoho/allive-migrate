#!/usr/bin/env python3
"""
Generate 8 species-specific sound effects per Section 5.2 of the
AI Music Design Document for "Allive Migration".

Species with calls → synthesized vocalizations (FM/formant)
Species without calls → environmental/behavioral foley sounds (noise-based)

Output files (8):
    species_bird.wav           — Migratory waterbird calls (0.8-1.2s)
    species_butterfly.wav      — Monarch butterfly collective wing hum (1.2s)
    species_bar_goose.wav      — Bar-headed goose high-altitude calls (1.0-1.5s)
    species_salmon.wav         — Salmon leaping waterfall sound (1.5s)
    species_herd.wav           — Wildebeest grunt-bellows (1.0-1.5s)
    species_eel.wav            — American eel underwater movement (1.5s)
    species_sea_turtle.wav     — Green sea turtle surfacing breath (2.0s)
    species_wood_frog.wav      — Wood frog calls (0.5-0.8s)
"""

import sys
import os
import math
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sfx_utils import (
    SAMPLE_RATE, write_wav, dur_to_samples,
    sine_wave, white_noise, pink_noise, brown_noise, triangle_wave, sawtooth_wave,
    fm_synth, adsr_envelope, linear_envelope, exp_decay_envelope,
    lowpass_filter, highpass_filter, bandpass_filter,
    simple_reverb, mix_layers, apply_envelope, gain, normalize, fade,
    midi_to_freq,
)


# ---------------------------------------------------------------------------
# 5.2a — Migratory Waterbird Calls
# ---------------------------------------------------------------------------

def generate_waterbird(output_dir: str) -> str:
    """
    Synthesize 1-2 crisp waterbird calls (duck/goose-like).
    0.8-1.2s, 800Hz-5kHz, wetland space reverb.
    Uses FM synthesis for bird-call timbre.
    """
    sr = SAMPLE_RATE
    dur = 1.0  # total including tail
    n = dur_to_samples(dur, sr)

    samples = [0.0] * n

    # Generate 2 calls with slightly different pitches and timing
    calls = [
        {"start": 0.05, "dur": 0.25, "carrier": 2200.0, "mod": 300.0, "index": 3.0, "amp": 0.55},
        {"start": 0.35, "dur": 0.22, "carrier": 2400.0, "mod": 350.0, "index": 2.5, "amp": 0.50},
    ]

    for call in calls:
        c_start = int(call["start"] * sr)
        c_dur = call["dur"]
        c_n = dur_to_samples(c_dur, sr)
        call_sig = fm_synth(call["carrier"], call["mod"], call["index"], c_dur, call["amp"], sr)
        # Add slight vibrato by modulating amplitude
        env = []
        attack_s = int(0.005 * sr)
        for i in range(c_n):
            if i < attack_s and attack_s > 0:
                env.append(i / attack_s)
            else:
                env.append(math.exp(-6.0 * (i - attack_s) / c_n))
        call_sig = apply_envelope(call_sig, env)
        # Mix into main buffer
        for i in range(c_n):
            idx = c_start + i
            if idx < n:
                samples[idx] += call_sig[i]

    # Add subtle wetland air ambience
    ambience = pink_noise(dur, 0.03)
    ambience = bandpass_filter(ambience, 500, 3000, sr)
    ambience = apply_envelope(ambience, linear_envelope(len(ambience), 0.1, 0.2, sr))
    samples = mix_layers(samples, ambience)

    # Wetland open space reverb: 15ms pre-delay, 0.5s decay, 18% wet
    samples = simple_reverb(samples, decay=0.5, wet_mix=0.18, pre_delay_ms=15.0, sr=sr)
    samples = samples[:n]
    samples = normalize(samples, 0.85)
    samples = fade(samples, fade_in=0.005, fade_out=0.02, sr=sr)

    filename = os.path.join(output_dir, "species_bird.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Migratory waterbird calls")
    return filename


# ---------------------------------------------------------------------------
# 5.2b — Monarch Butterfly Collective Wing Hum
# ---------------------------------------------------------------------------

def generate_butterfly_hum(output_dir: str) -> str:
    """
    Synthesize collective wing-vibration hum of millions of monarch butterflies.
    1.2s, 200Hz-1.5kHz, warm fuzzy drone + branch rustle.
    Uses filtered noise with layered harmonics.
    """
    sr = SAMPLE_RATE
    dur = 1.2
    n = dur_to_samples(dur, sr)

    # Base: brown noise for warm low hum
    hum = brown_noise(dur, 0.4)

    # Layer: filtered low-frequency drone with slight modulation
    drone = []
    for i in range(n):
        t = i / sr
        # Slight frequency wobble for "alive" feeling
        wobble = 1.0 + 0.05 * math.sin(2.0 * math.pi * 0.5 * t)
        freq = 400.0 * wobble
        drone.append(0.3 * math.sin(2.0 * math.pi * freq * t))
        # Add harmonic
        drone[-1] += 0.1 * math.sin(2.0 * math.pi * freq * 2 * t)

    # Mix and bandpass to 200-1500Hz
    mixed = [hum[i] + drone[i] for i in range(n)]
    mixed = bandpass_filter(mixed, 200, 1500, sr)

    # Add light fir branch rustle (high-pass noise)
    rustle = white_noise(dur, 0.08)
    rustle = highpass_filter(rustle, 2000, sr)
    rustle_env = []
    for i in range(n):
        t = i / n
        if t < 0.15:
            rustle_env.append(t / 0.15)
        elif t > 0.85:
            rustle_env.append((1.0 - t) / 0.15)
        else:
            rustle_env.append(1.0)
    rustle = apply_envelope(rustle, rustle_env)

    mixed = mix_layers(mixed, rustle)
    mixed = normalize(mixed, 0.80)

    # Semi-enclosed forest reverb: 10ms, 0.6s decay, 15% wet
    mixed = simple_reverb(mixed, decay=0.6, wet_mix=0.15, pre_delay_ms=10.0, sr=sr)
    mixed = mixed[:n]
    mixed = fade(mixed, fade_in=0.1, fade_out=0.2, sr=sr)

    filename = os.path.join(output_dir, "species_butterfly.wav")
    write_wav(filename, mixed, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Monarch butterfly collective wing hum")
    return filename


# ---------------------------------------------------------------------------
# 5.2c — Bar-headed Goose Calls
# ---------------------------------------------------------------------------

def generate_bar_goose(output_dir: str) -> str:
    """
    Synthesize 1-2 high-pitched bar-headed goose calls.
    1.0-1.5s, 1kHz-6kHz, alpine space with large reverb.
    Higher and more piercing than waterbird — reflects high-altitude flight.
    """
    sr = SAMPLE_RATE
    dur = 1.3
    n = dur_to_samples(dur, sr)

    samples = [0.0] * n

    # 2 piercing calls with slight vibrato
    calls = [
        {"start": 0.05, "dur": 0.35, "carrier": 3200.0, "mod_freq": 280.0, "mod_index": 4.0, "amp": 0.5},
        {"start": 0.50, "dur": 0.32, "carrier": 3700.0, "mod_freq": 250.0, "mod_index": 3.5, "amp": 0.45},
    ]

    for call in calls:
        c_start = int(call["start"] * sr)
        c_dur = call["dur"]
        c_n = dur_to_samples(c_dur, sr)

        # FM synthesis with vibrato
        call_sig = fm_synth(call["carrier"], call["mod_freq"], call["mod_index"], c_dur, call["amp"], sr)

        # Envelope: slight vibrato in sustain
        env = []
        attack_s = int(0.008 * sr)
        for i in range(c_n):
            if i < attack_s and attack_s > 0:
                env.append(i / attack_s)
            elif i < c_n * 0.4:
                env.append(1.0)
            else:
                env.append(math.exp(-5.0 * (i - c_n * 0.4) / (c_n * 0.6)))
        call_sig = apply_envelope(call_sig, env)

        # Add to buffer
        for i in range(c_n):
            idx = c_start + i
            if idx < n:
                samples[idx] += call_sig[i]

    # Thin mountain air ambience
    mountain_air = white_noise(dur, 0.02)
    mountain_air = highpass_filter(mountain_air, 1500, sr)
    samples = mix_layers(samples, mountain_air)

    # Large alpine reverb: 25ms pre-delay, 1.2s decay, 25% wet
    samples = simple_reverb(samples, decay=1.2, wet_mix=0.25, pre_delay_ms=25.0, sr=sr)
    samples = samples[:n]
    samples = normalize(samples, 0.85)
    samples = fade(samples, fade_in=0.005, fade_out=0.03, sr=sr)

    filename = os.path.join(output_dir, "species_bar_goose.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Bar-headed goose calls")
    return filename


# ---------------------------------------------------------------------------
# 5.2d — Salmon Leaping Water Sound
# ---------------------------------------------------------------------------

def generate_salmon_leap(output_dir: str) -> str:
    """
    Synthesize salmon leaping out of water and splashing back.
    1.5s, 80Hz-4kHz, two phases: burst-out + re-entry splash.
    Uses layered noise synthesis for water effects.
    """
    sr = SAMPLE_RATE
    dur = 1.5
    n = dur_to_samples(dur, sr)

    # Phase 1 (0-0.6s): bursting out — low-freq water surge + whoosh
    phase1 = [0.0] * n
    p1_end = int(0.6 * sr)

    # Low-frequency displacement (80-500Hz)
    low_boom = brown_noise(0.6, 0.7)
    low_boom = lowpass_filter(low_boom, 400, sr)
    for i in range(min(len(low_boom), p1_end)):
        phase1[i] += low_boom[i]

    # Whoosh (500Hz-2kHz) — rises then falls
    whoosh = white_noise(0.6, 0.35)
    whoosh = bandpass_filter(whoosh, 500, 2000, sr)
    whoosh_env = []
    for i in range(len(whoosh)):
        t = i / len(whoosh)
        if t < 0.2:
            whoosh_env.append(t / 0.2)
        elif t < 0.5:
            whoosh_env.append(1.0)
        else:
            whoosh_env.append(1.0 - (t - 0.5) / 0.5)
    whoosh = apply_envelope(whoosh, whoosh_env)
    for i in range(min(len(whoosh), p1_end)):
        phase1[i] += whoosh[i]

    # Phase 2 (0.6-1.5s): re-entry splash
    phase2_start = int(0.6 * sr)

    # Impact (200-1500Hz)
    impact = white_noise(0.05, 0.5)
    impact = bandpass_filter(impact, 200, 1500, sr)
    impact_env = exp_decay_envelope(len(impact), 0.05, sr)
    impact = apply_envelope(impact, impact_env)
    for i in range(len(impact)):
        idx = phase2_start + i
        if idx < n:
            samples_buf = [0.0] * n if 'samples_buf' not in dir() else phase1
            break

    # Let me rewrite this more cleanly:
    samples = [0.0] * n

    # Phase 1
    for i in range(p1_end):
        if i < len(low_boom):
            samples[i] += low_boom[i]
        if i < len(whoosh):
            samples[i] += whoosh[i]

    # Phase 2 (0.6-1.5s): re-entry splash
    # Impact
    impact = white_noise(0.08, 0.45)
    impact = bandpass_filter(impact, 200, 1500, sr)
    impact = apply_envelope(impact, exp_decay_envelope(len(impact), 0.08, sr))
    for i in range(len(impact)):
        idx = phase2_start + i
        if idx < n:
            samples[idx] += impact[i]

    # Droplet scatter (1-4kHz, 0.4s)
    scatter = white_noise(0.4, 0.15)
    scatter = highpass_filter(scatter, 1500, sr)
    scatter_env = exp_decay_envelope(len(scatter), 0.3, sr)
    scatter = apply_envelope(scatter, scatter_env)
    for i in range(len(scatter)):
        idx = phase2_start + int(0.02 * sr) + i
        if idx < n:
            samples[idx] += scatter[i]

    samples = normalize(samples, 0.85)

    # River valley reverb: 20ms, 0.8s decay, 15% wet
    samples = simple_reverb(samples, decay=0.8, wet_mix=0.15, pre_delay_ms=20.0, sr=sr)
    samples = samples[:n]
    samples = fade(samples, fade_in=0.01, fade_out=0.02, sr=sr)

    filename = os.path.join(output_dir, "species_salmon.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Salmon leaping water")
    return filename


# ---------------------------------------------------------------------------
# 5.2e — Wildebeest Grunt-bellows
# ---------------------------------------------------------------------------

def generate_wildebeest(output_dir: str) -> str:
    """
    Synthesize 1-2 short wildebeest grunt-bellows.
    1.0-1.5s, 100-800Hz, deep raspy resonant call.
    Uses sub-harmonic FM synthesis for bovine-like timbre.
    """
    sr = SAMPLE_RATE
    dur = 1.2
    n = dur_to_samples(dur, sr)

    samples = [0.0] * n

    # 2 grunts
    grunts = [
        {"start": 0.05, "dur": 0.35, "carrier": 220.0, "mod_freq": 110.0, "mod_index": 5.0, "amp": 0.55},
        {"start": 0.48, "dur": 0.32, "carrier": 250.0, "mod_freq": 125.0, "mod_index": 4.5, "amp": 0.50},
    ]

    for grunt in grunts:
        g_start = int(grunt["start"] * sr)
        g_dur = grunt["dur"]
        g_n = dur_to_samples(g_dur, sr)
        grunt_sig = fm_synth(grunt["carrier"], grunt["mod_freq"], grunt["mod_index"],
                              g_dur, grunt["amp"], sr)
        # Add rasp through additional high-freq harmonics
        rasp = fm_synth(grunt["carrier"] * 3, grunt["mod_freq"] * 1.3, 2.0, g_dur, 0.08, sr)
        grunt_sig = [grunt_sig[i] + rasp[i] for i in range(len(grunt_sig))]

        # Envelope: quick attack, raspy sustain, decay
        env = []
        attack_s = int(0.01 * sr)
        for i in range(g_n):
            if i < attack_s and attack_s > 0:
                env.append(i / attack_s)
            elif i < g_n * 0.6:
                env.append(0.8)
            else:
                env.append(0.8 * math.exp(-5.0 * (i - g_n * 0.6) / (g_n * 0.4)))
        grunt_sig = apply_envelope(grunt_sig, env)

        for i in range(g_n):
            idx = g_start + i
            if idx < n:
                samples[idx] += grunt_sig[i]

    # Grassland ambience (very subtle)
    grass_amb = pink_noise(dur, 0.02)
    grass_amb = bandpass_filter(grass_amb, 200, 1000, sr)
    samples = mix_layers(samples, grass_amb)

    # Vast grassland reverb: 20ms, 0.7s decay, 12% wet
    samples = simple_reverb(samples, decay=0.7, wet_mix=0.12, pre_delay_ms=20.0, sr=sr)
    samples = samples[:n]
    samples = normalize(samples, 0.85)
    samples = fade(samples, fade_in=0.005, fade_out=0.02, sr=sr)

    filename = os.path.join(output_dir, "species_herd.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Wildebeest grunt-bellows")
    return filename


# ---------------------------------------------------------------------------
# 5.2f — American Eel Underwater Movement
# ---------------------------------------------------------------------------

def generate_eel_movement(output_dir: str) -> str:
    """
    Synthesize eel moving through murky river bottom.
    1.5s, 60Hz-600Hz, smooth dark sliding + sediment brush.
    Uses low-frequency filtered noise with gradual evolution.
    """
    sr = SAMPLE_RATE
    dur = 1.5
    n = dur_to_samples(dur, sr)

    # Water displacement (60-400Hz) — smooth continuous rumble
    displacement = pink_noise(dur, 0.6)
    displacement = lowpass_filter(displacement, 350, sr)
    # Make it "slide" — slow amplitude modulation
    for i in range(n):
        t = i / sr
        mod = 0.7 + 0.3 * math.sin(2.0 * math.pi * 0.8 * t)  # slow 0.8Hz undulation
        displacement[i] *= mod

    # Sediment brush (200-600Hz) — faint texture
    brush = brown_noise(dur, 0.12)
    brush = bandpass_filter(brush, 200, 600, sr)
    # Textured, rhythmic brushing
    brush_env = []
    for i in range(n):
        t = i / n
        # Occasional brush events
        brush_val = 1.0
        if 0.3 < t < 0.4 or 0.7 < t < 0.8:
            brush_val = 1.5
        brush_env.append(brush_val)
    brush = apply_envelope(brush, brush_env)

    mixed = mix_layers(displacement, brush)
    mixed = normalize(mixed, 0.75)

    # Underwater reverb: 5ms, 0.6s decay, 25% wet
    mixed = simple_reverb(mixed, decay=0.6, wet_mix=0.25, pre_delay_ms=5.0, sr=sr)
    mixed = mixed[:n]
    mixed = fade(mixed, fade_in=0.2, fade_out=0.3, sr=sr)

    filename = os.path.join(output_dir, "species_eel.wav")
    write_wav(filename, mixed, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Eel underwater movement")
    return filename


# ---------------------------------------------------------------------------
# 5.2g — Green Sea Turtle Surfacing Breath
# ---------------------------------------------------------------------------

def generate_turtle_breath(output_dir: str) -> str:
    """
    Synthesize green sea turtle surfacing to breathe.
    2.0s, 100Hz-2kHz, three phases: water parting + exhale/inhale + re-entry.
    Uses filtered noise for breath with ocean ambience.
    """
    sr = SAMPLE_RATE
    dur = 2.0
    n = dur_to_samples(dur, sr)

    samples = [0.0] * n

    # Phase 1 (0-0.5s): water surface parting — soft high-freq "splitting"
    p1_start = 0
    p1_end = int(0.5 * sr)
    parting = white_noise(0.5, 0.3)
    parting = bandpass_filter(parting, 500, 2000, sr)
    p1_env = []
    for i in range(len(parting)):
        t = i / len(parting)
        if t < 0.15:
            p1_env.append(t / 0.15 * 0.6)
        elif t < 0.5:
            p1_env.append(0.6 + 0.4 * math.sin(math.pi * (t - 0.15) / 0.35))
        else:
            p1_env.append(1.0 - (t - 0.5) / 0.5)
    parting = apply_envelope(parting, p1_env)
    for i in range(len(parting)):
        if p1_start + i < n:
            samples[p1_start + i] += parting[i]

    # Phase 2 (0.3-1.5s): breath — exhale + inhale
    # Exhale (0.6s): breathy, slightly wet, 100-600Hz
    exhale_start = int(0.3 * sr)
    exhale_n = dur_to_samples(0.55, sr)
    exhale = pink_noise(0.55, 0.5)
    exhale = lowpass_filter(exhale, 600, sr)
    exhale = bandpass_filter(exhale, 100, 600, sr)
    exhale_env = []
    for i in range(exhale_n):
        t = i / exhale_n
        if t < 0.15:
            exhale_env.append(t / 0.15)
        elif t < 0.6:
            exhale_env.append(1.0)
        else:
            exhale_env.append(1.0 - (t - 0.6) / 0.4)
    exhale = apply_envelope(exhale, exhale_env)
    for i in range(exhale_n):
        idx = exhale_start + i
        if idx < n:
            samples[idx] += exhale[i]

    # Inhale (0.3s, shorter)
    inhale_start = int(0.95 * sr)
    inhale_n = dur_to_samples(0.3, sr)
    inhale = pink_noise(0.3, 0.4)
    inhale = bandpass_filter(inhale, 150, 500, sr)
    inhale = highpass_filter(inhale, 100, sr)
    inhale_env = []
    for i in range(inhale_n):
        t = i / inhale_n
        if t < 0.3:
            inhale_env.append(t / 0.3)
        elif t < 0.6:
            inhale_env.append(1.0)
        else:
            inhale_env.append(1.0 - (t - 0.6) / 0.4)
    inhale = apply_envelope(inhale, inhale_env)
    for i in range(inhale_n):
        idx = inhale_start + i
        if idx < n:
            samples[idx] += inhale[i]

    # Phase 3 (1.5-2.0s): gentle re-entry
    reentry_start = int(1.5 * sr)
    reentry = white_noise(0.5, 0.2)
    reentry = bandpass_filter(reentry, 300, 1500, sr)
    reentry = apply_envelope(reentry, exp_decay_envelope(len(reentry), 0.4, sr))
    for i in range(len(reentry)):
        idx = reentry_start + i
        if idx < n:
            samples[idx] += reentry[i]

    # Ocean ambience throughout
    ocean = brown_noise(dur, 0.04)
    ocean = lowpass_filter(ocean, 400, sr)
    for i in range(n):
        samples[i] += ocean[i] * 0.5

    samples = normalize(samples, 0.80)

    # Vast ocean reverb: 30ms, 1.5s decay, 22% wet
    samples = simple_reverb(samples, decay=1.5, wet_mix=0.22, pre_delay_ms=30.0, sr=sr)
    samples = samples[:n]
    samples = fade(samples, fade_in=0.02, fade_out=0.05, sr=sr)

    filename = os.path.join(output_dir, "species_sea_turtle.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Sea turtle surfacing breath")
    return filename


# ---------------------------------------------------------------------------
# 5.2h — Wood Frog Calls
# ---------------------------------------------------------------------------

def generate_wood_frog(output_dir: str) -> str:
    """
    Synthesize 1-2 short wood frog calls (duck-like "quack").
    0.5-0.8s, 500Hz-3kHz, crisp and percussive.
    Uses FM synthesis with fast attack for frog timbre.
    """
    sr = SAMPLE_RATE
    dur = 0.7
    n = dur_to_samples(dur, sr)

    samples = [0.0] * n

    # 2 short "clack" calls
    calls = [
        {"start": 0.05, "dur": 0.12, "carrier": 1800.0, "mod_freq": 600.0, "mod_index": 5.0, "amp": 0.5},
        {"start": 0.28, "dur": 0.10, "carrier": 2000.0, "mod_freq": 650.0, "mod_index": 4.5, "amp": 0.45},
    ]

    for call in calls:
        c_start = int(call["start"] * sr)
        c_dur = call["dur"]
        c_n = dur_to_samples(c_dur, sr)
        call_sig = fm_synth(call["carrier"], call["mod_freq"], call["mod_index"],
                             c_dur, call["amp"], sr)
        # Very fast attack, quick decay (percussive)
        env = []
        attack_s = int(0.003 * sr)
        for i in range(c_n):
            if i < attack_s and attack_s > 0:
                env.append(i / attack_s)
            else:
                env.append(math.exp(-15.0 * (i - attack_s) / c_n))
        call_sig = apply_envelope(call_sig, env)
        for i in range(c_n):
            idx = c_start + i
            if idx < n:
                samples[idx] += call_sig[i]

    # Moist forest ambience
    forest = pink_noise(dur, 0.02)
    forest = bandpass_filter(forest, 400, 2000, sr)
    samples = mix_layers(samples, forest)

    # Moist woodland reverb: 10ms, 0.5s decay, 18% wet
    samples = simple_reverb(samples, decay=0.5, wet_mix=0.18, pre_delay_ms=10.0, sr=sr)
    samples = samples[:n]
    samples = normalize(samples, 0.85)
    samples = fade(samples, fade_in=0.003, fade_out=0.01, sr=sr)

    filename = os.path.join(output_dir, "species_wood_frog.wav")
    write_wav(filename, samples, sr)
    print(f"  [OK]  {filename} ({dur:.1f}s) — Wood frog calls")
    return filename


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Generate 8 species-specific sound effects for Allive Migration (Section 5.2)"
    )
    parser.add_argument("-o", "--output", default="./output",
                        help="Output directory (default: ./output)")
    parser.add_argument("--species", nargs="*",
                        choices=["bird", "butterfly", "bar_goose", "salmon", "herd", "eel", "sea_turtle", "wood_frog"],
                        help="Specific species to generate (default: all)")
    args = parser.parse_args()

    output_dir = args.output
    os.makedirs(output_dir, exist_ok=True)

    generators = {
        "bird": generate_waterbird,
        "butterfly": generate_butterfly_hum,
        "bar_goose": generate_bar_goose,
        "salmon": generate_salmon_leap,
        "herd": generate_wildebeest,
        "eel": generate_eel_movement,
        "sea_turtle": generate_turtle_breath,
        "wood_frog": generate_wood_frog,
    }

    targets = args.species if args.species else list(generators.keys())

    print("[*] Generating Species-Specific Sound Effects (Section 5.2)")
    print(f"   Output: {os.path.abspath(output_dir)}")
    print(f"   Species: {', '.join(targets)}")
    print()

    for species_key in targets:
        gen_func = generators[species_key]
        gen_func(output_dir)

    print()
    print("[OK]  Species sound effects generated successfully!")


if __name__ == "__main__":
    main()
