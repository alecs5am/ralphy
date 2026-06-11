# Mode: iteration-edit

Change-one-thing. You have a base generation (or real photo) — need to change *only* background / color / shadow / props, leave the rest identical. Canonical format for a series of variants for A/B tests or adaptations for different placements.

## When to use

- User asks "change only X", "same product but Y", "regenerate with different background", "make this background warmer", "swap props".
- Goal — surgical edit, preservation of product / frame / composition identity.
- If redrawing from scratch — go to [`product-shot.md`](product-shot.md) or another suitable mode.

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
- Best for: surgical edits — copy and fill

### Example 2 — Multiple Angle Composition (Same Product)
> Create a clean product composition showing the [product] from front, side, and slightly angled views in one frame, consistent lighting, neutral background, preserve exact color and shape, catalog-ready.

- Source: letsenhance.io (Scale #10)
- Aspect: 16:9 / 4:5
- Best for: "same product from a different angle"

### Example 3 — Open-and-Closed View
> Show the [product] in both closed and open state in one clean composition, preserve accurate design details, simple studio background, realistic shadow, e-commerce comparison layout.

- Source: letsenhance.io (Scale #11)
- Aspect: 16:9
- Best for: jewelry box, packaging, cosmetics with open/closed lid

### Example 4 — Seasonal Re-skin (Same Product)
*(synthesised from letsenhance #16-20 series)*
> Use the previous image as the base. Keep the product identity exactly the same: same shape, proportions, color, material, logo placement, and camera angle. Keep lighting unchanged. Change only: background and styling theme to {{season}} ({{season_palette}}, {{season_props_if_minimal}}). Hard exclusions: no style change to product, no text, no watermark, no perspective shift.

- Source: synthesised — adapter master template
- Aspect: preserve previous
- Best for: BFCM, spring launch, holiday gifting series

## How to invoke

Pass `--ref` with the previous image, and in `--prompt` write master template with filled `{{the_one_change}}`. For example:

```bash
ralphy generate image \
  --project my-brand-2026 \
  --slot hero-warm \
  --model openai/gpt-5.4-image-2 \
  --ref .ralphy/workspaces/<ws>/projects/my-brand-2026/artifacts/images/hero-white.png \
  --prompt "Use the previous image as the base. Keep the product identity exactly the same: same shape, proportions, color, material, logo placement, and camera angle. Keep lighting unchanged. Change only: background colour from pure white (#FFFFFF) to warm cream (#F4F1EA). Do not add props. Do not change framing. Do not change the product. Hard exclusions: no style change, no text, no watermark, no extra objects."
```

## Slot vocabulary (for the_one_change)

One real edit at a time. If you want two changes — do two iteration-edits sequentially.

- **background colour swap**: `background colour from pure white (#FFFFFF) to {{new_color_hex_or_name}}`
- **shadow adjustment**: `add a softer shadow under product` | `harder dramatic shadow offset right` | `remove all shadow`
- **lighting warmth shift**: `warmer light temperature (3200K candle warmth) keeping direction the same`
- **prop swap (if props were present)**: `replace the {{old_prop}} with {{new_prop}} in the same position, same scale`
- **angle micro-shift** (risky — often changes everything): `same scene but camera shifted 15° to the left, all else identical`
- **brand-coloured backdrop**: `seamless solid backdrop in brand colour {{HEX}}`
- **seasonal restyle (minimal)**: `add a single seasonal accent of {{season_prop}} in lower-right corner, no other changes`
- **add/remove single element**: `remove the small ceramic dish from the right side` | `add a single dried botanical sprig at base of product`

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Cleaner holds the source object — better for surgical edits.
- **Alternative — `google/gemini-3-pro-image-preview`**. Sometimes iteration via gemini is more pliable (especially for colour swap and lighting tweak), because nano-banana is specifically trained on multi-ref edit tasks.

Makes sense to try both if the first render does not preserve identity.

## Caveats

- **One change at a time** — the main rule. If you change background + shadow + colour at the same time, the model will most likely "redraw" everything.
- **Ref is mandatory** — without `--ref` "Use the previous image as the base" only works if there was context in the chat, but via ralphy CLI it is stateless. Always pass a real file via `--ref`.
- **Identity drift** — gpt-image-2 and gemini both sometimes slightly change product proportions during iteration. If critical — add explicitly `EXACT same proportions, same angle within 1 degree, same scale`.
- **No style transfer here** — if you want "make this look like a Wes Anderson shot" — this is **not** iteration-edit, this is `restyle` (not in v1 cookbook, will add if you ask).
- **Negative space preservation** — for banners if negative space was critical, add `preserve same negative-space layout` explicitly.
