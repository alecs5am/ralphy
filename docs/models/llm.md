# LLM and vision models: detail

Per-model detail for the LLM rows in the [`MODELS.md`](../../MODELS.md) index (models used by skills and analytics). Do not read this file whole: `ralphy models show <id>` prints one model's section plus every shared note below that names it.

## Shared notes

### Provider routing

**Provider routing.** All LLM / vision calls go through `cli/lib/providers/llm.ts → callLLM()`. **The only provider is OpenRouter.**

| Use case | Model | Why |
|---|---|---|
| Scenarist / VO rewrite / feedback parsing | `anthropic/claude-sonnet-4.6` or `anthropic/claude-opus-4.6` | RU/EN at the same level, nuances revisions well. |
| This chat | Claude Opus 4.7 | The one you're reading right now. |

### Avoid

- Direct `fetch("https://openrouter.ai/...")` calls in new scripts. Go through `callLLM()` so users can switch providers via `ralphy setup`.
- Hard-coded `anthropic.com` or `openai.com` URLs; everything goes through OpenRouter.

## `google/gemini-2.5-flash`

Vision analysis of images / videos (extract-design, find-viral-moments, face-bbox, scoreImage, scoreVideo). Cheap vision (~$0.001/frame), accurate enough for smart-crop and moment detection. Use `pro` when long context is needed.

## `google/gemini-2.5-pro`

Deep vision (extract-design on complex landing pages). Best quality on long prompts + complex screenshots. ~3× the cost of flash.

## `google/gemini-3.1-pro-preview`

Video analysis via `callLLM` (vision-trim and ref-analysis pipelines).

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `google/gemini-3.1-pro-preview` (video-analysis via `callLLM`) | **Occasional HTTP 502 with empty body** on full-length source mp4s. Vision-trim + ref-analysis pipelines hit this most. | Compress source mp4 to 540×960 CRF28 (`ffmpeg -vf scale=540:960 -crf 28`) + retry. If still 502, fall back to `google/gemini-2.5-flash` (lower context but reliable). Last resort: `ralphy ref frames` + frame-level analysis. |

## `anthropic/claude-sonnet-4.6`

Scenarist / VO rewrite / feedback parsing (see the provider-routing table in the shared notes).

## `anthropic/claude-opus-4.6`

Scenarist / VO rewrite / feedback parsing, premium tier (see the provider-routing table in the shared notes).
