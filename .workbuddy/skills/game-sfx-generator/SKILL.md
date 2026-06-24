---
name: game-sfx-generator
description: >
  Game sound effect (SFX) generation toolkit for the "Allive Migration" project.
  This skill should be used when the user needs to generate UI interaction sound effects (ethereal style),
  synthesize animal vocalizations and environmental foley sounds for 8 species
  (waterbird, monarch butterfly, bar-headed goose, salmon, wildebeest, American eel,
  green sea turtle, wood frog), or search/download free commercial-use sound materials.
  Covers both procedural audio synthesis (FM, additive, noise-based) and curated
  free resource discovery. Trigger keywords: 音效, sound effect, SFX, 动物叫声,
  animal sound, game audio, generate sound, 生成音效, 音效素材, download sound.
agent_created: true
---

# Game SFX Generator — Allive Migration 音效生成工具

## Overview

This skill provides a complete toolkit for generating and sourcing game sound effects for the
"Allive Migration · 众生迁徙" project. It produces 11 total sound effects across two categories:
3 universal ethereal UI interaction sounds (Section 5.1 of the design doc) and 8 species-specific
sounds combining animal vocalizations and environmental foley (Section 5.2). All sounds are
generated as 44.1kHz 16-bit mono WAV files following the project's audio pipeline requirements.

The skill uses three approaches:
1. **Procedural synthesis** — FM synthesis, additive synthesis, filtered noise for ethereal UI
   sounds and animal calls (Python + numpy/scipy)
2. **Free resource discovery** — Curated links to Pixabay, Mixkit, Freesound for CC0/free
   commercial-use sound effects
3. **Direct download** — When direct URLs are available, download files to `./needownload/`

## When to Use This Skill

Activate this skill when the user expresses any of the following intents:

- "生成游戏音效" / "generate game sound effects"
- "生成拖拽音效" / "generate drag sound effect"
- "生成动物叫声" / "generate animal calls" / "synthesize animal sounds"
- "生成环境音效" / "generate environmental foley"
- "找免费音效素材" / "find free sound effects"
- "下载免费商用音效" / "download free commercial-use sounds"
- "生成 Allive Migration 的音效" / "generate sounds for Allive Migration"
- Any request to create SFX for the 8 project species or 3 UI interactions

## Core Capabilities

### 1. Generate UI Interaction Sound Effects (Section 5.1)

Run `scripts/generate_ui_sfx.py` to produce the 3 ethereal UI sounds:

```bash
python scripts/generate_ui_sfx.py -o ./output
```

Output files:
- `route_drag_start.wav` — 0.30s, glass pluck + air breath + droplet, 1kHz-8kHz
- `route_node_pass.wav` — 0.18s, wood tap + soft chime, 500Hz-5kHz (repeatable 20+ times)
- `route_complete.wav` — 0.80s, warm breath + ascending glide + crystal scatter, 200Hz-8kHz

All three use **additive synthesis** with sine waves, filtered noise, and simple Schroeder reverb
for the "ethereal" aesthetic described in the design document.

### 2. Generate Species-Specific Sounds (Section 5.2)

Run `scripts/generate_species_sfx.py` to produce sounds for all 8 species:

```bash
# Generate all 8 species sounds
python scripts/generate_species_sfx.py -o ./output

# Generate specific species only
python scripts/generate_species_sfx.py -o ./output --species bird frog salmon

# Available species keys:
# bird, butterfly, bar_goose, salmon, herd, eel, sea_turtle, wood_frog
```

Output files:
- `species_bird.wav` — Migratory waterbird calls (FM synthesis, 0.8-1.2s)
- `species_butterfly.wav` — Monarch butterfly collective wing hum (noise-based drone, 1.2s)
- `species_bar_goose.wav` — Bar-headed goose high-altitude calls (FM + alpine reverb, 1.0-1.5s)
- `species_salmon.wav` — Salmon leaping water foley (noise-based, 2-phase, 1.5s)
- `species_herd.wav` — Wildebeest grunt-bellows (sub-harmonic FM, 1.0-1.5s)
- `species_eel.wav` — American eel underwater movement (filtered noise, 1.5s)
- `species_sea_turtle.wav` — Sea turtle surfacing breath (3-phase noise synthesis, 2.0s)
- `species_wood_frog.wav` — Wood frog calls (FM percussion, 0.5-0.8s)

**Synthesis techniques used:**
- **Animal vocalizations** (bird, bar_goose, herd, frog): FM synthesis with carefully tuned
  carrier/modulator ratios and modulation indices derived from the design doc specs.
  Reference `references/sound_design_specs.md` for exact parameters.
- **Environmental foley** (butterfly, salmon, eel, turtle): Layered filtered noise
  (white/pink/brown) with envelope shaping, bandpass filtering, and phase-sequenced events.

### 3. Search and Download Free Commercial-Use Sounds

Run `scripts/download_free_sfx.py` to find and download free sound materials:

```bash
# Search for specific sounds
python scripts/download_free_sfx.py --search "water splash"

# Download a specific file by URL
python scripts/download_free_sfx.py --download "https://example.com/sound.wav"

# Generate comprehensive resource guide with curated links
python scripts/download_free_sfx.py --all

# List all curated resources
python scripts/download_free_sfx.py
```

