---
name: cod-ultimate-thumbnail
description: |
  The master workflow for Jamey "Quix". Transforms CoD screenshots into 3D Blender-style renders, composites them onto backgrounds, and applies a heavy YouTube thumbnail enhancement stack focused on weapon sharpness and vibrant (but controlled) environments.
license: MIT
---

# CoD Ultimate Thumbnail Workflow

This is the consolidated production pipeline for Quix. It combines 3D rendering, environmental compositing, and thumbnail enhancement into a prioritized sequence.

## Trigger

Use this when the user (Quix) provides a weapon screenshot (and optionally a background) and asks for a "render", "composite", "thumbnail", or "enhance".

## The Pipeline

- Phase 1: The Blender Render (Blender Look + Better Lighting)

Even if compositing later, the weapon must first be transformed from flat game graphics into a photorealistic 3D asset.

## Model: nano_banana_2

Goal: Convert game camo/meshes into PBR materials (glossy metals, emissive glows, subsurface scattering on skin).
Lighting: Three-point studio lighting (Soft Key, Fill, Rim).
Look: "Blender Cycles path-traced render, ultra-detailed photorealistic 3D model."
Phase 2: The Composite (Environment Integration)
If a background is provided, the Phase 1 render is placed into the scene.

Model: imagegen_2_0 (or nano_banana_2 if matching exact pixels is critical).
Lighting Match: The lighting from the render must be adjusted to match the background environment's color temperature and direction.
Phase 3: The Quix Enhancement (Aggressive Focus + Controlled Background)
The final pass that makes the image "stop the scroll."

Foreground Priority: Aggressive sharpening on weapon body, hex patterns, and camos. Razor-crisp edges.
Background Control: Vibrant and clear sky/environment, but with a slight radial zoom blur to ensure the weapon is the undisputed subject.
No Vignette: Avoid dark edges. Quix prefers clean, bright, and punchy.

## Prompt Construction

3D Render & Placement Prompt (Unified Pass 1)
If you have both a weapon and a background, you can often run this as a single high-quality pass:

text

Composite the weapon inspect from reference 1 onto the environment in reference 2. 

RE-RENDER the weapon as a high-end 3D Blender Cycles render:
- Transform the [name/description of camo] into a PBR material with metallic reflectivity and soft emissive bloom on glowing parts.
- Preserve the exact first-person silhouette and hand placement from reference 1.
- Apply high-end studio lighting to the weapon: soft highlights on the upper surfaces, subtle rim light to separate it from the background.

ENVIRONEMENT & COMPOSITION:
- Place the weapon naturally into the [background map] from reference 2.
- Match lighting color temperature and direction from the background onto the weapon/hands.
- Foreground weapon must be aggressively sharpened and razor-crisp.
- Add a slight radial zoom blur to the background environment to draw focus to the weapon.
- Boost overall vibrancy and saturation, keeping the sky vivid but the background environment slightly softened compared to the hyper-sharp weapon.

Absolutely NO text, NO UI, NO HUD, NO minimap, NO vignette, NO dark edges. Clean YouTube thumbnail plate.
Model Selection & Parameters
Generator: imagegen_2_0 (GPT Image 2) for the best text/detail control, or nano_banana_2 for strict pixel preservation of the weapon silhouette.
Resolution: 2k (mandatory for Quix's sharpness requirements).
Quality: high.
Aspect Ratio: 16:9.

## Multi-Image Handling

medias[0]: Weapon Inspect Screenshot (media_input)
medias[1]: Background/Map Screenshot (media_input)
Pitfalls
Don't over-blur the background: Quix wants it "vibrant but not too much" and "controlled." Keep the background blur subtle (slight camera zoom feel) rather than a heavy gaussian wash.
Focus is the Weapon: All sharpening and contrast boosts should be centered on the weapon and camo details.
