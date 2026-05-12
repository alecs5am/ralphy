# Mode: macro-detail

Extreme close-up. Текстура, шиммер, капли, плотность, surface treatment — то что хочется потрогать. Канонический формат для beauty (тональник, помада), drinks (condensation), skincare (drop), packaging (emboss/foil).

## When to use

- Юзер просит "макро", "текстура", "шиммер", "капли", "extreme close-up", "feel the texture".
- Цель — sensory seduction. Это hero-shot для motion-graphic intro или ad hook.
- Если нужен общий план продукта в руке — иди в [`closeup-with-person.md`](closeup-with-person.md).

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

- Source: media.io (#6) + reference seed по запросу
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
- Best for: beverages / energy drinks / "fresh" моменты

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

- **Default — `openai/gpt-5.4-image-2`**. Лучше держит микро-детали, типографику на упаковке, мелкие highlights.
- Для liquid / splash моментов с физикой движения — обе модели работают, но gpt-image-2 даёт чище "frozen motion" без артефактов.
- Если нужно совмещать с другим референсным шотом продукта (consistency через несколько макро) — `--ref` обязателен.

## Caveats

- **Aperture matters** — f/2.8 даёт max bokeh, но почти ничего в фокусе кроме одной точки. Для рекламы продукта обычно f/4-f/5.6 — достаточно cinematic bokeh, но лейбл/верх продукта чёткие.
- **"Frozen motion"** для splash — обязательно `dramatic strobe lighting, frozen motion, high-speed flash look`. Иначе модель размажет.
- **Macro lens lie** — в реальности 50mm не делает true macro. Но для AI-промпта 100mm/105mm macro работает как стилистический ярлык: модель понимает "extreme close-up".
- **Условие "label sharp and readable"** в макро — критично; без него модель часто блюрит лейбл вместе с фоном.
- **Background colour cohesion** — bokeh_color должен совпадать с brand palette продукта, иначе кадр выглядит несвязным.
