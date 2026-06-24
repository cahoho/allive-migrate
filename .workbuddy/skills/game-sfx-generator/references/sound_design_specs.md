# Sound Design Specifications (from Section 5 of AI Music Design Doc)

This reference documents the exact sound design parameters for all 11 sound effects
required by the Allive Migration game, as specified in `ai-music-design-doc.md` Section 5.

---

## 5.1 Universal Interaction Sound Effects (3)

All three share an **ethereal** aesthetic: light, transparent, organic, repeatable.

### 5.1a — Route Drag Start (route_drag_start.wav)

| Parameter | Value |
|-----------|-------|
| Trigger | Player clicks and drags an animal to begin drawing a migration route |
| Duration | 0.25–0.35 seconds |
| Frequency Range | 1kHz–8kHz, peak at 2.5–4kHz |
| Reverb | Near-field, 3ms pre-delay, 0.25s decay, 12% wet |
| Transient | Soft-medium attack (5ms), decay to -50dB in 0.3s |
| Character | Crystalline, weightless, organic — touching a soap bubble |
| Layers | Glass string pluck (2.5-4kHz) + thin air breath (1-6kHz sweep) + optional droplet (5-7kHz) |

### 5.1b — Route Node Pass (route_node_pass.wav)

| Parameter | Value |
|-----------|-------|
| Trigger | Route passes through / snaps to an ecological node |
| Duration | 0.15–0.20 seconds |
| Frequency Range | 500Hz–5kHz (wood: 500–1.5kHz, chime: 2–4kHz) |
| Reverb | Small room, 5ms pre-delay, 0.30s decay, 15% wet |
| Transient | Wood: hard attack (2ms), chime: soft attack (8ms); decay to -40dB in 0.18s |
| Character | Pleasant confirmation — repeatable 20+ times per session without fatigue |
| Layers | Muffled wood tap (500Hz-1.5kHz) + soft chime overtone (2-4kHz) |

### 5.1c — Route Complete (route_complete.wav)

| Parameter | Value |
|-----------|-------|
| Trigger | Player releases mouse, migration route is complete |
| Duration | 0.70–0.90 seconds |
| Frequency Range | 200Hz–8kHz (warm: 200-500Hz, glide: 500Hz-3kHz, crystals: 3-8kHz) |
| Reverb | Medium hall, 12ms pre-delay, 1.0s decay, 20% wet |
| Transient | Overall soft: warm breath (15ms), string glide (40ms), crystal points (5ms / 80ms) |
| Character | Conclusive but soft — like releasing a bird; NOT a victory fanfare |
| Layers | Warm breath swell (200-500Hz) + ascending micro-glide (minor 3rd) + crystal particles (3-8kHz, D major pentatonic) |

---

## 5.2 Species-Specific Sounds (8)

Design principles:
- Duration: 0.5–2.5 seconds, short 1-2 calls/sounds
- Trigger: Plays at drag-start alongside 5.1a (stacked or replacing)
- Species with calls → synthesized/recorded vocalizations
- Species without calls → characteristic environmental/behavioral sound

### 5.2a — Migratory Waterbird (species_bird.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | Has calls — waterbird vocalizations |
| Duration | 0.6–1.2 seconds |
| Pitch | Medium-high, crisp with slight airiness |
| Description | 1-2 crisp duck/goose calls, wetland dawn feel, each call 0.2-0.4s |
| Frequency | 800Hz–5kHz |
| Reverb | Wetland open space, 15ms pre-delay, 0.5s decay, 18% wet |

### 5.2b — Monarch Butterfly (species_butterfly.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | No call — collective wing-vibration hum of millions |
| Duration | 1.0–1.5 seconds |
| Pitch | Low-mid hum, 200-1500Hz |
| Description | Soft dense collective wing drone + light fir branch rustle |
| Frequency | 200Hz–1.5kHz |
| Reverb | Semi-enclosed forest, 10ms pre-delay, 0.6s decay, 15% wet |

