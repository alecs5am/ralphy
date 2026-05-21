# Mode: virtual-model-tryout

AI-generated model wears / uses the product. Full person or substantial part (shoulders + face, torso, hands up to chest). This is a premium-format UGC advertising — looks like a studio photoshoot with a model, but without budget and time-cost of a real shoot.

## When to use

- User asks "AI-model wears", "virtual try-on", "model wearing X", "person using product on camera", "lookbook shot".
- Goal — premium-presentation of the product with human emotion.
- If you only need hands / partial face — go to [`closeup-with-person.md`](closeup-with-person.md).
- If showing a real person (real person from a brand) — mandatory `--ref` photo (see AGENTS.md "Reference-required gate"), otherwise face-similarity is not guaranteed.

## Master template (slot-fill)

```
Photoreal premium {{format}} of a {{model_description}} {{action}} the
{{product}}, exact product design: {{material}}, {{color}}, {{finish}},
{{logo_placement}}.

Model: {{age}} {{gender}} with {{skin_tone}} skin, {{hair_description}},
natural confident expression, {{clothing}}.

Scene: {{location}}, {{set_dressing}}, time of day: {{time}}.

Camera: {{lens}}, {{angle}}, {{framing}}, shallow depth of field with
model and product in focus.

Lighting: {{key_light}} from {{direction}}, soft fill, natural skin
rendering with realistic texture, controlled specular highlights on product.

Composition: {{aspect}}, model {{model_placement}}, product {{product_placement}},
clean negative space {{negative_space}}.

Hard exclusions: no warped hands, no extra fingers, no distorted facial
features, no extra people, no extra products, no fake logo, no watermark.
```

## Worked examples (verbatim)

### Example 1 — Model Using the Product Naturally
> Show a model naturally using the [product] in a realistic setting, keep the product fully accurate in shape, size, and branding, product clearly visible, natural pose, commercial lifestyle photography.

- Source: letsenhance.io (With-People #14)
- Aspect: 4:5 / 9:16
- Best for: universal baseline

### Example 2 — Wearing Jewelry Close-up
> Ultra-realistic product lifestyle photo of a model wearing a delicate gold necklace, close-up from collarbone to chin, soft studio lighting, skin texture natural, necklace sparkling with controlled highlights, minimal background, shot on Nikon Z9 with 105mm, f/4, luxury campaign look --ar 4:5

- Source: media.io (#22)
- Aspect: 4:5
- Best for: jewelry, fragrance neck shot

### Example 3 — Gym In Use
> Photorealistic lifestyle product shot of an athletic person gripping a branded shaker bottle, gym background softly blurred, dramatic side lighting with sweat highlights, confident energetic mood, shot on Sony A1 with 85mm, f/2.8, shallow depth of field, ad-ready composition --ar 4:5

- Source: media.io (#25)
- Aspect: 4:5
- Best for: sports, supplements, energy drinks

### Example 4 — Custom: Skincare Routine Selfie
*(synthesised from media.io #20 / #14 patterns — adapted for AI tryout)*
> Photoreal premium portrait of a 28-year-old woman with warm light-brown skin and natural shoulder-length dark hair, applying a serum dropper to her cheek with one hand, the other hand holding the bottle visible in frame, exact product: clear glass dropper bottle with white minimalist label, soft window light from camera-right, neutral pale blush background, shallow depth of field with face and product in sharp focus, shot on Canon R5 with 85mm at f/3.5, modern beauty ad style, --ar 4:5

- Source: synthesised (not verbatim — working example of master template)
- Aspect: 4:5
- Best for: skincare routine demonstration

## Slot vocabulary

- **model_description**: 25-year-old woman | 35-year-old man | athletic young adult | mature woman in her 50s | teenage skater | minimal-style female model
- **age** + **gender**: 22 woman | 34 man | etc. — Always specific.
- **skin_tone**: light | warm light-brown | medium olive | deep brown | natural neutral
- **hair_description**: shoulder-length dark hair | short pixie blonde | long curly natural | braided up | shaved sides
- **clothing**: minimal beige sweater | white t-shirt | athletic top | casual lined linen shirt | no visible clothing (close-crop)
- **action**: holding | applying | wearing | drinking | inspecting | using | trying on | spritzing
- **location**: clean studio background | minimalist bathroom | gym floor | sunlit kitchen | rooftop golden hour | neutral lifestyle backdrop
- **lens**: 50mm (natural perspective) | 85mm (flattering portrait) | 105mm (compressed bokeh)
- **angle**: eye-level 3/4 | slight low hero | over-shoulder | bust-up frontal
- **framing**: bust-up | head and shoulders | collarbone to chin | full body | three-quarter (waist up)
- **model_placement** / **product_placement**: model center-left, product right hand visible | model behind product, product in focus foreground | etc.
- **aspect**: 4:5 | 9:16 | 1:1 | 16:9

## Model recommendation

- **Default — `openai/gpt-5.4-image-2`**. Better holds hands (less extra fingers), more accurate face, cleaner skin texture.
- **For consistency across 3-5 scenes** (same model in 5 different environments with the same product) — mandatory `google/gemini-3-pro-image-preview` with `--ref model.png --ref product.png` on each generation. This is nano-banana lineage, it is the best at multi-ref consistency.
- **Real brand ambassador** — `--ref` with a real photo of the model is mandatory. Without it Hard invariant #3 (reference-required gate) is violated.

## Caveats

- **Faces are hard** — even gpt-5.4-image-2 sometimes gives an asymmetric face. Usually fixed by a re-roll or adding `symmetrical natural features` to "Hard exclusions".
- **Hands are harder** — the most common failure mode. If you do an action involving hands (applying, holding two items, drinking), explicitly add `realistic five-finger anatomy, no warped hands, no extra fingers, hands proportional to face`.
- **Brand-specific model** — if the task says "use our model from previous shoot", without `--ref` it won't work. Refuse and ask for a reference.
- **Product accuracy** — with focus on the model, the product often drifts into "approximate vibe". Mandatory `exact product design: {{material}}, {{color}}, {{finish}}, {{logo_placement}}` in the prompt, and ideally `--ref product.png`.
- **Diverse cast** — if skin tone / age / gender is not specified in the prompt, the model goes to default (young white woman). This is often not what is needed — specify explicitly.
- **No nudity / no suggestive** — for clothing / beauty / underwear, if you want a shot above-collarbone — explicitly `framed from neck-up only, no visible torso below shoulders`. Otherwise the model can go into neutral underwear that is not ad-friendly.
- **AI-tell signs** to avoid: looking straight at the camera with too "perfect" lighting — looks CGI. Better "natural confident expression, slight off-camera glance, candid moment" — reads more human.
