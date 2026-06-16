# Mode quality playbook — `amazon-listing`

> A SET of marketplace listing images for a single product — the main hero plus the infographic / lifestyle / comparison slots a buyer swipes on an Amazon (or any e-commerce) listing. Not a single packshot, not a swipe-through social carousel. Backing guideline: [`cgi-product-renders`](../../../guidelines/cgi-product-renders/) + skill [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md), built on the image-pack scaffold ([`cli/lib/image-pack.ts`](../../../cli/lib/image-pack.ts), `ralphy project image-pack`). Route: `intake → art-director → ralphy project image-pack → ralphy generate image → eval → ralphy unit package`.

## Creative objective

Ship a disciplined SET of listing stills where every slot has a defined ROLE and the whole set sells one product on a marketplace card. The default 6-8 slot spine: **hero** (the clean main image — product on white, the literal "this is it" the listing thumbnail uses), **feature callout(s)** (the infographic slots — labeled arrows / chips pointing at real features), **lifestyle** (the product in a believable use context), **dimensions** (a scale / size diagram), **comparison** (this vs the alternative, or a feature grid), **usage** (a how-to / in-use beat), and a **guarantee / CTA** slot where the marketplace's policy allows it. The set wins on **product fidelity + legible on-image copy + claim-safe text** — the geometry and color match the real product across every slot, the overlay text reads at thumbnail scale, and no claim is invented. A shopper reads the value proposition by swiping, not by reading the bullet list.

## Required inputs