### 5.2c — Bar-headed Goose (species_bar_goose.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | Has calls — high-altitude goose calls |
| Duration | 0.8–1.5 seconds |
| Pitch | Medium-high, higher/brighter than waterbird, slight vibrato |
| Description | 1-2 piercing calls from high altitude, thin mountain air |
| Frequency | 1kHz–6kHz |
| Reverb | Alpine space, 25ms pre-delay, 1.2s decay, 25% wet |

### 5.2d — Salmon (species_salmon.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | No call — leaping waterfall/rapids foley |
| Duration | 1.0–2.0 seconds |
| Pitch | Low-mid water sounds, 80Hz-4kHz |
| Description | Phase 1: bursting out of water (80-500Hz surge + whoosh), Phase 2: re-entry splash (200-1500Hz impact + 1-4kHz droplets) |
| Frequency | 80Hz–4kHz |
| Reverb | River valley, 20ms pre-delay, 0.8s decay, 15% wet |

### 5.2e — Wildebeest Herd (species_herd.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | Has calls — grunt-bellows |
| Duration | 0.8–1.5 seconds |
| Pitch | Low-mid, 100-800Hz, raspy, resonant |
| Description | 1-2 short low grunting calls from within a moving herd |
| Frequency | 100Hz–800Hz |
| Reverb | Vast grassland, 20ms pre-delay, 0.7s decay, 12% wet |

### 5.2f — American Eel (species_eel.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | No call — underwater movement foley |
| Duration | 1.0–2.0 seconds |
| Pitch | Low-frequency underwater, 60-600Hz |
| Description | Smooth sliding water displacement (60-400Hz) + subtle sediment brush (200-600Hz) |
| Frequency | 60Hz–600Hz |
| Reverb | Underwater/submerged space, 5ms pre-delay, 0.6s decay, 25% wet |

### 5.2g — Green Sea Turtle (species_sea_turtle.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | No call — surfacing breath foley |
| Duration | 1.5–2.5 seconds |
| Pitch | Low-mid breath, 100Hz-2kHz |
| Description | Phase 1: water surface parting (500Hz-2kHz), Phase 2: exhale (100-600Hz, 0.6s) + inhale (0.3s), Phase 3: gentle re-entry |
| Frequency | 100Hz–2kHz |
| Reverb | Vast ocean, 30ms pre-delay, 1.5s decay, 22% wet |

### 5.2h — Wood Frog (species_wood_frog.wav)

| Parameter | Value |
|-----------|-------|
| Sound Type | Has calls — wood frog vocalizations |
| Duration | 0.5–1.0 seconds |
| Pitch | Mid-high, 500Hz-3kHz, crisp and percussive |
| Description | 1-2 short duck-like "quack/clack" calls, each 0.1-0.2s |
| Frequency | 500Hz–3kHz |
| Reverb | Moist woodland, 10ms pre-delay, 0.5s decay, 18% wet |

---

## Synthesis Parameters Reference

### FM Synthesis for Animal Calls

| Species | Carrier (Hz) | Modulator (Hz) | Index | Notes |
|---------|-------------|----------------|-------|-------|
| Waterbird | 2200–2400 | 300–350 | 2.5–3.0 | Crisp, airy quality |
| Bar-headed Goose | 3200–3700 | 250–280 | 3.5–4.0 | Higher, more piercing |
| Wildebeest | 220–250 | 110–125 | 4.5–5.0 | Deep, resonant, raspy |
| Wood Frog | 1800–2000 | 600–650 | 4.5–5.0 | Short, percussive "clack" |

### Noise-Based Synthesis for Environmental Sounds

| Sound | Noise Type | Filter | Modulation |
|-------|-----------|--------|------------|
| Butterfly hum | Brown + white | 200Hz-1.5kHz BP | Slow 0.5Hz wobble |
| Salmon leap | Brown + white | 80Hz-4kHz (phased) | Envelope-driven |
| Eel movement | Pink + brown | 60-600Hz LP/BP | Slow 0.8Hz undulation |
| Turtle breath | Pink | 100Hz-2kHz (phased) | Envelope-driven |
| UI ethereal | White + sine | Various BP/HP | Envelope-driven |
