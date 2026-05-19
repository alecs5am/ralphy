# Examples — pixel-art-product-reveal

Two worked variants. Different products. Different brand colors. Same template framework.

The point of these examples is to show how the slot map travels across very different brands while the template's DNA (duotone halftone world + photoreal hero device + hard layer-split + 8-cut hyper-motion + chroma slab outro) stays exactly the same.

---

## Example 1 — Playdate (the source project)

The canonical instance. `workspace/projects/playdate-pixel-001/render/final.mp4` is the reference render.

### Slot fill

| Slot | Value |
|---|---|
| `{{product_name}}` | Playdate |
| `{{product_brand}}` | Panic |
| `{{product_brand_color_hex}}` | `#FFD400` |
| `{{product_brand_color_name}}` | bright yellow |
| `{{product_physical_form_factor}}` | small handheld game system, ~76×74×9 mm, rounded corners, four flat-head screws, black bezel surrounding a 1-bit Sharp Memory LCD (400×240, monochrome, no backlight, super-reflective), yellow plus-shaped (+) D-pad on the left, two yellow round buttons labeled "B" and "A" on the right |
| `{{product_gimmick}}` | silver/aluminum crank handle flipped out from the right edge — small metal lever with a knurled grip |
| `{{product_gimmick_verb}}` | cranks |
| `{{duotone_dark_hex}}` | `#3D3A30` (charcoal-olive) |
| `{{duotone_light_hex}}` | `#B0AB94` (putty-cream) |
| `{{duotone_palette_words}}` | warm charcoal-olive newspaper-ink on light putty-cream newsprint |
| `{{style_ref_corpus_names}}` | Casual Birder, Crankin's Time Travel Adventure, Demon Quest '85, Forrest Byrnes Up In Smoke, Sasquatchers, Pick Pack Pup, Inventory Hero, Hyper Meteor |
| `{{ensemble_cast_4}}` | Casual Birder (twee binoculars character, square head), Pick Pack Pup (cartoon dog with sack), Whitewater Wipeout (surfer dude on a board), Inventory Hero (cartoon knight with comically overloaded backpack) |
| `{{wordmark_text}}` | playdate |
| `{{tagline_text}}` | Just for fun. |
| `{{target_audience}}` | indie-game-curious Gen Z + Millennials on TikTok / Reels |

### Result

- 5 rendered variants at 1080×1920, ~15.0s, 30fps — one per music bed
- Total spend: ~$12.70 (~$2.80 stills + ~$5.20 i2v + music subscription)
- Winner: `music-c` (arcade-pop chiptune) per user pick
- Source files: `workspace/projects/playdate-pixel-001/`

### What was distinctive

- The hand-orbit scene (scene-03) is the headline shot — photoreal hand against duotone halftone world, 180° orbit, gimmick rotating with timed screen-content progression
- The 24-tile grid-explode (scene-05) is the info-density payoff — sells the "Season One has 24 games" message
- The wordmark in the outro matches the actual `play.date` landing-page logo exactly (custom illustrated lowercase, rounded modular sans)

---

## Example 2 — Polaroid I-2 (hypothetical variant, white-on-black duotone)

A new instance of the template applied to a different cult-object camera. Same framework, different slot fills.

### Slot fill

| Slot | Value |
|---|---|
| `{{product_name}}` | Polaroid I-2 |
| `{{product_brand}}` | Polaroid |
| `{{product_brand_color_hex}}` | `#FFFFFF` (the iconic Polaroid white front-plate) — note: this is the EXCEPTION to "no pure white in the environment" since the device frame itself is white. The duotone world stays charcoal-on-cream; only the device + its white plate carry the chroma role. |
| `{{product_brand_color_name}}` | matte white |
| `{{product_physical_form_factor}}` | premium instant camera, ~150×118×95 mm, white front-plate over black body, large round lens housing on the front with autofocus collar, viewfinder dome on top-left, exposure dial on top-right, instant-film slot at the bottom front, shutter button on top |
| `{{product_gimmick}}` | manual aperture / shutter-speed dial on top of the camera that physically twists with notched detents |
| `{{product_gimmick_verb}}` | twists |
| `{{duotone_dark_hex}}` | `#1A1A1A` (rich black) |
| `{{duotone_light_hex}}` | `#E8E0CC` (warm bone) |
| `{{duotone_palette_words}}` | rich blackbook ink on warm bone paper |
| `{{style_ref_corpus_names}}` | the iconic Polaroid OneStep illustrated manuals from 1977, the Andy Warhol Polaroid portraits, hand-drawn pinhole-camera diagrams from a vintage photography zine |
| `{{ensemble_cast_4}}` | the Photographer (smooth-illustrated figure with cap), the Subject (smiling person in mid-pose), the Print (a Polaroid photo dancing on its corner), the Lens (anthropomorphized round lens with eyebrows) |
| `{{wordmark_text}}` | Polaroid |
| `{{tagline_text}}` | Make the moment. |
| `{{target_audience}}` | photography enthusiasts + retro-tech-curious Millennials on Reels |

