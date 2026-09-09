# Mode quality playbook — `conceptual-product`

> A surreal / artistic product concept image — a campaign key-visual, not a literal catalog shot. Backing skill: [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Make the product the hero of an idea, not a packshot. A conceptual key-visual wins on **one bold visual metaphor** that ties the product to its promise (speed, calm, abundance, danger) while keeping the product itself recognizable. It is a campaign surface — the literal catalog still is a different mode. The image should make the viewer feel the concept before they parse the product.

## Required inputs

- Product reference image.
- Concept direction (the idea / metaphor / mood the visual must carry).

## Reference requirements

The product reference is required as craft input (the concept must keep the real product on-model). The reference-required gate fires additionally for a named real branded product or IP — pass the product image as `--ref`. A no-name / fictional product proceeds with just the supplied product ref. Style is brief-driven — no mandatory register lock unless the brief names one (then fold its `@guideline:<slug>` in).

## Prompt spine

Use the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured-prompt schema:
1. **`scene`** — the surreal idea in one dense paragraph; the product placed inside the metaphor, still recognizable.
2. **`style` + `technical`** — the chosen art register (color story, medium, rendering quality), lens / camera spec.
3. **`environment` + `composition`** — the surreal devices (scale shift, impossible physics, dream space) and where the eye lands.
4. **`quality`** — fidelity tokens + an `avoid` cluster (kill literal-catalog framing, kill AI-slop tells).
5. **Aspect:** `--size` per placement (vertical campaign `1080x1920`, square `1080x1080`).

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `google/gemini-3-pro-image-preview`.** Strong at surreal composition + multi-ref product consistency; cheaper / faster for concept exploration.
- **Premium — `openai/gpt-5.4-image-2`.** Use when the concept bakes legible typography or a precise wordmark into the key-visual.
- For safety-sensitive registers (body-horror / cryptid concept art) gpt-image clears prompts gemini returns `IMAGE_SAFETY` on — see `MEMORY.md` image-safety-thresholds.

## Style / visual constraints

- The product stays recognizable — a concept that loses the product is a failed brief.
- Commit to ONE metaphor; stacking two reads as noise.
- Pass the product ref to prevent the surreal treatment from drifting it off-model.

## Common failure modes

- **Concept so abstract the product vanishes** → restate the product in the `scene` + pass it as `--ref`.
- **Drifts to literal catalog framing** → put literal-packshot terms in `quality.avoid`.
- **AI-slop tells (plastic surfaces, beauty glaze)** → fold the anti-AI-slop negative cluster into `quality.avoid`.

## Evaluation criteria

`scoreImage` gate (refuses, not warns). Beyond the gate: the metaphor is legible, the product is recognizable and on-model, the register is committed and clean, no AI-slop tells.

## Does NOT apply to:

- A clean studio packshot on a controlled background → that is `product-shot` (cgi-product-renders guideline).
- A lifestyle scene of the product in a real-world context → `lifestyle-scene`.
- A brand drop poster (wordmark + hero collage) → use [`/poster`](../../../.agents/skills/poster/SKILL.md).
- A moving / video concept → match a video mode.
- Re-skinning a supplied image into a new look → use [`restyle.md`](restyle.md).
