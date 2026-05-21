# Mode: product-shot

Studio packshot. Clean background (white / gray / colored), product — the only hero of the frame, no props. This is the base for marketplace listings, e-commerce catalog, PDP hero sections.

## When to use

- User asks "packshot", "studio photo", "white background", "catalog", "marketplace listing".
- Goal — accurate transmission of shape / color / label, minimum context.
- If a scene / environment is needed — go to [`lifestyle-scene.md`](lifestyle-scene.md).

## Master template (slot-fill)

```
Photoreal high-end ecommerce {{format}} of a single {{product}}, exact design:
{{material}}, {{color}}, {{finish}}, {{logo_placement}}, {{dimensions_or_proportions}}.

Camera: {{lens}} lens, {{angle}}, centered, no perspective distortion, sharp
edges, full product in frame, tripod-stable.

Lighting: {{key_light}} from {{key_direction}}, {{fill}} from {{fill_direction}},
controlled specular highlights, no blown highlights, realistic {{shadow_type}}
shadow {{shadow_placement}}.

Background: {{background}}, no texture, no gradients, no props.

Output: {{aspect}}, product fills ~{{coverage}}% of frame, tack sharp focus.

Hard exclusions: no extra products, no added accessories, no alternate logo,
no text, no watermark, no random branding, no reflections showing a room.
```

## Worked examples (verbatim)

### Example 1 — Pure White Marketplace Packshot
> Place the [product] centered on a pure white background, keep the exact shape, proportions, branding, label text, and material finish, use soft studio lighting, realistic shadow directly under the product, e-commerce packshot style, no props, no extra objects.