- Product reference image (the registry declares `requiredRefTypes: ["product"]` — the product ref is mandatory, not optional).
- Key features / specs — the source-of-truth facts the callouts, dimensions, and comparison slots are built from. **Do NOT invent product claims**: every number, material, certification, or superlative on an image must trace to a fact the user supplied. The claims/policy gate (#442) owns enforcement of marketplace-safe copy; this mode feeds it conservative, source-grounded text.
- Optional: brand palette, competitor listings (for the comparison slot), an explicit slot plan, target marketplace (its policy shapes which slots are allowed).

## Reference requirements

The product ref is **mandatory** for this mode (#426 typed reference packs — `ralphy ref pack <id>` assembles the typed set and declares `product` as a required ref type for amazon-listing). Product fidelity is the gate, so the locked product ref is the source of truth: pass it as `--ref` on **every** generate call in the batch. Geometry drifts after 2-3 unrefed regens (per the cgi-product-renders guideline) — never let a callout or lifestyle slot run without the ref.

The reference-required gate (AGENTS #3) additionally fires for a named real branded product or recognizable IP — the same product ref satisfies it. A no-name / generic product still requires the product ref as craft input here (the mode declares it required), but does not gate on brand identity.

## Prompt spine

Scaffold the slot set first with `ralphy project image-pack <id>` (it writes `pack.json` — the role-typed slot spec — and a batch-ready `prompts/pack.jsonl`, one `{slot, prompt}` line per slot). Then fill each slot's prompt with the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) structured schema, folding in the [`cgi-product-renders`](../../../guidelines/cgi-product-renders/) rules:

1. **Product-DNA paragraph (mandatory, verbatim across slots).** Name form-factor, dimensions, body color / material, every accent and UI element with its location. This is the device fingerprint — it must be word-for-word identical across the hero, callout, lifestyle, dimensions, and comparison slots or geometry drifts.
2. **`scene` / role line** — only the role beat changes per slot (clean hero · feature callout with labeled chips · in-context lifestyle · scale diagram · comparison grid · in-use). The product-DNA + palette stay constant.
3. **`style` + `technical`** — CGI product render framing per the guideline (controlled studio background for the hero/callouts, the coloured rim-light pair, glossy specular highlights, `8K detail`); a believable real-world environment only on the lifestyle slot.
4. **On-image copy (claim-safe).** Each callout / comparison / dimension slot carries SHORT overlay text built only from the supplied specs. Keep copy conservative — no invented claims, no superlatives the user did not provide; the claims/policy gate (#442) is the downstream check, this spine is where you stay inside it.
5. **Safe-area + legibility.** Place overlay text inside the slot's safe area (away from edges and the product silhouette) and size it to read at thumbnail scale. On-image-text quality / safe-area placement is verified by the text-legibility / OCR gate (#439 — issue number only; the gate is not yet a built file, so this is a forward reference, not a link). Until it lands, manually verify each text slot reads at thumbnail size.
6. **Aspect:** the image-pack scaffold sets one aspect for the set (1:1 square is the common Amazon main-image ratio; pass `--aspect` explicitly). gpt-image ignores the in-prompt hint and defaults to 1024² — set the size on the generate call.

## Model recommendations

Verify against `MODELS.md` every run.
- **Hero + multi-slot product consistency — `google/gemini-3-pro-image-preview`.** Renders precise device geometry from the textual product-DNA, best for the clean hero anchor and holding the product across the callout / lifestyle slots; multi-ref product consistency.
- **Infographic / callout typography — `openai/gpt-5.4-image-2`.** Stronger at crisp embedded text where the callout labels, dimension numbers, and comparison-grid copy must read legibly at small scale, and at preserving exact geometry across the set once the hero is locked.
- Pass the hero anchor as `--ref` on every downstream slot.

## Style / visual constraints

- One palette per listing (per the cgi-product-renders two-palette rule), held across the whole set — mixing palettes mid-set breaks the listing's coherence.
- Clean controlled background on the hero and callout slots (white / seamless / gradient per the marketplace main-image rules); a real environment only on the lifestyle slot.
- Pin the two rim lights by color AND direction on the render slots — vague "studio lighting" flattens the product to catalog-stock.
- Overlay text is functional, not decorative: short, legible, inside the safe area, claim-safe. The product, not the text, is the subject.
- Keep the product-DNA paragraph on the macro / dimension slots too; the model uses it to render correct proportions even on a tight or annotated crop.

## Common failure modes

- **Geometry / color drift across slots** → carry the verbatim product-DNA paragraph + pass the hero `--ref` on every slot.
- **Wrong product identity (logo / proportions / color)** → this is the fidelity failure the gate catches; re-anchor on the locked product ref and re-run `ralphy eval fidelity`.
- **Illegible / clipped overlay text** → enlarge, move inside the safe area, switch the text-bearing slot to `openai/gpt-5.4-image-2`; verify against the legibility gate (#439).
- **Invented or non-compliant claims** → strip any number / superlative not in the supplied specs; route the copy through the claims/policy gate (#442) before packaging.
- **Flat catalog-stock render** → restore the two-rim-light line (color + direction) and the `no flat key-light look` negative; use "CGI product render", not "realistic photo".

## Variant strategy

Generate the slot set as one batch via `ralphy generate image --project <id> --batch prompts/pack.jsonl` (the scaffold prints the exact invocation). Explore alternatives per slot with `--variants N`, then select the winning variant per slot into `selected/` (append-only — never delete a loser). Hold the SAME product-DNA + palette + ref across every variant; vary only the role beat and the overlay copy.

## Evaluation criteria

Three passes before the Unit is formed:
- `scoreImage` gate (refuses, not warns — AGENTS #4). Twice-failed → stop and report concrete options; do not paper over with editing.
- **Product fidelity gate (#422)** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`), the commercial-mode product / brand identity gate. For a named real product a materially wrong product / logo / palette is a HARD `fail` that blocks ship-ready; it compares the generated stills against the locked product refs (#426) + any `ProductBrandFacts`.
- **Image-pack rubric** — `ralphy project image-pack <id> --score` (`scoreImagePack`, `cli/lib/image-pack.ts`) for the deterministic role-coverage / aspect-consistency / selected-set cohesion checks (zero model calls). On-image-text quality / safe-area is a SEAM to the text-legibility / OCR gate (#439) and claim-safe copy to the policy gate (#442) — run those as the text passes.

Then package the deliverable: `ralphy unit create <id> --slug <s> --format image --from "selected/*"` COPIES the curated slots into `units/<slug>/`, and `ralphy unit package <id> <slug>` (#423, the distribution pack) exports the selected listing images with ordered names ready for upload. Do NOT build a parallel ZIP / export verb.

## Does NOT apply to:

- A single clean studio packshot of one product (no slot set, no overlay text) → that is [`product-shot.md`](product-shot.md).
- A swipe-through IG / LinkedIn carousel (one narrative across ordered slides, social register) → [`social-carousel.md`](social-carousel.md).
- An App Store / Play Store / FB-Meta ad-creative image set → [`image-pack.md`](image-pack.md) routed against [`ad-creative-pack.md`](ad-creative-pack.md).
- A product placed in a real-world lifestyle environment with people, as the deliverable itself → [`lifestyle-scene.md`](lifestyle-scene.md).
- A surreal / artistic campaign key-visual where the product lives inside a metaphor → [`conceptual-product.md`](conceptual-product.md).
- A moving / video product reveal → match a video mode.
