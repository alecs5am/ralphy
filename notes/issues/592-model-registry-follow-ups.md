# Model registry follow-ups from #568

> **Status:** open
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