- Source: letsenhance.io (Studio #1)
- Aspect: 1:1 (square listing)
- Best for: Amazon / Wildberries main image

### Example 2 — Soft Gray Studio Hero Shot
> Place the [product] in a clean studio setup with a light gray seamless background, soft diffused lighting, subtle natural shadow, product fully visible, sharp edges, realistic reflections if the material is glossy, premium e-commerce photography.

- Source: letsenhance.io (Studio #2)
- Aspect: 4:5
- Best for: Shopify / DTC PDP hero

### Example 3 — Floating Cutout with Clean Shadow
> Turn the [product] into a floating studio product image on a clean neutral background, preserve exact product geometry, add a soft shadow below to ground it, keep all visible details realistic and accurate.

- Source: letsenhance.io (Studio #3)
- Aspect: 1:1
- Best for: PNG-style cutouts for use in ad creative

### Example 4 — Full Production Packshot on Pure White
> Photoreal high-end ecommerce packshot of a single [PRODUCT], exact design: [material], [color], [finish], [logo placement], [dimensions/proportions]. Camera: straight-on product photography, 70mm lens, tripod, centered, no perspective distortion, sharp edges, full product in frame. Lighting: large softbox key light from above-left, gentle fill from right, controlled specular highlights, no blown highlights, realistic soft shadow under product. Background: seamless pure white (#FFFFFF), no texture, no gradients, no props. Output: 1:1 square, product fills ~70% of frame, tack sharp focus. Hard exclusions: no extra products, no added accessories, no alternate logo, no text, no watermark, no random branding, no reflections showing a room.

- Source: rephrase-it.com (#1)
- Aspect: 1:1
- Best for: full-production replica — the most detailed skeleton, copy and fill

### Example 5 — Pure White Hero (Skincare)
> Photorealistic studio product photography of a single premium skincare bottle centered on a seamless pure white background, soft diffused key light with gentle shadow under the base, crisp label readability, minimal reflections, shot on Canon R5 with 85mm lens, f/8, ultra-sharp focus, ecommerce listing style, high resolution, natural color accuracy --ar 4:5

- Source: media.io (#1)
- Aspect: 4:5
- Best for: skincare / beauty

### Example 6 — Luxury Black Gloss
> Ultra-realistic product photo of a matte black fragrance bottle on glossy black acrylic with subtle mirror reflection, dramatic strip softbox highlights, deep shadows, cinematic luxury mood, shot on Sony A7R IV with 50mm lens, f/5.6, editorial lighting, clean background falloff, high-end campaign look --ar 4:5

- Source: media.io (#2)
- Aspect: 4:5
- Best for: premium-perfume, watches, luxury

### Example 7 — Acrylic Pedestal Display
> Professional product photo of a vitamin supplement jar on a clear acrylic pedestal, seamless light gray background, bright airy softbox lighting, realistic contact shadow and subtle reflections, sharp label, shot on Canon R6 with 70mm, f/8, commercial catalog quality, neutral color grading --ar 4:5

- Source: media.io (#4)
- Aspect: 4:5
- Best for: supplements / vitamins / health

### Example 8 — Floating Product on Color Background (Three-Point)
> Photoreal studio product hero shot of [PRODUCT], exact design: [material], [color], [finish], [logo placement]. The product is floating slightly above the surface (2-3 cm) with a soft realistic drop shadow. Background: seamless solid color backdrop [HEX], subtle gradient allowed only if specified. Lighting: three-point studio lighting, soft key from front-left, gentle fill, thin rim light to separate edges, no harsh shadows. Camera: 85mm lens look, centered, minimal distortion, crisp detail. Output: vertical 1080x1350, clean negative space above the product. Hard exclusions: no text, no watermark, no extra objects, no extra packaging, no random highlights, no glow effects.

- Source: rephrase-it.com (#3)
- Aspect: 1080×1350 (Instagram portrait)
- Best for: social-ready studio hero on brand colour

### Example 9 — Reflective Chrome
> High-end product photo of a chrome finished electric shaver on a reflective metallic surface, controlled studio highlights, cool gray background, precise reflections without distortion, shot on Nikon Z9 with 105mm, f/9, ultra-clean commercial lighting, razor-sharp detail --ar 4:5

- Source: media.io (#11)
- Aspect: 4:5
- Best for: chrome / metal / appliances

### Example 10 — High-Key Glassware
> Photorealistic product photography of a clear glass cup on a seamless white background, high-key lighting with controlled specular highlights, crisp glass edges, soft shadow, shot on Canon R5 with 100mm, f/10, catalog accuracy, high resolution, no color cast --ar 4:5

- Source: media.io (#19)
- Aspect: 4:5
- Best for: glass / transparent products

## Slot vocabulary

- **product**: short name of the product + key identifiers (shape, material, color).
- **material**: matte plastic | glossy ceramic | brushed aluminum | frosted glass | chrome | satin | leather | linen | kraft paper
- **finish**: matte | glossy | satin | metallic | iridescent | rubberized
- **logo_placement**: front-center | top-front | embossed-side | none (preserve exact)
- **lens**: 50mm | 70mm | 85mm | 100mm | 105mm — packshot most often 70-100mm for minimal distortion.
- **angle**: straight-on | slight 3/4 | low hero | top-down 15°
- **key_light**: large softbox | strip softbox | beauty dish | window-like diffuser
- **fill**: gentle bounce | reflector | negative fill (for drama)
- **shadow_type**: soft natural | hard directional | contact drop | floating
- **shadow_placement**: directly under product | offset right | minimal
- **background**: seamless pure white (#FFFFFF) | light gray seamless | soft pastel gradient | matte black acrylic | warm cream | brand-color HEX
- **aspect**: 1:1 (marketplace square) | 4:5 (Instagram portrait) | 9:16 (story) | 16:9 (banner) | 2:3 (Pinterest)
- **coverage**: 60% (loose) | 70% (catalog standard) | 80% (tight hero)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Better label typography, more accurate text, fewer hallucinations of small details. This is what is needed for marketplace where the label must be readable.
- Multi-ref (bottle + texture + brand-color swatch simultaneously) — `google/gemini-3-pro-image-preview` with 2-3 `--ref`.
- If experimenting with style — try both, in gpt-image-2 studio is cleaner, in gemini light is more pliable.

## Caveats

- Output size: gpt-5.4-image-2 and gemini-3-pro round to their natural buckets (1024² for 1:1, 768×1376 for 9:16, 1280×720 for 16:9). You will not get exact 1080×1350 — Remotion/ffmpeg will upscale.
- "Hard exclusions" block really works — don't drop it, especially lines about watermark and extra text.
- For marketplace where an even pure-white background without gradient is required — add `--negative "gradient background, color cast, vignette"`.
