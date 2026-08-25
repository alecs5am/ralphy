---
name: json-prompt-engine
namespace: user
description: >-
  Analyze a reference image (or video frame) and emit a ready-to-paste structured JSON prompt that captures every visual quality needed to reproduce it through `ralphy generate image --prompt-file`. The reverse of the prompt cookbook: image in -> dense JSON prompt out (scene / style / technical / materials / environment / composition / quality blocks; add a `motion` block for image-to-video). Adapts the schema to ralphy's model stack — `gemini-3-pro-image-preview` for multi-ref consistency, `gpt-5.4-image-2` for crisp typography — and folds any matching `@guideline:<slug>` rules into the quality block.
  USE WHEN the user uploads or points at a reference image and asks for a prompt, "JSON prompt", "image-to-prompt", "reverse-engineer this image", "recreate this image", "describe this in prompt format", "give me the prompt for this style/look", or wants a per-slide JSON prompt for a carousel.
  DO NOT FIRE for conversational "what is in this image" questions, image editing, or when the user already has a brief and only wants generation (that is the art-director playbook). This runs THROUGH `ralphy generate`, it does not bypass the reference-required gate or the quality gate.
---

## Trigger

**FIRES** when the user has a reference (an uploaded image, a local path, a frame pulled from a video) and wants the *prompt that would reproduce it*: "give me a JSON prompt for this", "image-to-prompt", "reverse-engineer this image", "recreate this look", "describe this in structured prompt format", "what prompt makes this", "turn this reference into a prompt", "per-slide prompts for this carousel style".

**DO NOT FIRE** when:
- The user asks a conversational visual question — "what is in this image", "is this photoshopped" — that is plain vision, not a prompt request.
- The user wants to *edit* an existing image (inpaint, swap, restyle) -> that is an `iteration-edit` generation, route to the art-director playbook.
- The user already has a written brief and just wants assets generated -> [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) drives that; this skill is only for the image -> prompt direction.
- The user points at a video URL for *style analysis* across the whole clip -> use `ralphy ref analyze-video` (memory: `feedback_ralphy_ref_analyze_video`) or the `/researcher` skill, then optionally come back here to emit the JSON for one extracted frame.

## What this skill is

The inverse of `docs/prompts/image/` (the mode-by-mode prompt cookbook). The cookbook takes a *brief* and fills slots; this skill takes a *finished image* and recovers the dense prompt that would regenerate it. The output is one valid JSON object per reference, written to `.ralphy/workspaces/<ws>/projects/<id>/prompts/<slot>.json` and fed to `ralphy generate image --prompt-file`. It is a craft overlay on the art-director step, not a replacement for it.

## Hard invariants

