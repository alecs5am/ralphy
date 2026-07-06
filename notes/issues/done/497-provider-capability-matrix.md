# Per-(model, capability, provider) parameter coverage matrix

> **Status:** done — 2026-07-06
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** providers / registry / validation

## Context

The same model exposes different capability surfaces per provider: OpenRouter
covers roughly 40% of seedance-2.0's parameter surface, fal.ai ~100% (multi-ref
@Image/@Video roles, last-frame, extension, audio). Today that knowledge lives
in agent memory and MODELS.md prose; nothing machine-checks that a call's
params are supported by the resolved connector. Design:
`docs/architecture/farm-node-graph.md` ("Provider capability matrix as data").

## What

Extend the connector registry (`cli/lib/providers/registry.ts`) so each
(model, capability, provider) triple declares its supported parameter set.
Surface it for validation (warn/fail when a param isn't supported by the chosen
provider, name the provider that supports it) and for inspection.

## Why it matters

Node-graph validation at import time (#498) needs this to turn "OR covers 40%,
fal covers 100%" into a typed, inspectable fact instead of a mid-run surprise.
It also improves today's `ralphy generate --provider` UX for free.

## Scope / acceptance

- Add a coverage schema: per connector, per model id, per capability, the list
  of supported params (and notable unsupported ones), with a `source` field
  (hand-curated vs derived).
- Seed entries for the current working set: seedance-2.0 (openrouter vs fal),
  kling-v3.0-pro, veo, gemini-3-pro-image-preview, gpt-5.4-image-2, ElevenLabs
  voice/music/sfx.
- Decide + document the staleness strategy: hand-curated registry data as the
  source of truth, optionally refreshed from fal model schemas / OR catalog
  (open decision 5 in the design doc) — pick one, record why.
- Add a lookup helper (`coverageFor(model, cap, provider)`) and wire a
  non-fatal warning into `ralphy generate` when a passed flag is outside the
  resolved connector's declared coverage.
- Expose the matrix via an agent-facing verb (`ralphy provider matrix
  [--model <id>]` or extend `ralphy models show`).
- Unit tests: lookup, unknown-model degradation (no coverage entry = no
  warning), generate-path warning emission.

## Notes

- Sequence before #498 (graph validation consumes it). No dependency on #496.
- Do not block generation on coverage gaps in this issue — warn only; #498
  decides hard-fail semantics at graph import.
