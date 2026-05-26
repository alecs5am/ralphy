---
name: storyboard-generation
description: |
  Rules and prompts for generating structured presentation slides and multi-panel storyboards.
license: MIT
---

# Storyboard & Presentation Slide Generation

When generating full storyboard slides or presentation decks (typically using imagegen_2_0), follow these rules:

Strict Containment: The prompt must explicitly instruct the model to fit all photo cards, text blocks, and UI elements entirely within the slide boundaries. Nothing should be cropped or cut off at the edges. Use phrases like: "All photo cards fully inside slide boundaries, nothing cropped."
Resolution & Aspect Ratio: Use aspect_ratio: "16:9" (or the requested slide format) and resolution: "1k" or "2k" to ensure text legibility and clean, sharp layouts. 1080p is an invalid resolution for imagegen_2_0 — never use it.
Layout Definition: Clearly delineate rows and columns in the prompt structure (e.g., LAYOUT: 2 rows. Row 1: two equal columns (E1 left, E2 right)...) so the model organizes the elements logically.
Reference Adherence: If replicating or modifying an existing layout, explicitly instruct the model to maintain the exact typography, icon set, card style, and background color.
Timeline Bars: When visualizing a continuous shot or multi-scene sequence, explicitly prompt for a gradient timeline bar at the very bottom (e.g. Timeline bar at very bottom: gradient line from left (slow) to right (fast), labeled...).
Consistency: Keep the lighting, time of day, and environmental context consistent across the panels on a single slide unless explicitly contrasting states (like a Before/After).
Complex Storyboards (Film/Video): When building multi-panel film storyboards, use a structured JSON prompt with strict formatting directives (e.g., dark charcoal background #1a1a1a, white 2px borders around panels, specific typography for labels). Use cyan for camera movement overlays, yellow italic for audio, green for transitions. Embed a structured data block below each panel (Shot Type, Lens, Camera Path, Audio, Transition).
Camera Movement Overlays: Explicitly prompt for arrows and diagrams drawn directly on the image panels (e.g., "curved cyan arc arrow showing orbit", "bold downward arrow labeled VERTICAL PLUNGE") to simulate professional director storyboards.
Empty Panels for Re-use: When you need a storyboard panel that serves only as a structural placeholder (e.g., removing a character but keeping the text/layout), prompt the model for an explicitly empty dark frame: "COMPLETELY EMPTY dark panel — solid dark charcoal background, NO photo, NO person, NO image. Just the dark background with a subtle dark grey rectangle placeholder outline."