### Result (projected)

- Same 8-cut, ~15s, 9:16 skeleton
- scene-03 hero shot: photoreal hand twisting the aperture dial, 180° orbit, the illustrated halftone "Photographer" character winks on the optional rear-screen mock
- scene-04 ensemble runway: the 4 personified characters run across the white front-plate
- scene-05 grid-explode: a grid of illustrated halftone Polaroid prints fans out — each print's interior is a different illustrated scene
- scene-06 outro: the iconic Polaroid wordmark over a full-bleed warm-bone slab; the tagline pixel-types in

### Differences from Example 1

- **The chroma is a NEUTRAL (white) instead of a saturated chroma.** Works because the deep-black bone palette + white device creates the same single-color-pop dynamic, just on a different value axis.
- **No public 24-tile content catalog.** The grid-explode is repopulated with hand-illustrated Polaroid photos as content tiles — each one a small illustrated halftone scene. The template structure stays, the content swaps.
- **The gimmick is a twist-dial instead of a crank.** scene-03 orbit timing stays the same; the gimmick verb in every prompt changes from "cranks" to "twists" and the gimmick motion from "270 degrees" to "two notched detents".
- **The ensemble is anthropomorphized objects, not platform mascots.** Because Polaroid doesn't have a named-character corpus the way Panic does, the runway scene uses brand-adjacent personifications (Photographer / Subject / Print / Lens) drawn in the brand's vintage-manual register.

---

## How the template travels (the abstraction)

Compare Example 1 and Example 2 column-by-column and the template's DNA jumps out:

| Layer | Example 1 (Playdate) | Example 2 (Polaroid I-2) | Template-level invariant |
|---|---|---|---|
| Product class | indie handheld console | premium instant camera | small cult-object gadget |
| Chroma slab | yellow `#FFD400` | white `#FFFFFF` | brand's signature color, the ONLY color in frame |
| Duotone palette | charcoal-olive + putty-cream | rich black + warm bone | strict 2-tone, halftone-dithered shading |
| Illustration register | indie zine / risograph | vintage-manual / photography zine | hand-illustrated halftone, NOT chunky 8-bit |
| Gimmick | crank handle | aperture dial | one physical-interaction beat every scene revolves around |
| Outro | wordmark over yellow chroma slab | wordmark over warm-bone slab | wordmark + tagline lockup over brand chroma |
| Cuts | 8 cuts @ ~1.9s avg | 8 cuts @ ~1.9s avg | same skeleton |

The framework is the template. The content fills the slots.

---

## How to scaffold a new variant from this template

```bash
# 1. Use the template (CLI auto-pulls assets from ralphy-assets if needed)
ralphy template use pixel-art-product-reveal --project <my-new-id> \
  --brief "A 15s hyper-motion pixel-art reveal for <product> by <brand>"

# 2. Fill the slot map in workspace/projects/<my-new-id>/SLOTS.md
#    (the template scaffolds this file; edit it with your brand's values)

# 3. Pull canonical product photo + 8-15 atomic style refs into refs/
#    (Playwright on the brand site, or curl direct URLs)

# 4. Write STORYBOARD.md (clone playdate-pixel-001 if useful)

# 5. Run the pipeline per TEMPLATE.md "Workflow" section

# 6. After render, run /postmortem to capture lessons for the NEXT iteration
```

The slot map is the contract. Fill it carefully — slot drift (e.g. half the prompts still mention "Playdate" because you only replaced 60% of the slots) produces a confused render.
