# Mode: flat-lay

Top-down shot. Layout on a flat surface — table, background, marble board. Ideal for cosmetics, food, accessories, beauty kits, "what's in the box".

## When to use

- User asks "from above", "flat lay", "top-down", "layout", "what's in my bag".
- Goal — show the composition / collection / arrangement in one clean frame.
- If the central product stands vertically on a surface — go to [`product-shot.md`](product-shot.md) or [`lifestyle-scene.md`](lifestyle-scene.md).

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
- Best for: universal baseline

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

- Source: letsenhance.io (Scale #10) — *not strictly flat-lay but adjacent — multi-view breakdown*
- Aspect: 16:9 / 4:5
- Best for: catalog "all-angles" explanatory shot

### Example 5 — Eco Brand Flat Lay
> Professional product photography of a sustainable soap bar in kraft paper packaging, placed on textured linen fabric with dried botanical accents, soft daylight from right, natural shadows, warm earthy color grading, shot on Canon R5 with 50mm, f/5.6, organic lifestyle aesthetic --ar 4:5

- Source: media.io (#12) — adapted for top-down framing
- Aspect: 4:5
- Best for: eco-brands, soap, candles

## Slot vocabulary

- **subject**: single product centered | hero product + accessories | "what's in the box" arrangement | collection of N items
- **surface**: clean white desk | white marble with gray veining | natural oak | matte black slate | textured linen | kraft paper | dusty pink | sage green | concrete
- **props_description**: minimal props ({{prop1}} and {{prop2}}) | no props | branded packaging beside | tissue paper folded | dried botanicals sprinkled | ingredient elements arranged near base
- **lighting**: soft window-like from left | even softbox overhead | natural daylight from right | golden hour warmth
- **shadow_quality**: gentle shadows | clean shadows | almost no shadows | dramatic side shadow
- **camera**: Sony A7IV | Canon R5 | Canon R3 | Nikon Z9
- **lens**: 35mm (wider frame) | 50mm (natural compression) | 80mm (tight)
- **aperture**: f/5.6 | f/6.3 | f/7.1 | f/8 — for flat lay you need a large DoF so that everything is in focus
- **aesthetic**: modern tech | premium catalog | organic lifestyle | luxury editorial | minimal Scandinavian | dark moody
- **aspect**: 4:5 (Instagram portrait, default) | 1:1 (square feed) | 9:16 (story / TikTok)

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. More accurate layout of objects, better label sharpness on each element.
- For very complex flat lay with 5+ items of one brand-system — `google/gemini-3-pro-image-preview` with `--ref` of the entire set better holds consistency.

## Caveats

- **Big aperture for flat lay** — the only mistake I would highlight. If you land on `f/2.8` for top-down — half the composition will go into bokeh; keep f/5.6 and above.
- **Prop overload** — top-down is especially prone to "throw everything on the surface". `minimal props (X and Y)` with a specific list in two positions works better than "tasteful arrangement".
- **Shadow direction** — solid flat lay has a single light direction (lighting from left → shadows on right). If directions are mixed in the prompt — the model confuses realism.
- **Don't confuse flat lay with overhead lifestyle** — flat lay is strictly top-down (90°). "Slightly elevated 75°" — that is already lifestyle, go to [`lifestyle-scene.md`](lifestyle-scene.md).
- **Surface texture matters** — `marble with subtle gray veining` or `textured linen` gives character; "white background" in flat lay often reads as studio cutout and looks cheap.
