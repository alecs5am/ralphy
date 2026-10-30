# Model registry follow-ups from #568

> **Status:** done — 2026-10-30 (GA Gemini default with the preview id aliased, 10 log-seen models registered, blocked refusal rows with provider or unknown cost, `--element` for Kling O3 on fal)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** models / providers / cost log

## Context

The #568 research (`.agents/skills/art-director/references/characters-and-backgrounds.md`, `docs/research/character-generation-test-plan.md`) found four gaps in the model layer:

1. The default image model id `google/gemini-3-pro-image-preview` was shut down in the Gemini API on 2026-06-25. OpenRouter still served it through 2026-10-24, but the default should move to a live id before it breaks.
2. Project logs from 2026-09 and 2026-10 call models that have no registry entry, so `ralphy models show` knows nothing about their limits, quirks or prices: `google/gemini-nano-banana-2.1`, `bytedance-seed/seedream-5-0-pro`, `black-forest-labs/flux-3-image`, `openai/gpt-image-2.5-sunburst`, `bytedance/seedance-2.5`, `alibaba/wan-3.0`, `minimax/hailuo-3-max` (and other hailuo-3 variants), `heygen/avatar-iv` (all through OpenRouter) and `fal-ai/kling-video/ai-avatar/v2/pro` (fal).
3. Seedance privacy refusals are submit-time 400s that never reach `generations.jsonl`, and refusal rows that do land are logged at $0 even when the provider may bill.
4. The fal Kling O3 route maps `--ref` to `image_urls` only; Kling `elements` (multi-angle character packs, `@Element1`) are not wired (`cli/lib/providers/fal.ts`).

## What

- Confirm each id against the live public catalogs (OpenRouter models listings, fal model pages). Register only ids that exist, with catalog-sourced price and limits, a `MODELS.md` row and a `docs/models/<kind>.md` section. Ids that no longer exist get a "retired / not routable" note instead of a row.
- Move the default image model to the live successor id in code, the registry and the docs that name the default. Keep the old id as an alias that resolves to the new one. Historical notes and postmortems stay as written.
- Log every refusal (submit-time 400 included) to `generations.jsonl` as a `blocked:<reason>` row, with the cost the provider reports, or a cost marked unknown instead of $0.
- Wire Kling O3 `elements` on fal behind an explicit flag (for example `--element <dir-or-files>`), with request-body unit tests and a dry-run that prints the body. No live paid call.

## Scope / acceptance

- Unit tests for the alias, the refusal log row and the fal request body; `tests/unit/models-registry.test.ts` passes.
- `ralphy models show <each new id>` prints the new entry.
- No paid generation.

## Resolution

- **Gemini default.** The live OpenRouter catalog (2026-10-30) lists the GA `google/gemini-3-pro-image` (canonical slug `google/gemini-3-pro-image-20260528`, Google AI Studio + Vertex endpoints, same per-token price as the preview). It is now the default in code, `MODELS.md`, `docs/models/image.md`, the skills, playbooks, prompt docs and guidelines. `google/gemini-3-pro-image-preview` is an `ID_REDIRECTS` entry in `cli/lib/model-aliases.ts`: every `--model` path resolves it, `ralphy models show` answers with the GA entry, and shared notes that name the old id still reach it. Historical notes, logs and dated research stay as written; the vendored desktop prompt pack is unchanged.
- **Registered from the catalogs** (`/api/v1/images/models`, `/api/v1/videos/models`, fal model page): `google/gemini-nano-banana-2.1`, `bytedance-seed/seedream-5-0-pro`, `black-forest-labs/flux-3-image`, `openai/gpt-image-2.5-sunburst`, `bytedance/seedance-2.5`, `alibaba/wan-3.0`, `minimax/hailuo-3-max`, `minimax/hailuo-3`, `heygen/avatar-iv`, `fal-ai/kling-video/ai-avatar/v2/pro`. Every id exists, so none got a "not routable" dropped note. Image-only models now get `modalities: ["image"]`. Video ids have `VIDEO_PRICE_PER_SEC` rows. `heygen/avatar-iv` routes without its voice parameters, and the fal avatar has a row but no connector route (noted in its section).
- **Refusals.** `cli/lib/providers/refusal.ts` writes one `status: "blocked"` row per refusal (`error: "blocked:<reason>: …"`, `failureClass: "moderation"`, provider-reported `cost_usd` or `cost_source: "unknown"` with no cost). The generate Run wrapper and `produceArtifactRevision()` log it from the raw error, so submit-time 400s land too; connectors keep it for the non-Run path. Gemini safety finishes are terminal now. Readers: batch review and the lessons router count blocked rows as failures, `ralphy project timeline` marks them, `ralphy project budget` reports `unknownCostCalls`. The music ToS auto-retry writes the same blocked row.
- **Kling O3 elements.** `ralphy generate video --element <frontal,angle[,angle...]>` (repeatable, 2-4 images) maps to fal `elements` (`frontal_image_url` + `reference_image_urls`, `@Element1`…); `--dry-run` prints the resolved `requestBody`. Unit-tested body, no live call.
- **Not done.** No live call verified the GA Gemini id, the image-only modality on Seedream / FLUX / Sunburst, or Kling elements. `bytedance/seedance-2.5/reference-to-video` (fal) and `black-forest-labs/flux-3-video` also appear in the logs but were out of scope. The fal Kling O3 body still sends `resolution`, which the fal schema does not list.
