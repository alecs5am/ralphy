# Mode quality playbook — `closeup-product-with-person`

> A tight shot of a person holding / using / wearing the product — a hand-in-frame, UGC-flavored still where the product and the skin around it share the frame. Not an isolated packshot, not a wide lifestyle scene. Backing guideline: [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) + skill [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Sell the product *in hand* — the moment of contact between a real person and the product, shot tight. A close-up wins on **product fidelity + believable human contact**: the product is correct (geometry / color / label) and the hand, fingers, and skin touching it read as a real photograph, not an AI render. The frame is intimate (hand + product, or face + product near the mouth / cheek), so the realism failure point moves from the scene to the **skin and fingers around the product**. The viewer should feel a real person is using this thing.

## Required inputs

- Product reference image (the registry declares it `required` — the product anchors fidelity even when the hand / face is the hero of the frame).
- Optional: model / persona, hand or face framing, skin register.

## Reference requirements

The product ref is **mandatory** as the fidelity anchor — pass it as `--ref` on **every** generate call so the product stays on-model in the tight crop (#426 typed reference packs — `ralphy ref pack <id>` assembles the typed set; closeup-product-with-person declares `product` as the required ref). A tight crop magnifies label / geometry drift, so never let a close-up run without the product ref.

**Demand more refs when:**
- A **recurring person / hand** must hold across stills → generate a master-portrait (or a hand master) first and pass it as a second `--ref` on every shot; identity will NOT carry between turns otherwise.
- The product is a **named real brand / IP** → the reference-required gate (AGENTS #3) fires; the product ref satisfies it.

A no-name / generic product proceeds with just the product ref + the quick-research output — the default flow does not require a brand ref for a generic product.

## Prompt spine

Build the prompt with the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured schema, folding in the [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) six-token spine for the human contact:

1. **`scene` + product-DNA** — the moment of contact in one dense paragraph (hand wrapping the product / product at the cheek), with the product named verbatim (form-factor, color, material, label) so the tight crop renders it correctly.
2. **Camera + lens, named** — `Shot on Sony A7 IV with Sigma 85mm f/2.0` for tight head-and-product, 50mm for hand-and-product, macro for a true product-skin close-up; eye-level, pin the aperture.
3. **Film stock + grade** — `Natural Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade` to kill the digital gloss.
4. **Hand / skin realism cluster** — natural skin texture with visible pores on the hand and face, knuckle creases and faint hair, no styling-product gloss, named asymmetry, 2-3 specific imperfections (a nail ridge, a freckle, a flyaway), single soft light source, and the closing register clause `Hyperreal, photoreal, NOT glossy. Naturalistic, candid, not staged.`
5. **`quality.avoid`** — the photoreal negative cluster verbatim (`beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores, exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look, perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe, ring light catch in eyes`) plus `fused fingers, extra fingers, six fingers, melted hand, claw grip` — finger anatomy is the dominant failure here.
6. **Aspect:** `--size` per placement (9:16 for social, 4:5 / 1:1 for feed). Name it explicitly.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default / matches an existing person + product — `google/gemini-3-pro-image-preview`.** Best at honouring `--ref` for identity lock (product + recurring hand / face) with low drift; the strongest pick when the same product and person must repeat across a set.
- **Master-portrait of a new person (no ref) — `openai/gpt-5.4-image-2`.** Strongest at "real person, plain backdrop" from text alone; generate the portrait / hand master here, then carry it as `--ref` into the close-up.

## Style / visual constraints

- The product is correct first — pass the product ref every time so the tight crop does not drift its label / geometry.
- Hand-and-product, or face-and-product near the cheek / mouth — keep the contact natural, never a staged display grip.
- Single motivated soft light; ring-light catch in the eyes or a hard product highlight reads as stock / AI.
- Show the fingers in a natural relaxed grip — splayed display hands and fused-finger grips are the #1 tell.
- Hold one palette / skin register across the set; mixing breaks coherence.

## Common failure modes

- **Fused / extra / melted fingers around the product** → the finger-anatomy negatives + a relaxed natural grip; run the anatomy gate before accepting, regenerate (don't edit over it).
- **Plastic / airbrushed skin on the hand or face** → the photoreal negative cluster + explicit skin-pore / knuckle-crease tokens; `beauty filter` + `plastic skin` are load-bearing.
- **Wrong product identity in the tight crop** → re-anchor on the locked product ref; the fidelity gate (#422) catches this.
- **Person / hand drifts between shots** → master-portrait / hand master as a `--ref` on every downstream gen.
- **Staged display-grip vibe** → natural contact, candid framing, `not staged` closing clause.

## Variant strategy

Generate a small tight set (1-4 stills per the Unit shape) — vary the contact (hand wrap → fingertip detail → product at the cheek) and the crop while holding the SAME product + person refs. Explore alternatives with `--variants N` and curate the winners; never re-roll a person- or hand-bearing shot without the portrait / hand ref.

## Evaluation criteria

Two passes:
- `scoreImage` gate (refuses, not warns — AGENTS #4). Twice-failed → stop and report concrete options; do not paper over with editing.
- **Product fidelity gate (#422)** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`), the commercial-mode product / brand identity gate. For a named real product a materially wrong product / logo / palette is a HARD `fail` that blocks ship-ready; it compares the generated stills against the locked product refs (#426) + any `ProductBrandFacts`.

Beyond the gates: the product is recognizable and on-model in the tight crop, the hand has correct finger count and natural grip, the skin passes the pore + asymmetry + no-ring-light check, and the recurring person / hand holds across the set. Aggregate the gate reports into the release-readiness verdict with `ralphy project scorecard <id> --mode closeup-product-with-person` (#427) before forming the Unit.

## Does NOT apply to:

- A clean studio packshot on a controlled background → that is [`product-shot.md`](product-shot.md).
- A product placed in a wider real-world environment with people / setting → [`lifestyle-scene.md`](lifestyle-scene.md).
- A surreal / artistic key-visual where the product lives inside a metaphor → [`conceptual-product.md`](conceptual-product.md).
- Apparel / an accessory shown *worn* by a generated virtual model (a try-on / fitting still) → [`virtual-model-tryout.md`](virtual-model-tryout.md).
- A talking-head UGC review / testimonial video → `ugc-review` (`/ugc-ad`).
- A moving / video product reveal → match a video mode.
