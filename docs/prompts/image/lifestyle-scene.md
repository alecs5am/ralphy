# Mode: lifestyle-scene

Продукт в реальной среде. Кухня, зал, полка в магазине, кафе, рабочий стол — место где продукт реально используют. Цель — продать атмосферу и эмоцию, не только спеки.

## When to use

- Юзер просит "lifestyle", "в реальной среде", "на кухне / в зале / на полке", "in use".
- Цель — emotional context для рекламы / соцсетей / DTC PDP.
- Если нужно крупно показать руки/использование — иди в [`closeup-with-person.md`](closeup-with-person.md).
- Если нужно showroom-studio — иди в [`product-shot.md`](product-shot.md).

## Master template (slot-fill)

```
Photoreal premium lifestyle advertisement photo. The product is the hero:
{{product}} must match exactly: {{color}}, {{material}}, {{finish}},
{{logo_placement}}, {{shape}}, {{proportions}}.

Scene: {{location}}, on {{surface}}, minimal set dressing, no clutter.
Time of day: {{time_of_day}}.

Camera: {{lens}} lens, {{angle}}, product in foreground, shallow depth of
field, background softly blurred.

Lighting: natural {{light_source}} from {{light_direction}} plus subtle
bounce fill, physically plausible shadows, realistic reflections consistent
with materials.

Composition: {{aspect}} with clean negative space {{copy_space_position}}
for ad copy, product positioned {{placement}}.

Hard exclusions: no fake logos, no distorted branding, no extra text, no
extra products, no warped perspective, no surreal props.
```

## Worked examples (verbatim)

### Example 1 — Natural Habitat
> Place the [product] in its natural real-life environment, styled realistically, keep the exact product design, branding, and proportions, use believable lighting and shadows, make the scene look like authentic commercial photography.

