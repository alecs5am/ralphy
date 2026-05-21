# Prompt cookbook — production UGC

Tested prompt-templates for production-grade image and video generation. Mined from three public sources (letsenhance.io, rephrase-it.com, media.io) and adapted into slot-fillable masters. **The agent reads the relevant mode file, takes the user's request, fills slots, and calls `ralphy generate image --prompt "..."` directly.** No new CLI flag, no skill — just curated library.

## Default model

- Premium / typography / clear label — **`openai/gpt-5.4-image-2`** (CLI default since 2026-05-12).
- Multi-ref character/face consistency (2+ refs) — **`google/gemini-3-pro-image-preview`** (pass `--model` explicitly).
- Price: gpt-5.4-image-2 ≈ $0.20/image, gemini-3-pro ≈ $0.15/image (see MODELS.md).

## Intent → mode mapping

| User says | Mode file |
|---|---|
| "studio product photo", "packshot", "white background", "catalog", "marketplace listing" | [`image/product-shot.md`](image/product-shot.md) |
| "in real environment", "lifestyle", "on the kitchen / in the gym / on the shelf", "in the interior" | [`image/lifestyle-scene.md`](image/lifestyle-scene.md) |
| "hand holds", "in use", "model using", "swipe / apply / unbox" | [`image/closeup-with-person.md`](image/closeup-with-person.md) |
| "macro", "texture", "shimmer", "drops", "extreme close-up" | [`image/macro-detail.md`](image/macro-detail.md) |
| "from above", "flat lay", "top-down", "layout" | [`image/flat-lay.md`](image/flat-lay.md) |
| "AI-model wears / uses", "virtual try-on", "model wearing X" | [`image/virtual-model-tryout.md`](image/virtual-model-tryout.md) |
| "site banner", "hero for landing", "wide-format", "email header" | [`image/hero-banner.md`](image/hero-banner.md) |
| "surreal", "CGI", "levitation", "splash", "splash", "neon", "color gels" | [`image/conceptual-product.md`](image/conceptual-product.md) |
| "change only X", "same product but Y", "regenerate with different background" | [`image/iteration-edit.md`](image/iteration-edit.md) |

## File anatomy

Each mode-file is structured the same way:

1. **When to use** — 1-2 sentences, when this mode is adequate.
2. **Master template** — slot-based prompt skeleton, which the agent fills under a specific request.
3. **Worked examples** — 3-8 verbatim prompts from sources with attribution.
4. **Slot vocabulary** — allowed values for surface / lighting / lens / aperture / aspect.
5. **Model recommendation** — which model to take for this mode.

## How the agent uses it

```
1. User: "make a packshot of my new perfume bottle on a white background"
2. Agent: reads docs/prompts/image/product-shot.md
3. Agent: takes Master template, filters under "perfume bottle, pure white background"
4. Agent: fills slots with specifics from the user request (product = "perfume bottle",
          surface = "pure white seamless", lens = "85mm", aspect = "1:1", etc.)
5. Agent: ralphy generate image --project <id> --slot hero-01 --prompt "<assembled>"
6. Result: premium-generation via openai/gpt-5.4-image-2 (default)
```

If for multi-ref character consistency is needed (model + product, the same model in several scenes) — the agent explicitly writes `--model google/gemini-3-pro-image-preview --ref model.png --ref product.png`.

## Sources

All verbatim examples in this collection are from these three public sources. Each is marked in the worked examples sections.

- [letsenhance.io/blog/all/ecommerce-product-prompts](https://letsenhance.io/blog/all/ecommerce-product-prompts/) — 20 prompts, templated with slot `[product]`, buckets studio / lifestyle / scale / with-people / seasonal.
- [rephrase-it.com](https://rephrase-it.com/blog/best-prompts-for-ai-product-photography-packshots-lifestyle-) — 5 structured prompts with "Hard exclusions" block — excellent skeleton for master-template.
- [media.io](https://www.media.io/ai-prompts/ai-product-photography-photo-prompts.html) — 25 prompts with specific cameras/lenses/aperture, all `--ar 4:5`.

Video-cookbook (kling/seedance camera moves, motion grammar) — separate phase, see `video/` when it appears.
