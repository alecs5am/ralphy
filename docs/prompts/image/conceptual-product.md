# Mode: conceptual-product

Сюрреал / CGI / left-field. Левитация, color gels, splash freeze, neon reflections, paper-cut shadows. Это hook-shot для соцсетей или campaign hero — продукт превращается в art-piece.

## When to use

- Юзер просит "сюрреал", "CGI", "левитация", "всплеск", "splash freeze", "neon", "color gels", "creative art shot".
- Цель — scroll-stop attention для feed-рекламы или campaign launch.
- Если просто чистый studio packshot — иди в [`product-shot.md`](product-shot.md).

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
- Best for: beverages, energy drinks, "fresh from the fridge" моменты

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
- Best for: brand-coloured studio art piece — копируй и заполняй

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

- **Default — `openai/gpt-5.4-image-2`**. Лучше держит "frozen motion" без артефактов, точнее color gels, чище typography (нужно для can / bottle labels).
- Для splash / liquid / smoke effects обе модели работают, но gpt даёт чище physics.
- Если делаешь серию (5 разных concept-shots одного продукта) — gemini-3-pro с `--ref product.png` лучше держит consistency продукта между разными conceptual treatments.

## Caveats

- **Color gel coherence** — `cyan rim + magenta fill` должно совпадать с brand colors. Иначе кадр выглядит как стоковая разноцветная мешанина. Если у тебя brand colors — указывай их в HEX.
- **Splash physics** — единственный самый сложный paragraph. `dynamic water splash with frozen motion, dramatic strobe lighting, f/11 high-speed flash look` — это формула которая работает. Без `frozen motion` и `f/11` модель часто размазывает.
- **No text on object** — `crisp typography` в промпте означает чёткий лейбл продукта, не наложенный текст. Никогда не проси модель писать headline на фоне.
- **Neon overuse** — neon рefllections выглядят свежо в одном кадре, дешево в десяти подряд. Используй для hero shot, не для каталога.
- **Levitation drop shadow** — модель часто забывает добавить shadow под левитирующим продуктом, и он выглядит как cutout. Обязательно `with soft realistic drop shadow 2-3 cm below`.
- **Conceptual ≠ surreal-fake** — `surreal CGI-style levitating` это один полюс, `dreamlike Pinterest aesthetic with floating petals` это другой. Будь точным в стиле, иначе модель усреднит в "abstract pretty".
