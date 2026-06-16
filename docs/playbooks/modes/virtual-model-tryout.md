# Mode quality playbook — `virtual-model-tryout`

> A product — apparel or an accessory — shown *worn* by a generated virtual model: a try-on / fitting still (or short video) where the garment sits believably on a body. Not a packshot, not a hand-in-frame close-up. Backing guideline: [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) + skill [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Show how the product **looks worn** — the fit, drape, scale, and the way the garment / accessory reads on a real body. A try-on wins on **garment fidelity + body / hand realism + correct fit**: the product matches the reference (cut, color, print, hardware), the model reads as a real photograph, and the garment sits at the right scale and drape for that body (sleeve length, neckline, where it falls). This is the highest-hallucination-risk image mode — identity drift, body / hand artifacts, garment deformation (warped logos, invented seams, melted hardware), and unsafe "wear this real person" asks all converge here. The deliverable convinces a shopper "this is what it looks like on me".

## Required inputs

- Product / garment reference image (the registry declares it `required` — it is the fit + print + hardware anchor).
- Optional: model spec (look, build, pose), background, aspect ratio.
- Strongly recommended for fidelity: a **fit / scale reference** (the garment laid flat or on a stand showing true proportions) and any **brand constraints** (palette, the exact logo lockup, fabric finish) so the worn render does not invent drape or recolor the print.

## Reference requirements

Try-on is high-hallucination-risk, so the typed reference pack (#426 — `ralphy ref pack <id>`) carries two declared required types: `product` (the garment) and `model-person` (the virtual model the garment is worn by, once locked).

- **Garment ref is mandatory** — pass it as `--ref` on **every** generate call. The cut, print, color, and hardware drift after 2-3 unrefed regens; a fit / scale ref alongside it pins the proportions so the model does not lengthen sleeves or invent a hemline.
- **Lock the virtual model** — generate a master-portrait / full-body master first (per the photoreal guideline) and carry it as a second `--ref` on every shot. Without it the model's face / build changes per turn.

**Refusal / escalation — a REAL person without adequate refs.** Try-on naturally invites "put this on *me* / on <named person>". A named real entity (a specific person, a recognizable model, a licensed character) triggers the **reference-required gate (AGENTS #3)**: you may NOT fabricate that person's likeness. The CLI floor is `ralphy ref check <project-id>` (offline classifier in `cli/lib/eval/refs.ts → needsReference()`). When the gate fires and no adequate likeness ref is attached:
- **Refuse with a concrete ask** — request the person's reference image(s) (and consent / rights for a real person), OR
- **Escalate to a generic virtual model** — offer to fit the garment on a *generated* model instead (no real-person likeness), which proceeds without the gate, OR
- The user may override on a specific generate call with `--no-ref-consent "<reason>"`, which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`.

A generic / no-name garment on a *generated* virtual model proceeds with just the garment ref + the quick-research output — the default flow does not require a real-person ref.

**When Soul ID / persistent identity is REQUIRED vs optional.** Persistent-identity work (a locked model master reused verbatim across every shot — the "super-original" discipline) is **required** whenever the SAME virtual model must recur across a set of stills / a video, or across the project's other Units (a brand's recurring face). Generate the master once, pass it as `--ref` everywhere. It is **optional** for a single one-off try-on still where no model continuity is promised — there a fresh generated model per render is acceptable. (See `MEMORY.md` `feedback_super_original_refs`: lock the product + model master and pass them on every gen to prevent drift between shots.)

## Prompt spine

Build the prompt with the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured schema, folding in the [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) six-token spine:

1. **`scene` + garment-DNA** — the model wearing the product in one dense paragraph; name the garment verbatim (cut, color, print / logo and its placement, fabric finish, hardware) so the worn render keeps it on-model, plus the pose and how it should drape / fit.
2. **Camera + lens, named** — `Shot on Sony A7 IV with Sigma 50mm f/2.0` for full-body / three-quarter try-on, 85mm for tighter fit detail; eye-level, pin the aperture.
3. **Film stock + grade** — `Natural Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade` to kill the digital gloss.
4. **Body / skin realism cluster** — natural skin texture with visible pores, named asymmetry, 2-3 specific imperfections (a mole, a flyaway, faint stubble), correct hand anatomy where hands are in frame, single soft light source, and the closing register clause `Hyperreal, photoreal, NOT glossy. Naturalistic, candid, not staged.`
5. **`quality.avoid`** — the photoreal negative cluster verbatim (`beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores, exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look, perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe, ring light catch in eyes`) plus garment / anatomy tells: `warped logo, distorted print, invented seams, melted hardware, fused fingers, extra fingers, deformed garment, mismatched fit`.
6. **Aspect:** `--size` per placement (9:16 for social, 4:5 / 1:1 for feed). Name it explicitly.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default / matches a locked model + garment — `google/gemini-3-pro-image-preview`.** Best at honouring `--ref` for identity lock (garment + recurring model) with low drift across shots; the strongest pick when the same model and garment must repeat.
- **Master-portrait of a new virtual model (no ref) — `openai/gpt-5.4-image-2`.** Strongest at "real person, plain backdrop" from text alone; generate the model master here, then carry it as `--ref` into the try-on.
- For a moving try-on (`video` format), anchor a still first and route the i2v to the human-safe video model per `MODELS.md` (kling for photoreal-human anchors — `MEMORY.md` `feedback_seedance_rejects_realistic_people`).

## Style / visual constraints

- The garment is correct first — pass the garment + fit / scale refs every time so the worn render does not recolor the print, warp the logo, or invent drape.
- Pose for fit reading — three-quarter / full-body framing shows the actual fit; an extreme crop hides the value of a try-on.
- Single motivated soft light; studio-strobe / ring-light catch reads as stock / AI.
- Hold one model + one palette / register across the set; a changing face or finish breaks coherence.
- Hands in a natural relaxed position — fused-finger grips are a common artifact.

## Common failure modes

- **Warped logo / recolored print / invented seams** → garment-DNA verbatim + the garment & fit refs + the garment-distortion negatives; re-anchor on the locked garment ref.
- **Model identity / build drifts between shots** → master-portrait as a `--ref` on every downstream gen (persistent-identity work is required for a set).
- **Body / hand artifacts (fused fingers, broken proportions)** → the anatomy negatives + the guideline's anatomy gate; regenerate, don't edit over it.
- **Plastic / airbrushed skin** → the photoreal negative cluster + explicit skin-pore / asymmetry tokens.
- **Mismatched fit (sleeves too long, wrong drape)** → add a fit / scale reference; name the intended fit in the garment-DNA.

## Variant strategy

Generate a small set (1-6 stills per the Unit shape) — vary the pose and crop (full-body fit → three-quarter → a detail of the drape) while holding the SAME garment + model + fit refs. Explore alternatives with `--variants N` and curate the winners; never re-roll a model-bearing shot without the model master ref.

## Evaluation criteria

Two passes:
- `scoreImage` gate (refuses, not warns — AGENTS #4). Twice-failed → stop and report concrete options; do not paper over with editing.
- **Product fidelity gate (#422)** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`), the commercial-mode product / brand identity gate. For a named real garment / brand a materially wrong product / logo / palette is a HARD `fail` that blocks ship-ready; it compares the generated stills against the locked garment refs (#426) + any `ProductBrandFacts`.

Beyond the gates: the garment matches the ref (cut / print / logo / color), the fit and drape are believable on the body, the model passes the skin-pore + asymmetry + no-ring-light check, hands have correct anatomy, and the model holds across the set. Aggregate the gate reports into the release-readiness verdict with `ralphy project scorecard <id> --mode virtual-model-tryout` (#427) before forming the Unit.

## Does NOT apply to:

- A clean studio packshot of the garment on a controlled background (not worn) → that is [`product-shot.md`](product-shot.md).
- A tight hand-in-frame close-up of a person holding / using the product → [`closeup-product-with-person.md`](closeup-product-with-person.md).
- A product placed in a wider real-world lifestyle environment → [`lifestyle-scene.md`](lifestyle-scene.md).
- Swapping the on-camera *person* in an existing remix video (a person-swap, not a garment fitting) → the `/ugc-model-swap` craft overlay.
- A surreal / artistic key-visual where the product lives inside a metaphor → [`conceptual-product.md`](conceptual-product.md).
- A talking-head UGC review / testimonial video → `ugc-review` (`/ugc-ad`).
