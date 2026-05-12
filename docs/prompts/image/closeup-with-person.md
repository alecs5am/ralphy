# Mode: closeup-with-person

Тесный кроп: продукт + руки / частичное лицо / тело (без полного портрета). Самый "UGC-ish" формат — выглядит как real-life user demo. Канонический для beauty, skincare, drinks, tech accessories.

## When to use

- Юзер просит "рука держит", "в использовании", "applying", "swipe", "unboxing", "model using closely".
- Цель — показать demo / scale / texture of use, не сцену и не studio.
- Если нужна полноразмерная модель — иди в [`virtual-model-tryout.md`](virtual-model-tryout.md).
- Если только текстура без рук — иди в [`macro-detail.md`](macro-detail.md).

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
- Best for: универсальный "in-use" demo

### Example 2 — Hand-Only Premium Detail
> Show elegant hands interacting with the [product], no face visible, clean composition, shallow depth of field, realistic commercial lighting, focus on product and usage.

- Source: letsenhance.io (With-People #15)
- Aspect: 4:5
- Best for: premium beauty / skincare / jewelry — без лица для скорости и универсальности

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
- Best for: DTC unboxing hero, "first impression" сцены

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
- Best for: показать масштаб (телефон, аксессуары, jar)

### Example 9 — Pouring Coffee Action
> Photorealistic product shot of a person pouring freshly brewed coffee from a branded carafe into a ceramic cup, warm window light, steam visible, cozy morning mood, focus on product branding, shot on Canon R6 with 50mm, f/2.8, natural motion blur controlled, editorial lifestyle --ar 4:5

- Source: media.io (#21)
- Aspect: 4:5
- Best for: beverages, coffee, kitchen products в движении

## Slot vocabulary

- **body_part**: well-groomed hand | elegant hands | two hands | one hand | forearm | collarbone to chin | side profile | hands and partial face | bare shoulders
- **action**: holding | applying | pouring | gripping | opening | swiping | spritzing | unboxing | wearing
- **focus_target**: product label | texture on skin | product in fingers | branding on cap | swatch on forearm
- **lens**: 50mm | 85mm | 100mm macro | 105mm (compressed bokeh)
- **aperture**: f/2.8 | f/3.2 | f/4 | f/5.6 — shallow для bokeh, средне для texture
- **light_source**: soft diffused studio | window light | softbox key | overhead skylight
- **direction**: front | side | top | back-rim
- **background**: clean neutral | softly blurred lifestyle | dark blurred mood | plain warm beige
- **aspect**: 4:5 (Instagram portrait) | 9:16 (TikTok / Reels still) | 1:1
- **skin_tone** (если важно): natural neutral | warm | cool | brown | olive

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Чище руки (меньше "warped hands" / extra fingers), точнее skin texture, лучше типографика лейбла под пальцами.
- Если нужна та же модель/руки через 3-5 сцен (consistency) — `google/gemini-3-pro-image-preview` с `--ref hand-reference.png` + `--ref product.png`.
- **Никогда не давай только текстовый промпт с конкретным real person** — обязательно референс, иначе face-similarity не гарантирован (см. AGENTS.md "Reference-required gate").

## Caveats

- **Warped hands** — главная failure mode. Если видишь 4 или 6 пальцев — повтори со словами `realistic five-finger anatomy, no warped hands, no extra fingers` в "Hard exclusions".
- **Skin tone drift** — если делаешь для конкретного бренда с конкретной моделью, всегда давай `--ref` с реальной кожей; модель сама подберёт "average warm" без контекста.
- **Label readability** — для UGC где упор на продукт, обязательно `label sharp and readable, product branding accurate`. Иначе модель может смазать в фоне.
- **No face vs partial face** — если хочешь "no face visible", напиши явно `no face visible, framed from neck-down only`; модель часто додумывает лицо в кадр.
- **Cyrillic labels** — описывай словами; модель не отрисует кириллицу буква-в-букву, но даст похожий на правду wordmark если описать стиль ("Cyrillic sans-serif wordmark in white").
