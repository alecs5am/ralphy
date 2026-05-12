# Mode: iteration-edit

Change-one-thing. У тебя есть базовая генерация (или real photo) — нужно поменять *только* фон / цвет / shadow / props, остальное оставить идентичным. Канонический формат для серии вариантов под A/B тест или адаптации под разные плейсменты.

## When to use

- Юзер просит "поменяй только X", "тот же продукт но Y", "перегенерь с другим фоном", "make this background warmer", "swap props".
- Цель — surgical edit, сохранение идентичности продукта / кадра / композиции.
- Если перерисовываешь с нуля — иди в [`product-shot.md`](product-shot.md) или другой подходящий mode.

## Master template (slot-fill)

```
Use the previous image as the base. Keep the product identity exactly the
same: same shape, proportions, color, material, logo placement, and camera
angle. Keep lighting and background unchanged.

Change only: {{the_one_change}}.

Do not add props. Do not change framing. Do not change the product.

Hard exclusions: no style change, no text, no watermark, no extra objects,
no perspective shift, no new lighting direction.
```

## Worked examples (verbatim)

### Example 1 — Change-One-Thing (Canonical)
> Use the previous image as the base. Keep the product identity exactly the same: same shape, proportions, color, material, logo placement, and camera angle. Keep lighting and background unchanged. Change only: [ONE CHANGE], e.g., 'background color from #FFFFFF to #F4F1EA' or 'add a softer shadow'. Do not add props. Do not change framing. Do not change the product. Hard exclusions: no style change, no text, no watermark, no extra objects.

- Source: rephrase-it.com (#5)
- Aspect: preserve previous
- Best for: surgical edits — копируй и заполняй

### Example 2 — Multiple Angle Composition (Same Product)
> Create a clean product composition showing the [product] from front, side, and slightly angled views in one frame, consistent lighting, neutral background, preserve exact color and shape, catalog-ready.

- Source: letsenhance.io (Scale #10)
- Aspect: 16:9 / 4:5
- Best for: "тот же продукт под другим углом"

### Example 3 — Open-and-Closed View
> Show the [product] in both closed and open state in one clean composition, preserve accurate design details, simple studio background, realistic shadow, e-commerce comparison layout.

- Source: letsenhance.io (Scale #11)
- Aspect: 16:9
- Best for: jewelry box, packaging, cosmetics с открытой/закрытой крышкой

### Example 4 — Seasonal Re-skin (Same Product)
*(synthesised from letsenhance #16-20 series)*
> Use the previous image as the base. Keep the product identity exactly the same: same shape, proportions, color, material, logo placement, and camera angle. Keep lighting unchanged. Change only: background and styling theme to {{season}} ({{season_palette}}, {{season_props_if_minimal}}). Hard exclusions: no style change to product, no text, no watermark, no perspective shift.

- Source: synthesised — adapter master template
- Aspect: preserve previous
- Best for: BFCM, spring launch, holiday gifting серия

## How to invoke

Передавай `--ref` с предыдущим изображением, и в `--prompt` пиши master template с заполненным `{{the_one_change}}`. Например:

```bash
ralphy generate image \
  --project my-brand-2026 \
  --slot hero-warm \
  --model openai/gpt-5.4-image-2 \
  --ref workspace/projects/my-brand-2026/assets/images/hero-white.png \
  --prompt "Use the previous image as the base. Keep the product identity exactly the same: same shape, proportions, color, material, logo placement, and camera angle. Keep lighting unchanged. Change only: background colour from pure white (#FFFFFF) to warm cream (#F4F1EA). Do not add props. Do not change framing. Do not change the product. Hard exclusions: no style change, no text, no watermark, no extra objects."
```

## Slot vocabulary (for the_one_change)

Один реальный edit за раз. Если хочешь два изменения — делай два iteration-edit-а последовательно.

- **background colour swap**: `background colour from pure white (#FFFFFF) to {{new_color_hex_or_name}}`
- **shadow adjustment**: `add a softer shadow under product` | `harder dramatic shadow offset right` | `remove all shadow`
- **lighting warmth shift**: `warmer light temperature (3200K candle warmth) keeping direction the same`
- **prop swap (если props были)**: `replace the {{old_prop}} with {{new_prop}} in the same position, same scale`
- **angle micro-shift** (рискованно — часто меняет всё): `same scene but camera shifted 15° to the left, all else identical`
- **brand-coloured backdrop**: `seamless solid backdrop in brand colour {{HEX}}`
- **seasonal restyle (минимальный)**: `add a single seasonal accent of {{season_prop}} in lower-right corner, no other changes`
- **add/remove single element**: `remove the small ceramic dish from the right side` | `add a single dried botanical sprig at base of product`

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Чище держит исходный объект — лучше для surgical edits.
- **Альтернатива — `google/gemini-3-pro-image-preview`**. Иногда iteration через gemini пластичнее (особенно для colour swap и lighting tweak), потому что nano-banana специально натренирован на multi-ref edit задачи.

Имеет смысл попробовать обе если первый рендер не сохраняет identity.

## Caveats

- **One change at a time** — главное правило. Если поменяешь background + shadow + colour одновременно, модель скорее всего "перерисует" всё.
- **Ref is mandatory** — без `--ref` "Use the previous image as the base" работает только если в чате контекст был, но через ralphy CLI оно stateless. Всегда передавай реальный файл через `--ref`.
- **Identity drift** — gpt-image-2 и gemini обе иногда чуть меняют пропорции продукта при iteration. Если критично — добавь явно `EXACT same proportions, same angle within 1 degree, same scale`.
- **No style transfer here** — если хочешь "make this look like a Wes Anderson shot" — это **не** iteration-edit, это `restyle` (нет в v1 cookbook, добавим если попросишь).
- **Negative space preservation** — для баннеров если negative space был критичен, добавь `preserve same negative-space layout` явно.
