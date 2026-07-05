# LLM node executors on the Vercel AI SDK

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** providers / orchestration / llm

## Context

Foundation decision in `docs/architecture/farm-node-graph.md`: LLM nodes run on
the Vercel AI SDK (`ai` npm package) through the existing OpenRouter key.
Custom implementation only where the SDK doesn't cover a use case. The
carve-out (#496) gates this issue.

## What

Implement the four LLM node types as executors over the AI SDK:

- `generate-text` — bounded completion; model id, provider (openrouter
  default), prompt file with `{{slot}}` interpolation, system, temperature,
  max_tokens, fallback model list.
- `generate-object` — mandatory structured output (zod schema ref); retries on
  validation failure; the default for anything a downstream node consumes.
- `agent-loop` — bounded multi-step tool-calling loop (AI SDK agent
  primitives); whitelisted tools, `max_steps`, `stop_when`.
- `coding-agent` — headless external coding agent (`claude` / `codex` /
  `gemini` binary) with prompt file, workdir, timeout, allowed paths. The
  vendor-independence valve: a pluggable node type, not the foundation.

## Why it matters

Model-per-node binding (research on Opus, scripts on Fable, classification on
a small model) is the core of the graph's economics and quality. The SDK gives
provider adapters, structured output, and loop primitives without rebuilding
`callLLM()` plumbing for the multi-step cases.

## Scope / acceptance

- Add the `ai` dependency + OpenRouter adapter behind a designated provider
  path (per #496's file-scoped allowlist); no Vercel host/key anywhere.
- Executors registered against the #498 node types; outputs land as
  append-only artifacts; every call appends to the run/gen log with model,
  tokens, cost.
- `coding-agent`: binary allowlist, timeout kill, captured transcript artifact,
  non-zero exit routes to `on_fail`.
- Boundary decision recorded: what still goes through `callLLM()`
  (existing verbs stay untouched) vs the SDK path (graph nodes) — do NOT
  migrate existing `callLLM()` call sites in this issue.
- Unit tests with a mocked SDK provider: prompt interpolation, schema retry,
  fallback model cascade, agent-loop step cap, coding-agent timeout.

## Notes

- Sequence after #496 and #498.
- Heavy `coding-agent` use in a production graph is a design smell (template
  left training too early) — note this in the node's inline docs.