- **Route through `ralphy generate image --prompt-file <path>`.** Never paste raw provider API code, never `curl` openrouter, never call a model SDK directly (AGENTS.md invariant #1/#2). The JSON you emit is the *prompt body* — JSON-structured prompts are an established ralphy pattern (the carousel and fb-creatives skills use the same STYLE + QUALITY block shape).
- **Read `MODELS.md` before naming any model id.** The stack below is the default as of 2026-05-20, not a hardcode. Default image model: `google/gemini-3-pro-image-preview` (multi-ref consistency). Premium typography / legible-label work: `openai/gpt-5.4-image-2`. Match the model to the `quality` profile you write (see Cookbook).
- **Reference-required gate still fires.** If the recovered prompt names a real person, a recognizable branded product, or an IP (AGENTS.md invariant #3), the *source image itself* is the ref — pass it on the generate call with `--ref <path>`. If the user only wants the JSON text and no generation, that is fine; the gate fires when they ask to *generate*.
- **Fold in the matching guideline.** If the reference sits in a register the guideline library covers (photoreal humans, broadcast realism, anti-AI-slop), run `ralphy guideline show <slug>` and merge its `avoid` cluster and required tokens into the JSON `quality` block before handing the prompt off (AGENTS.md invariant #13). The `quality.avoid` array is exactly where the anti-AI-slop negative cluster belongs.
- **Quality gate refuses, not warns.** When you do generate, two failed `scoreImage` in a row -> stop and report concrete options. Do not keep re-rolling silently.
- **English only on disk.** Every JSON value you write to a `prompts/*.json` file is English, even if the user is chatting in another language.

## Workflow

1. **Look at the reference.** For an uploaded / local image, read it with the `Read` tool. For a video, pull a frame first (`ralphy ref pull <slug>` -> frames, memory: `feedback_ralphy_ref_analyze_video`) and read that. Identify every visual element: subject, style, lighting, materials, textures, environment, composition, camera angle, colour palette, mood, and ALL visible typography / UI text.
2. **Categorize** each observation into the schema sections below.
3. **Emit one valid JSON object** per reference (the section "Response Format" defines the chat layout).
4. **If the user wants generation**, write the JSON to `.ralphy/workspaces/<ws>/projects/<id>/prompts/<slot>.json`, pick the model per the Cookbook, fold in any guideline, then call `ralphy generate image --prompt-file <path> --model <id> [--ref <source-image>]`. Auto-versioning protects any existing slot file (AGENTS.md invariant #14).
5. **Provide a 3-5 sentence plain-English breakdown** of the key creative decisions so the user can tweak.
6. **Suggest 1-3 concrete tweaks** (a lighting swap, a focal-length change, a palette shift).

## Response Format

Three sections, in this exact order:

### Analysis
3-5 sentences on what you observe and the key creative decisions you are encoding.

### JSON Prompt
The full JSON block following the schema below.

### Tweaks
1-3 optional variations (e.g. "swap to dramatic side-lighting", "try 35mm for a wider environmental feel", "darken the background to charcoal for a moody version").

## The JSON schema

Populate each section from what you observe. **Omit sections that are not relevant — do not pad with generic filler.** For image-to-video, add the `motion` block (see Video prompts).

```json
{
  "prompt": {
    "scene": {
      "description": "One dense, detailed paragraph covering subject, action, setting, mood, dominant colour palette, and ALL typography/UI elements with exact text. The single most important field — write it so it could stand alone as a complete image prompt.",
      "subject": "Primary subject with specific physical details (pose, clothing, expression, object specifics)",
      "setting": "Location, environment, context, period/era if relevant",
      "action": "What is happening — or 'static' with description if nothing is moving"
    },
    "style": {
      "primary": "photorealistic | cinematic | documentary | editorial | fine art | commercial | illustrated | painted | [describe specific style]",
      "rendering_quality": "hyperrealistic | detailed | high-resolution | stylized",
      "surface_textures": "Dominant texture treatment across the scene",
      "lighting": "Direction, quality, colour temperature, number of sources, how light interacts with the scene"
    },
    "technical": {
      "camera": {
        "focal_length": "exact mm — 24mm, 35mm, 50mm, 85mm, 100mm macro, 200mm",
        "aperture": "exact f-stop — f/1.4, f/1.8, f/2.8, f/4, f/5.6, f/8, f/11",
        "depth_of_field": "very shallow | shallow | moderate | moderate-shallow | deep — plus what is sharp vs soft",
        "angle": "eye level | low angle | high angle | overhead | dutch angle | first-person POV | three-quarter overhead | [degrees]"
      },
      "resolution": "high definition | ultra high definition | 2K | cinema-grade | editorial print quality",
      "rendering": "Shutter-speed effects, noise/grain character, colour depth, bokeh quality, post-processing look",
      "physics_accuracy": "Light behaviour specifics — refraction, caustics, reflection accuracy, shadow directionality (only if relevant)"
    },
    "materials": {
      "skin": "Pore detail, natural imperfections, ethnic diversity details, jewellery, tattoos (only if people present)",
      "fabric": "Thread patterns, realistic drape, wear indicators, fabric types and weights (only if fabric present)",
      "surfaces": "Scratches, patina, oxidation, natural irregularities — each distinct surface material",
      "transparency": "Refraction accuracy, surface interactions, liquid behaviour, glass properties (only if transparent elements present)"
    },
    "environment": {
      "atmosphere": "Distance haze, fog, weather, humidity, volumetric light, air quality",
      "time": "Time of day, season, temperature cues, natural vs artificial light mix",
      "particles": "Dust, moisture, smoke, steam, pollen, rain — anything suspended in the air"
    },
    "composition": {
      "perspective": "Perspective type, vanishing points, depth layering, leading lines",
      "framing": "rule of thirds | golden ratio | centered | symmetrical | frame-within-frame | split layout | [describe]",
      "subject_placement": "Precise positioning, visual weight distribution, eye path",
      "ui_elements": "EXACT text for every visible text element — headers, taglines, body copy, labels, slide counters, brand handles. Specify font style, weight, colour, alignment, position for each. Only include if the reference contains visible text."
    },
    "quality": {
      "include": ["8-12 positive quality keywords specific to THIS image"],
      "avoid": ["6-10 failure modes specific to THIS image"],
      "reference_standard": "Real-world photographer / publication / film / design system whose visual language matches"
    }
  }
}
```

## Core rules

1. **Be specific, not generic.** "Warm golden-hour sunlight raking across the subject at 15 degrees from camera-left" beats "natural lighting".
2. **Match the reference's actual qualities.** Do not default to "photorealistic" if it is illustrated; do not add cinematic grain to clean commercial photography. Describe what you see.
3. **Separate distinct objects.** Person + table + window -> describe each one's materials, lighting interaction, and spatial relationship independently.
4. **Omit irrelevant sections.** A landscape needs no `skin`; a product-on-white needs no `environment` particles; a studio shot drops the whole `environment` block.
5. **Validate the JSON before output.** Correct brackets, commas, quotes — no trailing commas. It must paste into a `--prompt-file` with zero edits.
6. **The `quality` block is non-negotiable.** Always include `include` + `avoid` tailored to this image. This is the slot where a folded-in `@guideline` negative cluster lives.
7. **Camera settings must match the look.** Very blurry bg -> f/1.4-f/2.0 · moderately soft -> f/2.8-f/4 · mostly sharp -> f/5.6-f/8 · all sharp -> f/11-f/16. Telephoto compression -> 85-200mm · normal -> 50mm · environmental -> 24-35mm · exaggerated foreground -> 16-24mm.
8. **Put the dominant palette in `scene.description`.** Include hex codes for branded content (trace brand hex to a real source — site-grounding, AGENTS.md invariant #15 — never invent a brand colour).
9. **Spell out every visible text element exactly in `ui_elements`** — character-for-character, with font style / weight / colour notes. Never paraphrase a headline.

## Section-specific guidance

- **scene** — `description` is the load-bearing field; write it as a standalone paragraph and include the palette there.
- **style** — common pairings: street/doc -> documentary + available light; studio product -> commercial + hyperrealistic + controlled studio light; film still -> cinematic + graded + dramatic; magazine -> editorial lifestyle + mixed light; fine art -> expressive textures; illustrated -> vector flat / digital painting + stylized.
- **technical** — camera settings are inferred from the image per rule 7.
- **materials** — only the visible subsections; describe imperfections and wear — that is what reads as real.
- **environment** — skip entirely for studio-on-seamless; be specific for outdoor / atmospheric shots.
- **composition** — `ui_elements` is critical for carousels, posters, infographics, magazine covers — treat every text element as its own object.
- **quality** — `include` = 8-12 strengths of THIS image; `avoid` = 6-10 failure modes for THIS image (this is where the anti-AI-slop / guideline negative cluster goes); `reference_standard` cites a real photographer / publication / film / design system.

## Video prompts (image-to-video)

When the output feeds `ralphy generate video` (image-to-video off this still), add a `motion` block. Read `MODELS.md` for the current video stack — `kwaivgi/kling-v3.0-pro` for photoreal-human anchors, `bytedance/seedance-2.0` for cartoon / non-human / abstract motion. The start and end frames must show a distinct physical beat (memory: `feedback_start_end_frame_motion_delta`).

```json
"motion": {
  "camera_movement": "static | slow pan | tracking | dolly | handheld | crane | orbit",
  "subject_movement": "Describe the specific movement of subjects or elements",
  "duration_feel": "brief moment | sustained | continuous | looping",
  "speed": "real-time | slow motion | time-lapse | hyperlapse"
}
```

## Multiple images, carousels, modifications

- **Multiple references in one message** -> one JSON object per image, labelled (Image 1, Image 2, ...); note shared visual language at the end.
- **Carousel / multi-slide** -> one JSON per slide, numbered (1/N, 2/N, ...). Keep the `style`, `composition` system, and typography **locked** across slides; only `scene` + `ui_elements` change per slide. This dovetails with the `/carousel` skill's reusable STYLE + QUALITY block convention.
- **Adjusting a previous prompt** -> output the full updated JSON (not a diff) and note what changed and why.

## Outputs

- Chat: Analysis -> JSON Prompt -> Tweaks (the Response Format).
- On disk (only when generating): `.ralphy/workspaces/<ws>/projects/<id>/prompts/<slot>.json` written via the agent, then the generated image under `.ralphy/workspaces/<ws>/projects/<id>/assets/` by `ralphy generate image`. Both are append-only / auto-versioned (AGENTS.md invariant #14).

## Cookbook

```bash
# 1. (video source only) pull a frame to analyze
ralphy ref pull <slug>                          # then Read the extracted frame

# 2. write the recovered JSON prompt to the project's prompts dir, then:
#    typography / legible-label reference -> gpt-5.4-image-2
ralphy generate image \
  --project <id> \
  --prompt-file .ralphy/workspaces/<ws>/projects/<id>/prompts/<slot>.json \
  --model openai/gpt-5.4-image-2 \
  --ref <source-image>            # ref required only for a named real entity

#    multi-ref / character-consistency reference (default) -> gemini-3-pro-image-preview
ralphy generate image \
  --project <id> \
  --prompt-file .ralphy/workspaces/<ws>/projects/<id>/prompts/<slot>.json \
  --model google/gemini-3-pro-image-preview

# 3. fold a guideline into the quality block before generating, when one applies
ralphy guideline list
ralphy guideline show <slug>       # merge its avoid-cluster into quality.avoid
```

See [`references/example.md`](references/example.md) for a worked reference -> JSON -> tweaks pass.

Related: [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) (the generation step this feeds), `docs/prompts/image/` (the forward cookbook this inverts), [`/poster`](../poster/SKILL.md), [`/carousel`](../carousel/SKILL.md), [`/fb-creatives`](../fb-creatives/SKILL.md), and the guideline library (`ralphy guideline list`, `/library` on the landing).
