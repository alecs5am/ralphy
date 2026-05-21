# Mode: conceptual-product

Surreal / CGI / left-field. Levitation, color gels, splash freeze, neon reflections, paper-cut shadows. This is a hook-shot for social networks or campaign hero — the product turns into an art-piece.

## When to use

- User asks "surreal", "CGI", "levitation", "splash", "splash freeze", "neon", "color gels", "creative art shot".
- Goal — scroll-stop attention for feed advertising or campaign launch.
- If just a clean studio packshot — go to [`product-shot.md`](product-shot.md).

## Master template (slot-fill)

```
Commercial product photography of {{product}} {{conceptual_treatment}},
{{styling_detail}}, {{lighting_treatment}}, shot on {{camera}} with
{{lens}}, f/{{aperture}}, {{aesthetic_label}}, {{specifics}} --ar {{aspect}}
```

## Worked examples (verbatim)

### Example 1 — Color Gel Studio Pop
> Commercial product photography of a sports water bottle on a seamless backdrop with bold color gels (cyan rim light, magenta fill), high contrast, crisp silhouette, glossy highlights, shot on Sony A1 with 50mm, f/8, ad-ready composition with strong negative space --ar 4:5

- Source: media.io (#8)
- Aspect: 4:5
- Best for: drinks, sport, energy products — instant "young / vibrant" energy

### Example 2 — Beverage Splash Freeze
> Photorealistic product shot of a canned sparkling drink with dynamic water splash and condensation droplets, frozen motion, dark teal background, dramatic strobe lighting, shot on Sony A9 II with 85mm, f/11, high-speed flash look, crisp typography, ad campaign quality --ar 4:5

- Source: media.io (#13)
- Aspect: 4:5
- Best for: beverages, energy drinks, "fresh from the fridge" moments

### Example 3 — Neon Night Tech
> Commercial product photo of a smartphone on a wet reflective surface with neon city light reflections (blue and pink), moody night ambience, crisp screen glow, shot on Sony A1 with 35mm, f/2.8, cinematic contrast, high detail, realistic reflections and raindrops --ar 4:5

- Source: media.io (#16)
- Aspect: 4:5
- Best for: tech, gaming, mobile, cinematic moody

### Example 4 — Paper Cut Shadow Backdrop
> Photorealistic product photo of a minimalist perfume bottle against a paper-cut backdrop creating layered geometric shadows, warm beige palette, soft studio lighting, centered composition, shot on Canon R5 with 85mm, f/8, clean editorial styling, sharp edges and label clarity --ar 4:5

- Source: media.io (#17)
- Aspect: 4:5
- Best for: editorial perfume / minimalist brand campaign

### Example 5 — Floating Product on Color (Three-Point Studio)
> Photoreal studio product hero shot of [PRODUCT], exact design: [material], [color], [finish], [logo placement]. The product is floating slightly above the surface (2-3 cm) with a soft realistic drop shadow. Background: seamless solid color backdrop [HEX], subtle gradient allowed only if specified. Lighting: three-point studio lighting, soft key from front-left, gentle fill, thin rim light to separate edges, no harsh shadows. Camera: 85mm lens look, centered, minimal distortion, crisp detail. Output: vertical 1080x1350, clean negative space above the product. Hard exclusions: no text, no watermark, no extra objects, no extra packaging, no random highlights, no glow effects.

- Source: rephrase-it.com (#3)
- Aspect: 1080×1350 (portrait)
- Best for: brand-coloured studio art piece — copy and fill

### Example 6 — Pastel Gradient Backdrop
> Photorealistic product photography of a minimalist cosmetics compact on a pastel gradient backdrop (peach to lavender), soft studio lighting with smooth shadow, gentle specular highlights, centered composition with negative space for text, shot on Nikon Z8 with 85mm lens, f/7.1, clean modern ad aesthetic --ar 4:5

- Source: media.io (#3)
- Aspect: 4:5
- Best for: beauty / cosmetics campaign launch

## Slot vocabulary

- **conceptual_treatment**: levitating 2-3 cm above surface | exploding mid-air with frozen particles | submerged in water with bubbles | wrapped in colored smoke | surrounded by neon glow | encased in transparent ice block | bursting through a paper backdrop | rotating mid-spin frozen
- **styling_detail**: bold color gel lighting (cyan rim + magenta fill) | dramatic side strobe | pastel gradient (peach to lavender) | neon reflections (blue / pink) | paper-cut geometric shadows | splash water around base | colored powder explosion
- **lighting_treatment**: high contrast strobe | dramatic strip softbox | three-point studio | colored gel rim | cinematic moody | high-key bright airy
- **camera**: Sony A1 | Sony A9 II | Canon R5 | Nikon Z8 | Canon R6
- **lens**: 35mm (wide drama) | 50mm (balanced) | 85mm (compressed studio look)
- **aperture**: f/2.8 (max bokeh, neon) | f/4-f/5.6 (balanced) | f/8 (sharp + studio) | f/11 (splash freeze flash)
- **aesthetic_label**: ad-ready composition | editorial styling | high-end campaign | cinematic contrast | clean modern ad aesthetic
- **specifics**: strong negative space | crisp silhouette | frozen motion | layered geometric shadows | realistic reflections and raindrops | smooth shadow gradient
- **aspect**: 4:5 (default) | 1:1 | 9:16 (vertical hook) | 16:9 (cinematic banner)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Better holds "frozen motion" without artifacts, more accurate color gels, cleaner typography (needed for can / bottle labels).
- For splash / liquid / smoke effects both models work, but gpt gives cleaner physics.
- If you are doing a series (5 different concept-shots of one product) — gemini-3-pro with `--ref product.png` better holds product consistency across different conceptual treatments.

## Caveats

- **Color gel coherence** — `cyan rim + magenta fill` must match brand colors. Otherwise the frame looks like a stock multicolored mess. If you have brand colors — specify them in HEX.
- **Splash physics** — the single most difficult paragraph. `dynamic water splash with frozen motion, dramatic strobe lighting, f/11 high-speed flash look` — this is the formula that works. Without `frozen motion` and `f/11` the model often blurs.
- **No text on object** — `crisp typography` in the prompt means a clear product label, not overlaid text. Never ask the model to write a headline on the background.
- **Neon overuse** — neon reflections look fresh in one frame, cheap in ten in a row. Use for hero shot, not for catalog.
- **Levitation drop shadow** — the model often forgets to add a shadow under a levitating product, and it looks like a cutout. Mandatory `with soft realistic drop shadow 2-3 cm below`.
- **Conceptual ≠ surreal-fake** — `surreal CGI-style levitating` is one pole, `dreamlike Pinterest aesthetic with floating petals` is another. Be precise in style, otherwise the model averages into "abstract pretty".
