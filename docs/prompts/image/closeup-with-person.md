# Mode: closeup-with-person

Tight crop: product + hands / partial face / body (without full portrait). The most "UGC-ish" format — looks like a real-life user demo. Canonical for beauty, skincare, drinks, tech accessories.

## When to use

- User asks "hand holds", "in use", "applying", "swipe", "unboxing", "model using closely".
- Goal — show demo / scale / texture of use, not a scene and not studio.
- If a full-size model is needed — go to [`virtual-model-tryout.md`](virtual-model-tryout.md).
- If only texture without hands — go to [`macro-detail.md`](macro-detail.md).

## Master template (slot-fill)

```
Photoreal {{format}} of {{body_part}} {{action}} the {{product}}, exact
design: {{material}}, {{color}}, {{finish}}, {{logo_placement}}.

Camera: {{lens}}, {{angle}}, shallow depth of field, focus on
{{focus_target}}, background softly blurred.

Lighting: {{light_source}} from {{direction}}, soft diffused, realistic
skin texture, natural skin tones, controlled specular highlights on product.

Background: {{background}}, minimal, no clutter.

Output: {{aspect}}, product label sharp and readable.

Hard exclusions: no full face if specified, no extra people, no extra
products, no warped hands, no extra fingers, no distorted branding,
no watermark.
```

## Worked examples (verbatim)

### Example 1 — Model Using the Product Naturally
> Show a model naturally using the [product] in a realistic setting, keep the product fully accurate in shape, size, and branding, product clearly visible, natural pose, commercial lifestyle photography.

- Source: letsenhance.io (With-People #14)
- Aspect: 4:5 / 9:16
- Best for: universal "in-use" demo

### Example 2 — Hand-Only Premium Detail
> Show elegant hands interacting with the [product], no face visible, clean composition, shallow depth of field, realistic commercial lighting, focus on product and usage.

- Source: letsenhance.io (With-People #15)
- Aspect: 4:5
- Best for: premium beauty / skincare / jewelry — without face for speed and universality

### Example 3 — Hand Holding Skincare
> Photorealistic lifestyle product photo of a well-groomed hand holding a serum dropper bottle, clean neutral background, soft diffused studio light, realistic skin texture and natural nails, label sharp and readable, shot on Sony A7R IV with 85mm, f/3.2, modern beauty ad style --ar 4:5

- Source: media.io (#20)
- Aspect: 4:5
- Best for: skincare hero

### Example 4 — Wearing Jewelry Close-up
> Ultra-realistic product lifestyle photo of a model wearing a delicate gold necklace, close-up from collarbone to chin, soft studio lighting, skin texture natural, necklace sparkling with controlled highlights, minimal background, shot on Nikon Z9 with 105mm, f/4, luxury campaign look --ar 4:5

- Source: media.io (#22)
- Aspect: 4:5
- Best for: jewelry, fragrance neck shot

### Example 5 — Unboxing Hands
> Photorealistic ecommerce lifestyle image of two hands opening a premium product box on a clean table, tissue paper and branded insert visible, bright softbox lighting, top-down angle, shot on Sony A7IV with 35mm, f/5.6, crisp details, modern DTC unboxing aesthetic --ar 4:5

- Source: media.io (#23)
- Aspect: 4:5
- Best for: DTC unboxing hero, "first impression" scenes

### Example 6 — Applying Cosmetic Swipe
> Photorealistic beauty product photo of a hand applying a lipstick swatch on the forearm with the product tube beside it, clean neutral background, soft diffused light, accurate color, sharp focus on texture, shot on Canon R5 with 100mm macro, f/5.6, editorial cosmetics look --ar 4:5

- Source: media.io (#24)
- Aspect: 4:5
- Best for: cosmetics swatch, color demo

### Example 7 — Gym Bottle In Use
> Photorealistic lifestyle product shot of an athletic person gripping a branded shaker bottle, gym background softly blurred, dramatic side lighting with sweat highlights, confident energetic mood, shot on Sony A1 with 85mm, f/2.8, shallow depth of field, ad-ready composition --ar 4:5

- Source: media.io (#25)
- Aspect: 4:5
- Best for: sports, supplements, energy drinks

### Example 8 — In-Hand Size Reference
> Show the [product] being held naturally in one hand to communicate scale, realistic proportions, clean background, clear focus on the product, no distortion, e-commerce lifestyle photography.

- Source: letsenhance.io (Scale #13)
- Aspect: 1:1 / 4:5
- Best for: show scale (phone, accessories, jar)

### Example 9 — Pouring Coffee Action
> Photorealistic product shot of a person pouring freshly brewed coffee from a branded carafe into a ceramic cup, warm window light, steam visible, cozy morning mood, focus on product branding, shot on Canon R6 with 50mm, f/2.8, natural motion blur controlled, editorial lifestyle --ar 4:5

- Source: media.io (#21)
- Aspect: 4:5
- Best for: beverages, coffee, kitchen products in motion

## Slot vocabulary

- **body_part**: well-groomed hand | elegant hands | two hands | one hand | forearm | collarbone to chin | side profile | hands and partial face | bare shoulders
- **action**: holding | applying | pouring | gripping | opening | swiping | spritzing | unboxing | wearing
- **focus_target**: product label | texture on skin | product in fingers | branding on cap | swatch on forearm
- **lens**: 50mm | 85mm | 100mm macro | 105mm (compressed bokeh)
- **aperture**: f/2.8 | f/3.2 | f/4 | f/5.6 — shallow for bokeh, medium for texture
- **light_source**: soft diffused studio | window light | softbox key | overhead skylight
- **direction**: front | side | top | back-rim
- **background**: clean neutral | softly blurred lifestyle | dark blurred mood | plain warm beige
- **aspect**: 4:5 (Instagram portrait) | 9:16 (TikTok / Reels still) | 1:1
- **skin_tone** (if important): natural neutral | warm | cool | brown | olive

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Cleaner hands (less "warped hands" / extra fingers), more accurate skin texture, better typography of label under fingers.
- If the same model/hands across 3-5 scenes is needed (consistency) — `google/gemini-3-pro-image-preview` with `--ref hand-reference.png` + `--ref product.png`.
- **Never give just a text prompt with a specific real person** — reference is mandatory, otherwise face-similarity is not guaranteed (see AGENTS.md "Reference-required gate").

## Caveats

- **Warped hands** — main failure mode. If you see 4 or 6 fingers — retry with the words `realistic five-finger anatomy, no warped hands, no extra fingers` in "Hard exclusions".
- **Skin tone drift** — if you are doing for a specific brand with a specific model, always provide `--ref` with real skin; the model will pick "average warm" without context.
- **Label readability** — for UGC where the focus is on the product, mandatory `label sharp and readable, product branding accurate`. Otherwise the model can blur into the background.
- **No face vs partial face** — if you want "no face visible", write explicitly `no face visible, framed from neck-down only`; the model often adds a face into the frame.
- **Cyrillic labels** — describe in words; the model will not render Cyrillic letter-by-letter, but will give a believable wordmark if you describe the style ("Cyrillic sans-serif wordmark in white").
