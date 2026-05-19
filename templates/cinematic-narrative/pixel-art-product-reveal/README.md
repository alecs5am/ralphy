# pixel-art-product-reveal

8-cut, ~15s, 9:16, music+SFX-only hyper-motion ad for a small cult-object gadget with its own distinct two-tone screen aesthetic. Photoreal hero device sits as a HARD layer-split cutout against a smooth hand-illustrated duotone halftone-dithered world. The product is the only color in the frame. Ends on a wordmark + tagline lockup over the brand's signature chroma slab.

Extracted from `workspace/projects/playdate-pixel-001/` (Playdate by Panic). Generalized to any indie-handheld / cult-object gadget with a similar two-tone aesthetic.

## At a glance

- **Kind:** `vibe-style` (prompt cookbook + hooks + camera vocabulary + worked examples; NO generic Remotion composition — clone the source project's `src/videos/playdate-pixel-001/` structure)
- **Category:** `cinematic-narrative`
- **Format:** 1080×1920, 30fps, ~13–17s, 8 cuts averaging ~1.9s
- **Audio:** music-only (ElevenLabs Music), no VO
- **Reference-required:** yes — this template only makes sense for a SPECIFIC real product with a public illustration corpus

## Cost ballpark

| Phase | Cost |
|---|---|
| Stills (14 keyframes) | ~$2.50–$2.80 |
| i2v (8 clips, seedance-2.0) | ~$4.80–$5.60 |
| Music (5 parallel variants, ElevenLabs) | subscription |
| **Cold-run total** | **~$7.50–$8.50** |

Add ~$3 if v1 stills miss aesthetic (almost always happens if you don't pull canonical product art first — see TEMPLATE.md Key Rule #1). Hard ceiling: ~$15 before stop.

## Quickstart

```bash
# Scaffold a new project from this template
ralphy template use pixel-art-product-reveal --project <my-id> \
  --brief "A 15s hyper-motion pixel-art reveal for <product> by <brand>"

# Read the template's TEMPLATE.md + prompt-cookbook.md
# Fill the slot map (see TEMPLATE.md "Required inputs" table)
# Pull 8-15 atomic style refs from the brand site BEFORE writing prompts
# Run the pipeline per TEMPLATE.md "Workflow" section
```

## File map

| File | What |
|---|---|
| `template.json` | Metadata, slug, kind, category, tags, stack summary, slot definitions |
| `TEMPLATE.md` | **The main doc** — vibe, Key rules, Workflow, Required inputs, Anti-patterns, Beat structure |
| `prompt-cookbook.md` | Per-stage paste-into-ralphy prompts with `{{slot}}` placeholders |
| `model-stack.md` | Exact model picks, costs, what worked, what we dropped, ffmpeg recipes |
| `hooks.md` | 5 reusable 0–2s scene-01 hook patterns |
| `examples.md` | 2 worked variants (Playdate + hypothetical Polaroid I-2) |
| `assets/` | 6 example reference images (canonical product front + three-view + 4 atomic style refs) — replace with the consuming brand's actual refs |

## Required inputs

The slot map (see TEMPLATE.md for descriptions + Playdate values):

- `{{product_name}}`
- `{{product_brand}}`
- `{{product_brand_color_hex}}` + `{{product_brand_color_name}}`
- `{{product_physical_form_factor}}`
- `{{product_gimmick}}` + `{{product_gimmick_verb}}`
- `{{duotone_dark_hex}}` + `{{duotone_light_hex}}` + `{{duotone_palette_words}}`
- `{{style_ref_corpus_names}}` (4-6 named brand-illustration works)
- `{{ensemble_cast_4}}` (4 mascots / personifications for scene-04 runway)
- `{{wordmark_text}}` + `{{tagline_text}}`
- `{{target_audience}}`

## The non-negotiables

1. **NOT chunky 8-bit pixel art.** The load-bearing phrase. The aesthetic is smooth hand-illustrated halftone duotone, NOT Game Boy-style sprite blocks.
2. **The product is the ONLY color in the frame.** Strict duotone everywhere else.
3. **HARD layer split, no painterly blend.** Photoreal hero device + flat duotone world.
4. **Pull canonical refs FIRST.** 8-15 atomic refs from the brand site before any prompt.
5. **Lock visual cuts + DURATION_SEC BEFORE generating music.** Reversing wastes 10 min.
6. **Strip brand names from music prompts.** ElevenLabs ToS filter is aggressive.
7. **No `kling-v3.0-pro` multi-frame.** Broken on OpenRouter, confirmed across two postmortems.

## Reference example

Source project: `workspace/projects/playdate-pixel-001/`
- Final renders: `render/final.mp4` + 4 alternate music variants
- Storyboard: `STORYBOARD.md`
- Postmortem: `postmortem/02-lessons.md` (the rules above all come from here)
- Aesthetic anchor: `.prompts/_aesthetic_v2.txt`

The Playdate render is the canonical "what this template produces" reference. Watch it before consuming the template — it teaches the aesthetic in 15 seconds that the docs take 200 lines to describe.
