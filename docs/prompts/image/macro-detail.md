# Mode: macro-detail

Extreme close-up. Texture, shimmer, drops, density, surface treatment — what you want to touch. Canonical format for beauty (foundation, lipstick), drinks (condensation), skincare (drop), packaging (emboss/foil).

## When to use

- User asks "macro", "texture", "shimmer", "drops", "extreme close-up", "feel the texture".
- Goal — sensory seduction. This is a hero-shot for motion-graphic intro or ad hook.
- If a general view of the product in hand is needed — go to [`closeup-with-person.md`](closeup-with-person.md).

## Master template (slot-fill)

```
Extreme close-up macro product shot of {{subject}} with visible {{texture}},
shallow depth of field, {{bokeh_color}} bokeh background, shot on
{{camera}} with {{macro_lens}}, f/{{aperture}}, ultra-realistic
{{material_quality}} texture, high resolution {{niche}} photography
--ar {{aspect}}
```

## Worked examples (verbatim)

### Example 1 — Lip Gloss Wand Macro
> Extreme close-up macro product shot of a lip gloss wand with visible shimmer texture and glossy highlights, shallow depth of field, creamy bokeh background in soft beige, shot on Canon R5 with 100mm macro lens, f/4, ultra-realistic liquid texture, high resolution beauty photography --ar 4:5

- Source: media.io (#6) + reference seed on demand
- Aspect: 4:5
- Best for: lip gloss / serum / liquid beauty

### Example 2 — Skincare Dewy Bokeh
> Beauty product photo of a moisturizer jar surrounded by soft dewy bokeh light circles, pale blush background, gentle haze, clean glossy highlights on the lid, shot on Canon R6 with 85mm, f/2.8, shallow depth of field, premium skincare ad aesthetic, realistic shadows --ar 4:5

- Source: media.io (#14)
- Aspect: 4:5
- Best for: skincare jar hero

### Example 3 — Material Texture Close-Up
> Create a close-up detail image of the [product] focused on material texture, stitching, finish, or surface quality, realistic macro-style lighting, sharp detail, premium product photography.

- Source: letsenhance.io (Scale #12)
- Aspect: 1:1 / 4:5
- Best for: fabric, leather, knitwear detail

### Example 4 — Packaging + Ingredients Macro
> Photoreal product photography scene featuring [PRODUCT + PACKAGING], single set only, brand and label must be clean and undistorted. Arrangement: product centered; exactly [N] ingredient elements placed around it: [ingredient 1], [ingredient 2] ... positioned near base, not covering the label. Surface: [marble / matte stone / light wood], clean and dry unless specified. Lighting: soft diffused top light, controlled specular highlights on packaging, subtle shadow grounding the product. Camera: 50mm lens, eye-level, shallow depth of field, label sharp and readable. Background: simple, minimal, no patterns. Hard exclusions: no extra text, no fake slogans, no additional products, no hands, no watermarks.

- Source: rephrase-it.com (#4)
- Aspect: 1:1 / 4:5
- Best for: CPG / supplements / "ingredients shot"

### Example 5 — Beverage Splash Moment
> Photorealistic product shot of a canned sparkling drink with dynamic water splash and condensation droplets, frozen motion, dark teal background, dramatic strobe lighting, shot on Sony A9 II with 85mm, f/11, high-speed flash look, crisp typography, ad campaign quality --ar 4:5

- Source: media.io (#13)
- Aspect: 4:5
- Best for: beverages / energy drinks / "fresh" moments

## Slot vocabulary

- **subject**: lip gloss wand | moisturizer jar lid | serum dropper tip | embossed cap | watch crown | fabric weave | leather stitching
- **texture**: shimmer | matte powder finish | glossy reflection | condensation droplets | crystalline surface | velvet flock | brushed grain | iridescent foil | dewy droplets
- **bokeh_color**: creamy beige | pale blush | soft sage | warm honey | cool grey | matching brand
- **camera**: Canon R5 | Canon R6 | Sony A7R IV | Sony A1 | Nikon Z9 | Fujifilm GFX 100S
- **macro_lens**: 85mm | 100mm macro | 105mm macro
- **aperture**: f/2.8 (max bokeh) | f/4 (balanced) | f/5.6 (more in focus) | f/11 (flash freeze)
- **material_quality**: liquid | crystalline | metallic | fabric | foiled | embossed | polished | matte powder
- **niche**: beauty | skincare | cosmetics | beverage | packaging | jewelry | tech
- **aspect**: 4:5 (default) | 1:1 (Instagram square) | 9:16 (vertical hook)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Better holds micro-details, typography on packaging, small highlights.
- For liquid / splash moments with motion physics — both models work, but gpt-image-2 gives cleaner "frozen motion" without artifacts.
- If you need to combine with another reference shot of the product (consistency across several macros) — `--ref` is mandatory.

## Caveats

- **Aperture matters** — f/2.8 gives max bokeh, but almost nothing in focus except one point. For product advertising usually f/4-f/5.6 — enough cinematic bokeh, but label/top of product clear.
- **"Frozen motion"** for splash — mandatory `dramatic strobe lighting, frozen motion, high-speed flash look`. Otherwise the model will blur it.
- **Macro lens lie** — in reality 50mm does not make true macro. But for AI-prompt 100mm/105mm macro works as a stylistic label: the model understands "extreme close-up".
- **The condition "label sharp and readable"** in macro — critical; without it the model often blurs the label along with the background.
- **Background colour cohesion** — bokeh_color must match the product's brand palette, otherwise the frame looks incoherent.
