# Mode quality playbook — `lifestyle-scene`

> A product placed in a real-world lifestyle context — people, environment, and natural light around it (a kitchen counter, a desk, an outdoor table). Not an isolated studio packshot. Backing guideline: [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) (when people are in frame) + skill [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Sell the product *in use*, in a believable everyday world. A lifestyle still wins on **context credibility + product fidelity** — the scene reads as a real photograph someone took, the product sits naturally inside it (correct geometry / color / label), and any human reads as a real person, not an AI render. The environment does the storytelling (who uses this, where, why), so the scene must feel lived-in, not staged.

## Required inputs

- Product reference image (the registry declares it `required` — the product anchors fidelity even when the human / environment is the focus).
- Optional: scene description, model / persona, location, mood.

## Reference requirements

The product ref is **mandatory** as the fidelity anchor — pass it as `--ref` on every generate call so the product stays on-model inside the busier scene (#426 typed reference packs — `ralphy ref pack <id>` assembles the typed set; lifestyle-scene declares `product` as the required ref).

**Demand more refs when:**
- A **recurring human** must hold across stills → generate a master-portrait first and pass it as a second `--ref` on every shot (the identity will NOT carry between turns otherwise).
- The product is a **named real brand / IP** → the reference-required gate (AGENTS #3) fires; the product ref satisfies it.
- A **specific location** must repeat across the set → shoot a location-master-plate (the wide front of the set with the characters in it) and pass it alongside the product + portrait refs. Skipping it is the #1 cause of "different couch / kitchen every shot".

A no-name / generic product in a generic setting proceeds with just the product ref + the quick-research output — the default flow does not require a brand ref.

## Quick research default

`lifestyle-scene` carries `defaultResearchDepth: "quick"` (#416). A low-detail brief, a product / brand URL, or a platform performance goal auto-triggers it — route to the **quick** surface (the site-grounding sub-agent / a few `ralphy ref pull`) so the palette, the real product look, and the use-context are grounded, not invented. Distill the result into `artifacts/refs/research-facts.json`. The reference gate is a separate axis: generic product/lifestyle still proceeds without USER refs after research; named real entities gate.

## Prompt spine

Build the prompt with the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured schema. When a person is in frame, fold in the [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) six-token spine:

1. **`scene` + `environment`** — the real-world setting and the moment of use; where the product sits and what the human is doing with it. Keep it candid, not posed.
2. **Camera + lens, named** — `Shot on Sony A7 IV with Sigma 35mm f/2.0` (35mm wide for environment, 50/85mm for tighter product-with-person), eye-level.
3. **Film stock + grade** — `Natural Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade` to kill the digital gloss.
4. **Human realism cluster (when people are in frame)** — named asymmetry + 2-3 specific imperfections (mole, flyaway, stubble), `natural skin texture with visible pores, no styling product gloss`, single soft light source, and the closing register clause `Hyperreal, photoreal, NOT glossy. Naturalistic, candid, not staged.`
5. **`quality.avoid`** — the photoreal negative cluster verbatim (`beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores, exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look, perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe, ring light catch in eyes`) plus anti-AI-slop scene tells.
6. **Aspect:** `--size` per placement (9:16 for social, 4:5 / 1:1 for feed). Name it explicitly.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default / scene anchor + multi-ref cohesion — `google/gemini-3-pro-image-preview`.** Best at honouring `--ref` for identity lock (product + recurring person + location) with low drift across shots; the strongest pick when the same model / product / location must repeat.
- **Master-portrait of a new person (no ref) — `openai/gpt-5.4-image-2`.** Strongest at "real person, plain backdrop" from text alone; generate the portrait here, then carry it as `--ref` into the scene.

## Style / visual constraints

- Real-world environment with natural / motivated light — never a seamless studio sweep (that is `product-shot`).
- Look-past-the-camera, not into the lens; mouth gently closed — eye-contact + open-smile read as a staged stock photo.
- Head-and-upper-chest or environment-wide framing is safest; full-body reveals hand-rendering failures.
- The product stays on-model — pass the product ref every time so the lifestyle treatment does not drift its geometry / label.

## Common failure modes

- **Plastic / airbrushed skin, Disney-eyes** → the photoreal negative cluster + the explicit skin-pore and asymmetry tokens; `beauty filter` + `enlarged eyes` are the load-bearing negatives.
- **Staged stock-photo vibe** → look-past-the-camera, candid action, `not staged` closing clause, motivated single light source.
- **Anatomy failures (fingers fused, torso into furniture)** → run the guideline's anatomy gate before accepting; regenerate, don't edit over it.
- **Person / location drifts between shots** → master-portrait + location-master-plate as refs on every downstream gen.
- **Wrong product identity in the busy scene** → re-anchor on the locked product ref (the fidelity gate catches this).

## Variant strategy

Generate a small contextual set (1-6 stills per the Unit shape) — vary the angle, the moment of use, and the framing (wide environment → product-with-hands → tighter beauty) while holding the SAME product / person / location refs. Explore alternatives with `--variants N` and curate the winners; never re-roll a person-bearing shot without the portrait ref.

## Evaluation criteria

Two passes:
- `scoreImage` gate (refuses, not warns — AGENTS #4). Twice-failed → stop and report options.
- **Product fidelity gate (#422)** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`), the commercial-mode product / brand identity gate. For a named real product a materially wrong product/logo/palette is a HARD `fail` that blocks ship-ready; it compares the generated stills against the locked product refs (#426) + any `ProductBrandFacts`.

Beyond the gates: the scene reads as a real photograph, the product is recognizable and on-model, any human passes the skin-pore + asymmetry + no-ring-light check, and the recurring person / location holds across the set.

## Does NOT apply to:

- A clean studio packshot on a controlled background → that is [`product-shot.md`](product-shot.md).
- A surreal / artistic key-visual where the product lives inside a metaphor → [`conceptual-product.md`](conceptual-product.md).
- A tight shot of a person holding / wearing the product (hand-in-frame macro) → `closeup-product-with-person` (photoreal-studio-portraits guideline).
- A talking-head UGC review / testimonial video → `ugc-review` (`/ugc-ad`).
- A moving / video lifestyle spot → match a video mode.
