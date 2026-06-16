# Mode quality playbook — `product-shot`

> A clean studio packshot of a single product on a controlled background — the e-commerce hero / catalog still, not a campaign concept. Backing guideline: [`cgi-product-renders`](../../../guidelines/cgi-product-renders/) + skill [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Make the product the unambiguous subject, rendered correctly, on a controlled studio background. A packshot wins on **fidelity + clean light** — the geometry, color, material, and any wordmark match the real product exactly, and the background / lighting flatter it without competing. The viewer reads "this is the product" in under a second; there is no metaphor and no scene. The literal still is the deliverable buyers and listings consume.

## Required inputs

- Product reference image (the registry declares `requiredRefTypes: ["product"]` — the product ref is mandatory, not optional).
- Optional: brand palette, background spec, lighting register, target aspect ratio.

## Reference requirements

The product ref is **mandatory** for this mode (#426 typed reference packs — `ralphy ref pack <id>` assembles the typed set and declares `product` as a required ref type for product-shot). Product fidelity is the gate, so the locked product ref is the source of truth: pass it as `--ref` on **every** generate call. Geometry drifts after 2-3 unrefed regens (per the cgi-product-renders guideline) — never let an angle variant run without the ref.

The reference-required gate (AGENTS #3) additionally fires for a named real branded product or recognizable IP — the same product ref satisfies it. A no-name / generic product still requires the product ref as craft input here (the mode declares it required), but does not gate on brand identity.

## Prompt spine

Build the prompt with the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured schema, folding in the [`cgi-product-renders`](../../../guidelines/cgi-product-renders/) rules:

1. **Product-DNA paragraph (mandatory, verbatim across angles).** Name form-factor, dimensions, body color / material, every accent and UI element with its location. This is the device fingerprint — it must be word-for-word identical across the front-hero, 3/4, top-down, and macro variants or geometry drifts.
2. **`scene` / pose** — one of the five reusable shot archetypes (front hero · 3/4 low-angle heroic · 90° top-down · macro screen · macro internals). Only the pose line changes per variant.
3. **`style` + `technical`** — CGI product render framing (not "realistic photo", which slides to stock-photo register), controlled studio background, the **coloured rim-light pair** (one warm + one cool from opposite sides + light atmospheric haze — the single highest-leverage token), glossy specular highlights, `8K detail`.
4. **`quality.avoid`** — the guideline's mandatory negative cluster: `no flat key-light look`, `no ring-light catch on the casing`, no clutter, no human hand, no unintended shadow, no random reflections, no text overlays other than the named device logo, no banding on the gradient background.
5. **Aspect:** `--size` per placement (9:16 vertical hero `1080x1920`, square catalog `1080x1080`). Pass `--size` explicitly — gpt-image ignores the in-prompt hint and defaults to 1024².

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `google/gemini-3-pro-image-preview`.** Renders precise device geometry from a textual product-DNA description; best for the hero anchor and clean compositions; multi-ref product consistency.
- **Premium / series continuation — `openai/gpt-5.4-image-2`.** Stronger at preserving exact device geometry across multiple shots once the hero is locked, and at crisp embedded typography / labels where a wordmark must read legibly.
- Pass the hero anchor as `--ref` on every downstream angle.

## Style / visual constraints

- One palette per project (dark-cinematic-tech OR sunny-kawaii-yellow-pink per the guideline), held across the whole set — mixing palettes mid-series breaks coherence.
- Controlled background only (seamless, gradient, or a single material plane). No environment, no people, no lifestyle context.
- Pin both rim lights by color AND direction — vague "studio lighting" yields a single soft key and flattens the render to catalog-stock.
- Keep the product DNA paragraph on macro shots too; the model uses it to render correct bezel materials and button shapes even on a tight crop.

## Common failure modes

- **Geometry drift across angles** → carry the verbatim product-DNA paragraph + pass the hero `--ref` on every variant.
- **Flat catalog-stock look** → restore the two-rim-light line (color + direction) and the `no flat key-light look` negative; switch "realistic photo" to "CGI product render".
- **Wrong product identity (logo / proportions / color)** → this is the fidelity failure the gate catches; re-anchor on the locked product ref.
- **Soft / mushy wordmark** → switch the typography-bearing shot to `openai/gpt-5.4-image-2`.

## Variant strategy

Generate a small set of angles, not one packshot — a few archetypes (front hero → 3/4 low-angle → top-down → an optional macro) covers a listing. Each is the SAME product-DNA + palette + ref, varying only the pose line. The Unit shape is 1-4 stills of a single product, so keep the set tight and curate the winners; explore alt poses with `--variants N` and select per slot rather than re-rolling blindly.

## Evaluation criteria

Two passes:
- `scoreImage` gate (refuses, not warns — AGENTS #4). If it fails twice in a row, stop and report concrete options; do not paper over with editing.
- **Product fidelity gate (#422)** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`), the commercial-mode product / brand identity gate. For a named real product it is a HARD gate: a materially wrong product/logo/palette is a `fail` that blocks ship-ready, not a soft note. It compares the generated stills against the locked product refs (#426) + any `ProductBrandFacts`.

Beyond the gates: the geometry matches the product-DNA (count the buttons, verify port / accent locations), both rim lights are distinguishable, atmospheric haze is present, the background is controlled and uncluttered, no human elements.

## Does NOT apply to:

- A surreal / artistic key-visual where the product lives inside a metaphor → that is [`conceptual-product.md`](conceptual-product.md).
- A product placed in a real-world environment with people / setting → [`lifestyle-scene.md`](lifestyle-scene.md).
- A tight shot of a person holding / wearing the product → `closeup-product-with-person` (photoreal-studio-portraits guideline).
- A brand-drop poster (wordmark + hero collage + copy) → use [`/poster`](../../../.agents/skills/poster/SKILL.md).
- A SET of role-typed stills (App Store / ad-creative pack) → use [`image-pack.md`](image-pack.md).
- A moving / video product reveal → match a video mode.
