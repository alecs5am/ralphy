---
name: cinematic-motion-language
description: |
  This skill provides the five-pillar language system for constructing video prompts with cinematic precision. Apply it to any video generation task — atmosphere shots, product reveals, character scenes, abstract motion, sacred/spiritual visuals, or any brief where imprecise language would produce unpredictable results.
license: MIT
---

# Cinematic Motion Language

## Purpose

This skill provides the five-pillar language system for constructing video prompts with cinematic precision. Apply it to any video generation task — atmosphere shots, product reveals, character scenes, abstract motion, sacred/spiritual visuals, or any brief where imprecise language would produce unpredictable results.

The core principle: the model understands physics, geometry, sequence, and constraint — not adjectives. Replace every vague descriptor with a physical analogy, spatial coordinate, temporal sequence, or hard rule.

## The Five Pillars

- 1. Camera Contract

State the camera's behavior as a hard rule before describing anything else. The model treats the camera as a character — define it or it will improvise.

Examples:

- "Static locked-off camera. Zero movement. No pan, no zoom, no dolly, no shake."
- "Slow push-in only — 10% scale change over the full duration."
- "Single handheld drift, slight organic sway, no cuts."
- Always reinforce camera rules in the negative prompt as well.

## 2. Motion Physics Anchor

Give every moving element a speed reference from the physical world, not an adjective. Pair physical analogies with time-anchored measurements for maximum precision.

Speed analogy examples:

- "like dust suspended in honey"
- "like embers floating in still air"
- "like smoke through a cathedral at dawn"
- "like the surface of a lake disturbed by a single drop"

Time-anchored measurements:

- "one full revolution across the entire 10-second clip"
- "roughly 6 degrees per second"
- "the pace of a clock's hour hand — imperceptibly slow"
- "travels the full arc in 8 seconds with no pause"
- Never use "slow", "fast", "gentle", "subtle" alone — always anchor to physics or time.

## 3. Spatial Zoning

Divide the frame into named regions and assign explicit rules to each. This prevents the model from filling empty space with invented content.

Region naming conventions:

- "Left third / center third / right third"
- "Foreground plane / midground / background"
- "Upper half / lower half"
- "Right two-thirds / left void"

Example zone rules:

- "Left third: pure black, no light, no particles, no movement."
- "Right two-thirds: all action contained here."
- "Foreground plane: particle layer only — no subject."
- "Background: unlit void, no detail."
- Always cross-reference spatial zones in the negative prompt.

## 4. Lens Behavior Sequence

Describe focus and depth of field as a narrative event with a beginning, middle, and end. Models can simulate focus-breathing, rack focus, and lens diffusion — but only when the sequence is described explicitly as cause and effect.

## Structure: trigger → shift → state → return → repeat

Example: "Focus opens on the subject. As the foreground element crosses the lens plane, focus shifts onto it — the subject softens into warm bokeh. The element drifts past. Focus breathes back to the subject. This cycle repeats organically 2-3 times."

Key lens vocabulary:

- "shallow depth of field"
- "focus-breathing" — organic in/out shift
- "rack focus" — deliberate, directional shift between two subjects
- "bokeh silhouette" — subject dissolves into soft out-of-focus warmth
- "lens plane crossing" — the moment a foreground element passes between camera and subject
- "anamorphic lens rendering" — oval bokeh, horizontal flare character, widescreen feel

## 5. Negative Space as Compositional Tool

Name empty areas of the frame as intentional design decisions, not absences. Then reinforce them in the negative prompt.

Examples:

- "Sacred emptiness — the left third is a deliberate compositional weight."
- "No light bleed into the dark half."
- "The darkness is active, not background."
- "Void occupies the left two-thirds — no fill, no ambient spill, no movement."

Negative prompt reinforcement:

- "particles on the left side, light on the left side, movement on the left side"

## The Prompt Template

Use this structure for every high-precision video brief:

CAMERA: [static / push / drift / handheld — state as a hard rule]
ASPECT RATIO: [21:9 / 16:9 / 9:16]
DURATION: [X seconds]

## Style & Mood: [visual register + atmosphere in one line]

Narrative: [one sentence — what happens]

Action:
- Subject: [who/what, position in frame, emotional state]
- Motion: [speed anchor — physical analogy + time measurement]
- Secondary motion: [particles / fabric / smoke — own speed anchor]

Lens:
- Focal feel: [wide / normal / telephoto character]
- Focus event: [cause → shift → state → return → repeat count]
- DoF: [shallow / deep / breathing]

## Lighting: [source count, direction, quality, color temperature]

Spatial Zones:
- [region]: [rule]
- [region]: [rule]
- [region]: [rule]

Audio: [sound texture description — not music genre]

## Quality suffixes: [photoreal, film grain, anamorphic, 8K detail, etc.]

Negative Prompt: [camera moves, spatial violations, style rejections, motion violations]

## Key Vocabulary Reference

Camera
static locked-off / handheld drift / slow push-in / crane reveal / whip pan / zero movement / no reframe / locked composition

## Motion Speed

suspended in honey / floating in still air / cathedral smoke / hour-hand pace / imperceptibly slow / continuous fluid arc / no acceleration / no stillness

## Particle Behavior

three-dimensional spiral / orbiting / foreground crossing / contained within zone / rising and descending in soft arcs / catching directional light / swirling behind and around

## Lens / Focus

shallow depth of field / focus-breathing / rack focus / bokeh silhouette / lens plane crossing / anamorphic rendering / focus returns organically / sharp foreground — soft midground — void background

## Lighting

single key light / directional warm / chiaroscuro / golden-amber / deep shadow / no fill / no ambient spill / upper right source / rim light / backlight halo

## Negative Space

sacred emptiness / pure black void / no light bleed / no particles / no movement / deliberate compositional weight / active darkness

## Advanced Techniques

references/implied-off-screen-motion.md: How to choreograph limbs/props moving through a locked frame to imply a body rotating or moving outside the camera's view.
Worked Example — Dervish Shot
Brief: Whirling dervish, close-up of raised hand and forearm, golden dust particles, pure black left third, sacred Sufi atmosphere.

Camera: Static locked-off. Zero movement. No pan, no zoom, no dolly.

Motion anchor: Hand traces the arc of one full Sama rotation over 10 seconds — the pace of a clock's hour hand. Particles move like embers in still air.

Lens event: Foreground particles cross lens plane → focus shifts to particles (sharp, glowing) → hand softens to warm bokeh → particles drift past → focus returns to hand. Cycle repeats 2-3 times organically.

Spatial zones:

- Left third: pure black, no particles, no light, no movement.
- Right two-thirds: all motion contained here.
- Foreground plane: particle layer, passes in front of hand.
- Lighting: Single warm key from upper right. Deep chiaroscuro. Golden-amber on black.

Negative prompt: camera movement, pan, zoom, dolly, shake, fast motion, fast particles, particles on the left side, light on the left side, acceleration, abrupt cuts, cartoon, anime, strobing.