The script generates two outputs:
1. `./needownload/SOUND_RESOURCES.md` — Comprehensive guide with categorized links to:
   - Pixabay Sound Effects (CC0/Pixabay Content License, no attribution)
   - Mixkit (free commercial use, no attribution)
   - Freesound.org (CC0 only, filtered)
2. `./needownload/free_sound_links.md` — Search-specific reference file

**Curated categories** include: water_splash, bird_call, frog_call, animal_bovine, insect_hum,
underwater, breath, ui_ethereal — each mapped to the project's species needs.

### 4. Custom Sound Effect Creation

When the user requests a custom sound effect not covered by the default scripts (e.g., specific
animal calls like "lion roar", "elephant trumpet", "wolf howl"), use the shared utility module
`scripts/sfx_utils.py` to build the sound programmatically.

**Key utility functions in sfx_utils.py:**

- `sine_wave(freq, duration, amplitude)` — Pure tone generation
- `fm_synth(carrier, modulator, index, duration, amplitude)` — FM synthesis for animal-like timbres
- `white_noise(duration, amplitude)` / `pink_noise()` / `brown_noise()` — Noise generators
- `lowpass_filter(samples, cutoff)` / `highpass_filter()` / `bandpass_filter()` — Simple 1-pole filters
- `simple_reverb(samples, decay, wet_mix, pre_delay_ms)` — Schroeder reverb
- `adsr_envelope(n, attack, decay, sustain, release)` — ADSR amplitude envelope
- `mix_layers(*layers)` — Sum multiple sample arrays
- `write_wav(filename, samples)` — Export to 16-bit WAV
- `note_to_freq("A4")` / `midi_to_freq(69)` — Note/frequency conversion

**Custom animal call recipe (example: wolf howl):**
```python
from sfx_utils import *

sr = SAMPLE_RATE
dur = 1.5
n = dur_to_samples(dur, sr)

# FM synthesis with upward pitch bend for "howl" character
howl = fm_synth(carrier=800, modulator=250, mod_index=3.5, duration_sec=dur, amplitude=0.6, sr=sr)
env = adsr_envelope(n, attack=0.05, decay=0.3, sustain_level=0.6, release=0.5, sr=sr)
howl = apply_envelope(howl, env)
howl = simple_reverb(howl, decay=1.0, wet_mix=0.25, pre_delay_ms=20, sr=sr)
write_wav("custom_wolf_howl.wav", howl[:n], sr)
```

## Workflow

### Standard Workflow: Generate All Sound Effects

1. Ensure Python 3.8+ is available with `numpy` installed
2. Create output directory: `./output` (for synthesized sounds) and `./needownload` (for downloads)
3. Run `python scripts/generate_ui_sfx.py -o ./output` for UI sounds
4. Run `python scripts/generate_species_sfx.py -o ./output` for species sounds
5. Run `python scripts/download_free_sfx.py --all` for free resource guide
6. Optionally run `python scripts/download_free_sfx.py --search "<keyword>"` for additional sounds

### Extended Workflow: Custom Species or Sound Types

1. Load `references/sound_design_specs.md` for detailed parameters
2. Import `scripts/sfx_utils.py` as a module
3. Build custom synthesis using the utility functions
4. Export to WAV via `write_wav()`

### Free Sound Integration Workflow

1. Run `download_free_sfx.py --search` with relevant keywords
2. Review the generated links in `./needownload/free_sound_links.md`
3. Browse the suggested sites (Pixabay, Mixkit, Freesound)
4. Download files manually from the sites, or use `--download <url>` for direct URLs
5. Place downloaded files in `./needownload/`
6. Files can then be processed (trim, normalize, convert format) and placed in the game's
   `/public/audio/sfx/` directory

## Important Notes

- **All synthesized sounds are 44.1kHz 16-bit mono WAV** — matches the project's audio pipeline spec
- **FM synthesis parameters** are tuned to produce recognizable but not hyper-realistic animal calls;
  for production use, supplement with downloaded real recordings
- **Free sound sources** recommended (Pixabay, Mixkit, Freesound CC0) are verified for commercial use
  without attribution at time of skill creation — always re-verify license terms before publishing
- **The `./needownload/` directory** is the designated location for all downloaded sound materials
- **Output files** from synthesis scripts go to `./output/` by default; use `-o` to override
- **Dependencies**: `numpy` is required for synthesis scripts; `scipy` enables additional
  filter options but is optional; `soundfile` can replace the built-in `wave` module
- When generating sounds for species not in the original 8, reference the synthesis
  parameter tables in `references/sound_design_specs.md` and adapt FM carrier/modulator
  values to match the target animal's vocal range

## Resources

### scripts/
- `sfx_utils.py` — Core audio synthesis library (WAV I/O, generators, filters, reverb, mixing)
- `generate_ui_sfx.py` — Generate 3 ethereal UI interaction sound effects
- `generate_species_sfx.py` — Generate 8 species-specific sounds (calls + environmental foley)
- `download_free_sfx.py` — Search curated free sound collections and download materials

### references/
- `sound_design_specs.md` — Complete sound design parameter tables from the AI Music Design Doc
  Section 5, including frequency ranges, reverb settings, transient characteristics, and
  synthesis parameters for all 11 sound effects
