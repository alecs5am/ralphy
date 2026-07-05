# Vercel AI SDK invariant carve-out

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** invariants / providers / foundation

## Context

Owner decision (2026-07-05, `docs/architecture/farm-node-graph.md`): the farm
runtime's LLM layer is built on the Vercel AI SDK (the open-source `ai` npm
package). AGENTS.md invariant #1 currently bans Vercel wholesale. The ban's
substance is *hosted* Vercel — `VERCEL_API_KEY`, Vercel hosts (AI Gateway, Eve
platform, Workflows) — not a local, provider-agnostic npm library that never
phones Vercel. The carve-out must land deliberately (text + tests) BEFORE any
AI SDK code ships, so the allowlist is a recorded decision, not an accident.

## What

Amend invariant #1 to permit the `ai` npm package (and its provider adapter
packages, e.g. `@openrouter/ai-sdk-provider`) as a local library while keeping
the hosted-Vercel ban fully intact. Update the invariant test to enforce the
refined rule.

## Why it matters

Every farm LLM-node issue (#499 onward) is blocked on this. Without an explicit
carve-out, either the invariant test fails on the first AI SDK import, or —
worse — someone weakens the test ad hoc and the hosted ban erodes silently.

## Scope / acceptance

- Reword AGENTS.md invariant #1: `ai` npm package allowed as a dependency;
  `VERCEL_API_KEY` reads and Vercel hosts (`vercel.com`, AI Gateway, Eve)
  remain banned in all source files, no allowlist.
- Extend `tests/unit/agents-md-invariants.test.ts`: assert no Vercel host /
  `VERCEL_API_KEY` anywhere (unchanged), and assert the `ai` package — once a
  dependency — is imported only from a designated provider-layer path (mirror
  the `fal.ts` file-scoped-allowlist pattern) so SDK usage stays behind the
  connector discipline.
- Record the decision as a `D-NN` entry in the invariant text or the design
  doc, citing `docs/architecture/farm-node-graph.md`.
- All lint/test gates pass; no `ai` dependency is actually added in this issue
  (that happens in #499).

## Notes

- Sequence FIRST in the farm batch — #499 depends on it.
- Rejected alternatives (Eve hosted, CrewAI, Python core) are recorded in the
  design doc; #493 is superseded accordingly.
