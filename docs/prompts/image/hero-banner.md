# Mode: hero-banner

Wide-format banner. Site hero-section, email header, paid-social ad creative with large negative space for copy. Aspect 16:9 or wider (21:9 cinematic).

## When to use

- User asks "site banner", "hero for landing", "email header", "Facebook ad", "wide format".
- Goal — wide frame with explicit negative space for text / CTA.
- If a square / portrait is needed — go to [`product-shot.md`](product-shot.md) or [`lifestyle-scene.md`](lifestyle-scene.md).

## Master template (slot-fill)

```
Photoreal premium {{format}} hero banner. The product is the visual anchor:
{{product}} must match exactly: {{color}}, {{material}}, {{finish}},
{{logo_placement}}.

Scene: {{scene}}, on {{surface}}, minimal styling, no clutter.

Camera: {{lens}} lens, {{angle}}, product positioned {{position_in_frame}},
shallow depth of field, background softly blurred.

Lighting: {{light_source}}, {{light_quality}}, realistic shadows.

Composition: {{aspect}} (wide format), product occupies {{product_zone}},
clean negative space {{negative_space_zone}} for headline and CTA.

Hard exclusions: no text overlay, no headline, no CTA button (will be
added in post), no fake logos, no extra products, no watermarks.
```

## Worked examples (verbatim)

### Example 1 — Premium Lifestyle Hero (16:9)
> Photoreal premium lifestyle advertisement photo. The product is the hero: [PRODUCT] must match exactly: [color], [material], [finish], [logo placement], [shape], [proportions]. Scene: [specific location], on [specific surface], minimal set dressing, no clutter. Time of day: [morning/afternoon/golden hour]. Camera: 35mm lens, 3/4 angle, product in foreground, shallow depth of field, background softly blurred. Lighting: natural window light from [left/right] plus subtle bounce fill, physically plausible shadows, realistic reflections consistent with materials. Composition: 16:9 with clean negative space on the right for ad copy, product positioned on left third. Hard exclusions: no fake logos, no distorted branding, no extra text, no extra products, no warped perspective, no surreal props.

- Source: rephrase-it.com (#2)
- Aspect: 16:9
- Best for: full-production website hero — copy and fill

### Example 2 — Neon Night Tech Ad (Wide)
> Commercial product photo of a smartphone on a wet reflective surface with neon city light reflections (blue and pink), moody night ambience, crisp screen glow, shot on Sony A1 with 35mm, f/2.8, cinematic contrast, high detail, realistic reflections and raindrops --ar 4:5

- Source: media.io (#16)
- Aspect: media.io gives 4:5, but adapt for 16:9 works well with the same language
- Best for: tech / mobile / cinematic moody banner

### Example 3 — Outdoor Lifestyle (Wide)
> Place the [product] in an outdoor setting that matches its use, natural light, realistic environment, accurate texture and color, product clearly visible, premium lifestyle product photography.

- Source: letsenhance.io (#7) — adapt to 16:9
- Aspect: 16:9
- Best for: travel, fitness, food & beverage outdoor

### Example 4 — Food Packaging Hero
> Professional product shot of a premium coffee bag standing upright on a neutral tabletop, subtle steam and aroma vibe implied with warm lighting, background softly blurred cafe tones, shot on Nikon Z8 with 85mm, f/4, crisp packaging texture, commercial ecommerce quality --ar 4:5

- Source: media.io (#18) — adapt to 16:9 for landing
- Aspect: 4:5 native, 16:9 hero adaptation
- Best for: food & beverage hero landing

### Example 5 — Custom Wide-format Studio Hero
*(synthesised from rephrase #3 + media.io #2 — adapted for cinematic 21:9)*
> Photoreal premium product hero shot of a luxury fragrance bottle on glossy black acrylic with subtle mirror reflection, dramatic strip softbox highlights from the right, deep falloff into shadow on the left, cinematic luxury mood, shot on Sony A7R IV with 50mm lens, f/5.6, editorial lighting, 21:9 cinema aspect with bottle positioned on right third, large clean negative space on left for headline, --ar 21:9

- Source: synthesised
- Aspect: 21:9 (cinema banner)
- Best for: premium / luxury landing hero

## Slot vocabulary

- **format**: lifestyle advertisement photo | studio editorial photo | cinematic product hero
- **scene**: minimal interior | outdoor lifestyle | studio dark mood | studio bright airy | bright kitchen | cafe corner
- **surface**: marble | matte black acrylic | natural oak | concrete slab | linen tabletop
- **lens**: 35mm (wide context) | 50mm (natural) | 85mm (compressed bokeh)
- **angle**: 3/4 eye-level | slight low hero | side-profile compressed
- **position_in_frame**: left third (copy on right) | right third (copy on left) | center with copy above/below
- **light_source**: natural window light | softbox key + rim | strip light + falloff | golden hour back-lit
- **light_quality**: soft diffused | dramatic high-contrast | warm + ambient | crisp bright airy
- **product_zone**: left third | right third | center 30% | bottom-third
- **negative_space_zone**: right two-thirds | top half | left two-thirds
- **aspect**: 16:9 (standard banner) | 21:9 (cinema banner) | 4:1 (email header)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Better label typography, more accurate layout, more reliable holds the "negative space on the right" instruction.
- For a series of banners with one product — `google/gemini-3-pro-image-preview` with `--ref product.png` better holds consistency.

## Caveats

- **Negative space is a soft constraint** — the models sometimes fill it with atmospheric "glow". If the copywriter requires a clean right corner — explicitly add `the right two-thirds must be empty / soft gradient, no objects, no textures, no light streaks`.
- **No text in image** — never ask the model to write a headline / CTA. Text will lie crookedly and is not readable. Only generate the background, and overlay the text in Figma / the HyperFrames composition / on top.
- **21:9 cinema** — gpt-5.4-image-2 goes into native 16:9 bucket more often than into 21:9. After generation, ffmpeg crop is often needed. Alternative — `bytedance/seedance-2.0` for static 21:9 highlight (but this is video, not image).
- **Brand colour consistency** — if there is a strict HEX (for example `#0EA5E9` blue) — specify literally in "background colour ID". Otherwise the model will average to "deep blue".
- **Logo distortion** — for a banner with a large label, mandatory `--ref product.png` if real brand; with just a text description the logo is reproduced approximately.
