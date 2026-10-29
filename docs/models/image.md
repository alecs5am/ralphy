# Image models: detail

Per-model detail for the image rows in the [`MODELS.md`](../../MODELS.md) index. Do not read this file whole: `ralphy models show <id>` prints one model's section plus every shared note below that names it.

## Shared notes

### Endpoint

Endpoint: `POST /api/v1/chat/completions` with `modalities: ["image","text"]`. Output bytes arrive on `choices[0].message.images[0].image_url.url` as a `data:` URI or http URL. `cli/lib/providers/media.ts → generateImage()` decodes both. **Don't make direct fetches to fal.ai or openai.com.**

### Reference images

**Reference images:** `--ref` accepts URL, local path, or `data:` URI. Local paths are auto-converted to `data:` URI in-process; there's no upload step. Both `gpt-5.4-image-2` and `gemini-3-pro-image-preview` accept image inputs; gemini is much better at *multi-ref* consistency (2+ refs).

### Size and aspect ratio

The `--size` flag is a prompt-level hint, not an enforced constraint. Gemini and gpt image models round to their internal natural sizes (1024², 768×1376, …). If you need an exact dimension, post-process with `ralphy video extract-segment` or `ffmpeg` after generation.

**Size / aspect ratio:** `ralphy generate image` maps `--size WxH` to OpenRouter's structured `image_config.aspect_ratio` (nearest of `1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9`) and forwards it alongside the in-prompt hint (`openrouter.ts → sizeToAspectRatio`). This is the only reliable lever for non-square output: **on the OR chat-completions path, `openai/gpt-5.4-image-2` ignored the in-prompt size hint and returned 1024² unless `image_config` was sent** (observed; OpenAI's own API documents `size: auto`, where the model picks the size, so this is OR-path behavior, not a vendor default) — with it, `--size 1080x1920` returns a real 9:16 (720×1280 native bucket), validated on loud-kids-poster-001 (2026-05-27). The result still lands on the model's nearest native bucket (1024² for 1:1, ~768×1376 / 720×1280 for 9:16, ~1280×720 for 16:9), not pixel-exact `WxH`. Downstream HyperFrames / ffmpeg compositions handle the scale-to-cover. `image_size` (`1K`/`2K`/`4K`) is available in the OR API but not yet wired to a flag.

### Prompt cookbook

**Prompt cookbook:** mode-by-mode masters in `docs/prompts/image/` (product-shot, lifestyle-scene, closeup-with-person, macro-detail, flat-lay, virtual-model-tryout, hero-banner, conceptual-product, iteration-edit). The agent fills slots from a user request, then calls `ralphy generate image --prompt "<filled>"`. There's no new CLI flag for this; it's a curated library, not a feature.

### Avoid

