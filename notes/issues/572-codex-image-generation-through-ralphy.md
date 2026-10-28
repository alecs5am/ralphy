# Route host-native image generation through ralphy

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** invariant / provenance

## Context

The #562 baseline (`docs/research/harness-baseline-2026-10.md`) found 120 host-native image generations in Codex sessions versus 3 `ralphy generate image` calls. Those assets skip the gen-log, cost rollup, auto-versioning and quality gates (AGENTS.md invariant 2), and were then registered by hand with 167 `project log-asset` calls (13 usage errors, 14 retries).

## What

- Add `ralphy generate image --import <file>` (or `ralphy artifact import`, whichever matches existing conventions) that registers a host-generated image into `artifacts/images/` with provenance (`source: host-native`, model name if known, prompt) in one call, auto-versioned.
- State in AGENTS.md and the Codex entry points that host image tools are allowed only through that import path.

## Scope / acceptance

- One call replaces the generate-then-log-asset pair; gen-log records it.
- Test: import writes a new version, never overwrites, appears in the manifest and cost rollup with zero spend.
- `bun run lint`, affected tests and `cli:surface:check` pass.