- Source: letsenhance.io (Lifestyle #5)
- Aspect: 4:5 / 1:1
- Best for: универсальный baseline для любого товара

### Example 2 — Minimal Interior
> Place the [product] in a modern minimal interior, clean composition, neutral styling, realistic daylight, the product remains the hero, no clutter, editorial e-commerce photography.

- Source: letsenhance.io (Lifestyle #6)
- Aspect: 4:5
- Best for: домашний декор, мебель, smart-home

### Example 3 — Outdoor Lifestyle
> Place the [product] in an outdoor setting that matches its use, natural light, realistic environment, accurate texture and color, product clearly visible, premium lifestyle product photography.

- Source: letsenhance.io (Lifestyle #7)
- Aspect: 16:9
- Best for: спорт, аутдор, путешествия, drinks

### Example 4 — Desktop Context
> Place the [product] in a realistic desk setup with complementary objects, clean arrangement, soft window light, keep the product as the focal point, modern commercial photography.

- Source: letsenhance.io (Lifestyle #9)
- Aspect: 16:9 / 4:5
- Best for: tech, productivity tools, stationery

### Example 5 — Premium Lifestyle Hero (Full Production)
> Photoreal premium lifestyle advertisement photo. The product is the hero: [PRODUCT] must match exactly: [color], [material], [finish], [logo placement], [shape], [proportions]. Scene: [specific location], on [specific surface], minimal set dressing, no clutter. Time of day: [morning/afternoon/golden hour]. Camera: 35mm lens, 3/4 angle, product in foreground, shallow depth of field, background softly blurred. Lighting: natural window light from [left/right] plus subtle bounce fill, physically plausible shadows, realistic reflections consistent with materials. Composition: 16:9 with clean negative space on the right for ad copy, product positioned on left third. Hard exclusions: no fake logos, no distorted branding, no extra text, no extra products, no warped perspective, no surreal props.

- Source: rephrase-it.com (#2)
- Aspect: 16:9
- Best for: full-production replica — копируй и заполняй

### Example 6 — Soft Shadow Play (Cozy Home)
> Photorealistic product photo of a minimalist candle jar with soft shadow patterns cast through sheer curtains, warm neutral background, cozy lifestyle lighting, subtle grain, shot on Fujifilm GFX 100S with 80mm, f/5.6, editorial home aesthetic, realistic glass reflections --ar 4:5

- Source: media.io (#7)
- Aspect: 4:5
- Best for: свечи, диффузоры, candles, home fragrance

### Example 7 — Natural Sunbeam Shelf
> Photorealistic product shot of a glass serum dropper bottle on a light wood shelf with natural sunbeam streaks, dust motes subtly visible, warm morning mood, shot on Sony A7R V with 85mm, f/4.5, realistic refractions, soft background blur, lifestyle ecommerce hybrid --ar 4:5

- Source: media.io (#10)
- Aspect: 4:5
- Best for: skincare с lifestyle нотой, шкаф / vanity полка

### Example 8 — Eco Brand Craft
> Professional product photography of a sustainable soap bar in kraft paper packaging, placed on textured linen fabric with dried botanical accents, soft daylight from right, natural shadows, warm earthy color grading, shot on Canon R5 with 50mm, f/5.6, organic lifestyle aesthetic --ar 4:5

- Source: media.io (#12)
- Aspect: 4:5
- Best for: эко-бренды, soap, candles, organic

### Example 9 — Kitchen Counter
> Photorealistic product photography of a premium olive oil bottle on a bright kitchen counter, subtle props (wood board, lemon slice, linen towel) arranged minimally, soft window light, natural shadows, shot on Sony A7IV with 50mm, f/4, warm lifestyle branding look --ar 4:5

- Source: media.io (#15)
- Aspect: 4:5
- Best for: food, кулинария, beverages

## Slot vocabulary

- **location**: modern kitchen | minimalist bathroom | sunlit living room | rustic wooden table | bright cafe corner | yoga studio | gym floor | mountain trail | beach at dusk | rooftop golden hour
- **surface**: white marble countertop | natural oak wood | light linen | concrete slab | brushed metal | matte black slate
- **time_of_day**: morning soft light | afternoon diffused | golden hour | overcast soft | window-lit
- **lens**: 35mm (wider context) | 50mm (natural) | 85mm (compressed background bokeh)
- **angle**: eye-level 3/4 | slight low | over-the-shoulder | flat-on
- **light_source**: window light | golden hour sun | overhead skylight | softbox-imitating natural
- **light_direction**: left | right | front-top | back-rim
- **copy_space_position**: on the right | top-third | left negative space | none
- **placement**: left third (rule of thirds) | dead center | foreground bottom-third
- **props** (use sparingly): wood board | folded linen towel | small ceramic dish | dried botanical sprig | book stack | fresh fruit slice
- **aspect**: 4:5 (Instagram portrait) | 16:9 (banner / hero) | 9:16 (story / TikTok still) | 1:1

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Photoreal natural light в нем выходит чище чем в Gemini, лучше handling реальных интерьеров.
- Если хочешь больше "магии" / drama / surreal nightside vibe — `google/gemini-3-pro-image-preview` иногда даёт более кинематографичный свет.
- Для consistency через сцены (тот же продукт в 5 разных средах) — gemini с `--ref product.png` на каждой генерации.

## Caveats

- **Props overload** — самая частая ошибка. "Minimal set dressing" и "no clutter" должны остаться в промпте, иначе модель заливает кадр случайным барахлом.
- **Lighting honesty** — если просишь "natural window light", не пиши одновременно "dramatic studio strobes" — модель усреднит во что-то фальшивое.
- **Logo accuracy** — для lifestyle часто промпт включает `keep the exact product design, branding, and proportions`. Если ты делаешь real brand — обязательно дай `--ref` с реальным флаконом, иначе модель додумает.
- Для русскоязычных брендов с кириллическим лейблом — пиши промпт на английском, но в `material/finish` опиши лейбл буквально ("Cyrillic brand wordmark on front, white sans-serif"); gpt-5.4-image-2 ловит лучше.