- Any model more than a year old (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`). Quality is below the current top picks at the same price.
- `gpt-image-1`: legacy line. `gpt-5.4-image-2` is the current stable OpenAI image model (not to be confused with the "gpt-image-2" naming some external docs use).
- Hard-coded fal.ai endpoints. We left fal.ai behind in Sprint 2.

### Register-specific picks (when the two defaults diverge)

- **Body-horror / cryptid / skinwalker / Cronenberg anchor frames → `openai/gpt-5.4-image-2`.** Gemini's image-safety filter is materially stricter and returns `IMAGE_SAFETY` on the same prompt; start at gpt-image, carry scene identity via `--ref`. See the image failure modes and video lesson 10 below.
- **Photoreal scientific / medical imaging (X-ray radiograph, MRI, anatomical scan, "Nature-cover print plate") → `google/gemini-3-pro-image-preview`.** It honours "this is a photograph of a real radiograph, NOT an illustration" and renders honest bone-density variation, cranial sutures, tooth roots. `gpt-5.4-image-2` defaults to an illustrative "Wikipedia-infographic" register here — uniform outlines, flat density. Generate greyscale/white and apply any tint as a CSS filter in the composition, not baked into the prompt.

### Video lesson 10: body-horror image-safety filter

10. **`google/gemini-3-pro-image-preview` image-safety filter is materially stricter than `openai/gpt-5.4-image-2` on body-horror / cryptid / skinwalker / werewolf register.** Gemini returns `native_finish_reason: IMAGE_SAFETY` with an empty content body even when the prompt uses softened surreal-anatomy language (concentric maws lined with tongue-like protrusions, biological apertures with internal teeth on a recognizable creature in a real-world setting). The reasoning trace literally describes the requested transformation before the filter refuses. `openai/gpt-5.4-image-2` accepts the same prompts and delivers — validated on voidstomper-test-001's skinwalker BBQ frame after three gemini refusals. **Route rule:** for voidstomper-adjacent / Cronenberg / The Thing / mid-warp body-horror anchor images, start at `--model openai/gpt-5.4-image-2`. Accept the 1024×1024 default (gpt-image ignores arbitrary `--size`); use `--ref <gemini-9:16-scene>` to carry scene + character identity, then post-process to 9:16 with ffmpeg pad if your downstream i2v requires matching dimensions. Postmortem: voidstomper-test-001 (2026-05-25).

## `google/gemini-3-pro-image-preview`

Nano-banana-pro lineage. Holds face / wardrobe / product identity across multiple references. Tolerates ≥4 concurrent in the OR catalog; **in-process semaphore caps at 2** (`concurrency.ts`) to stay under shared-key OR limits. Pass 2-3 `--ref` images for "same model + same product across 5 scenes" workflows. Made default 2026-05-20 (re-flip from the 2026-05-12 gpt-5.4-image-2 default — multi-ref wins for almost every UGC workflow).

### Failure modes

Append-only. Add a row when a new quirk costs >5 min of debugging or a re-roll.

| Model | Failure mode | Workaround |
|---|---|---|
| `google/gemini-3-pro-image-preview` | **"skeleton null" transient** — response returns `finish_reason: null, content: null, native_finish_reason: null` with no error body. Sporadic, not prompt-related. | Retry up to 3× (same prompt, same refs). If all 3 fail, fall back to `openai/gpt-5.4-image-2` (accept the 1024² default + concurrency=1). Tracked by `cli/lib/providers/openrouter.ts` retry loop. |
| `google/gemini-3-pro-image-preview` | **Body-horror `IMAGE_SAFETY` refusal** (video lesson 10 in the shared notes) — empty content + `native_finish_reason: IMAGE_SAFETY` on cryptid / skinwalker / Cronenberg prompts. | Route to `openai/gpt-5.4-image-2` for the anchor frame; carry scene identity via `--ref`. |
| `google/gemini-3-pro-image-preview` | **Typography smudging on embedded labels** (kanji buttons, LED digits, brand wordmarks). | Switch to `openai/gpt-5.4-image-2` when copy must be legible — it holds glyphs cleanly. Lesson from flipper-hypermotion-001. |

## `openai/gpt-5.4-image-2`

Best typography on labels, fewer hallucinations on small details, cleanest photorealism for hero product shots where the wordmark must read crisp. **Concurrency: 2 in-process** (#007 — validated 2026-05-29, NOT hard-capped to 1 as earlier docs claimed). Self-throttled by `cli/lib/providers/concurrency.ts`; the old 403 "Key limit exceeded" misread is now surfaced as "concurrent-call limit on …; try --concurrency 1 or switch model".

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `openai/gpt-5.4-image-2` | **Concurrency cap = 2** (per #007, validated 2026-05-29 — earlier "cap of 1" was conservative). 3+ parallel may still trip OR's per-key limit and return misleading `403 "Key limit exceeded (total limit)"`. | Self-throttled to 2 in-flight by `cli/lib/providers/concurrency.ts`; the 403 is now rewritten as "concurrent-call limit on …; try --concurrency 1 or switch model — NOT a $ balance issue". For >2 parallel, swap to `gemini-3-pro-image-preview`. |
| `openai/gpt-5.4-image-2` | **Ignores in-prompt size hints**, defaults to 1024². | Pass `image_config.aspect_ratio` via `--size WxH` (mapped automatically in `openrouter.ts → sizeToAspectRatio`). |

## `openai/gpt-5-image-mini`

Cheap iteration during prompt exploration.

## `google/gemini-2.5-flash-image`

Smoke-test only — quality dip is visible.
