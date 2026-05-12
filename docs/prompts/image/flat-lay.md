# Mode: flat-lay

Top-down съёмка. Раскладка на плоскости — стол, фон, мраморная доска. Идеален для cosmetics, food, accessories, beauty kits, "what's in the box".

## When to use

- Юзер просит "сверху", "flat lay", "top-down", "раскладка", "what's in my bag".
- Цель — показать состав / collection / arrangement в одном чистом кадре.
- Если центральный продукт стоит вертикально на surface — иди в [`product-shot.md`](product-shot.md) или [`lifestyle-scene.md`](lifestyle-scene.md).

## Master template (slot-fill)

```
Top-down flat lay product photography of {{subject}} on {{surface}},
{{props_description}}, {{lighting}}, {{shadow_quality}}, shot on
{{camera}} with {{lens}}, f/{{aperture}}, {{aesthetic}}, crisp details
--ar {{aspect}}
```

## Worked examples (verbatim)

### Example 1 — Top-Down Flat Lay (Generic)
> Create a top-down flat lay of the [product] on a clean studio surface, balanced composition, soft even lighting, realistic material texture, minimal shadow, commercial product photography style.

- Source: letsenhance.io (Studio #4)
- Aspect: 1:1
- Best for: универсальный baseline

### Example 2 — Flat Lay Minimal Desk
> Top-down flat lay product photography of a sleek wireless earbuds case on a clean white desk surface, minimal props (single silver pen and folded paper), soft window-like lighting from left, gentle shadows, shot on Sony A7IV with 35mm, f/6.3, modern tech aesthetic, crisp details --ar 4:5

- Source: media.io (#5)
- Aspect: 4:5
- Best for: tech accessories, productivity tools

### Example 3 — Marble Luxury Flat Lay
> Top-down product flat lay of a gold watch on white marble with subtle gray veining, minimal luxury props (silk ribbon and small ring), soft diffused studio lighting, clean shadows, shot on Canon R3 with 50mm, f/7.1, premium catalog styling, sharp metal detail --ar 4:5

- Source: media.io (#9)
- Aspect: 4:5
- Best for: luxury jewelry / watches / premium accessories

### Example 4 — Multiple Angle Composition
> Create a clean product composition showing the [product] from front, side, and slightly angled views in one frame, consistent lighting, neutral background, preserve exact color and shape, catalog-ready.

- Source: letsenhance.io (Scale #10) — *not strictly flat-lay but adjacent — multi-view raсkdown*
- Aspect: 16:9 / 4:5
- Best for: catalog "all-angles" поясняющий шот

### Example 5 — Eco Brand Flat Lay
> Professional product photography of a sustainable soap bar in kraft paper packaging, placed on textured linen fabric with dried botanical accents, soft daylight from right, natural shadows, warm earthy color grading, shot on Canon R5 with 50mm, f/5.6, organic lifestyle aesthetic --ar 4:5

- Source: media.io (#12) — adapted for top-down framing
- Aspect: 4:5
- Best for: эко-бренды, soap, candles

## Slot vocabulary

- **subject**: single product centered | hero product + accessories | "what's in the box" arrangement | collection of N items
- **surface**: clean white desk | white marble with gray veining | natural oak | matte black slate | textured linen | kraft paper | dusty pink | sage green | concrete
- **props_description**: minimal props ({{prop1}} and {{prop2}}) | no props | branded packaging beside | tissue paper folded | dried botanicals sprinkled | ingredient elements arranged near base
- **lighting**: soft window-like from left | even softbox overhead | natural daylight from right | golden hour warmth
- **shadow_quality**: gentle shadows | clean shadows | almost no shadows | dramatic side shadow
- **camera**: Sony A7IV | Canon R5 | Canon R3 | Nikon Z9
- **lens**: 35mm (wider frame) | 50mm (natural compression) | 80mm (tight)
- **aperture**: f/5.6 | f/6.3 | f/7.1 | f/8 — для flat lay нужен большой DoF чтобы всё было в фокусе
- **aesthetic**: modern tech | premium catalog | organic lifestyle | luxury editorial | minimal Scandinavian | dark moody
- **aspect**: 4:5 (Instagram portrait, default) | 1:1 (square feed) | 9:16 (story / TikTok)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Точнее раскладка предметов, лучше label sharpness на каждом элементе.
- Для очень сложных flat lay с 5+ предметами одной brand-системы — `google/gemini-3-pro-image-preview` с `--ref` всего набора лучше держит consistency.

## Caveats

- **Big aperture для flat lay** — единственная ошибка которую я бы выделил. Если попадёшь в `f/2.8` для top-down — половина композиции уйдёт в bokeh; держи f/5.6 и выше.
- **Prop overload** — top-down особенно склонен к "throw everything on the surface". `minimal props (X and Y)` с конкретным списком в две позиции работает лучше чем "tasteful arrangement".
- **Shadow direction** — solid flat lay имеет single light direction (lighting from left → shadows on right). Если в промпте смешиваются направления — модель путает реалистичность.
- **Не путай flat lay с overhead lifestyle** — flat lay строго top-down (90°). "Slightly elevated 75°" — это already lifestyle, иди в [`lifestyle-scene.md`](lifestyle-scene.md).
- **Surface texture matters** — `marble with subtle gray veining` или `textured linen` дают характер; "white background" в flat lay часто читается как studio cutout и выглядит дёшево.
