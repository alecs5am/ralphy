# Skills refresh for the farm era

> **Status:** done — 2026-07-06
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** medium
> **Category:** skills / docs / agent-contract

## Context

The farm batch (#496-#507) changes what several skills must know: the two-path
model, the workspace bundle, the node graph, trust levels, and publishing. The
owner also asked for a general tidy-up ("bring the skills in order") — the
skill set has grown organically and some bodies reference pre-farm flows only.

## What

A deliberate pass over `.agents/skills/` (and the routing rows in `AGENTS.md`):

- **New skill: `workspace-export`** — the agent-facing wrapper for #502:
  when the user says "export the workspace / make it deployable / package the
  template for the server", check export-readiness (evaluators present,
  workflow lints, compositions parametrized), run `ralphy workspace export`,
  explain gaps when it refuses.
- **`templater`** — teach it the workspace-bundle path as a sibling of the
  library-publish path (project -> library entities vs workspace -> deployable
  bundle; when each fires).
- **`postmortem`** — add the performance postmortem flavor (#507): when a
  project's units have `analytics.jsonl`, fold real metrics into the lessons
  set instead of chat-history-only.
- **`universe-studio` / `workspace-eval` / `fixer`** — add farm-mode notes:
  the same gates run headless under #503; what changes for the agent when a
  workspace has `trustLevel` > L0.
- **`producer`** (playbook) — cross-link farm mode: when the user asks for a
  recurring/scheduled farm rather than a one-shot batch, route to the farm
  surfaces instead of a hand-driven batch loop.
- **Normalize pass** — run `/normalize-skills` discipline over the touched
  skills: frontmatter shape, description <= 1536 chars, namespace field,
  ALSO/DO-NOT-FIRE sections in bodies.

## Why it matters

Skills are the agent-facing API of the product. If they lag the farm surfaces,
agents will keep improvising pre-farm flows (hand batch loops, manual publish)
— the exact under-routing defect AGENTS.md exists to prevent.

## Scope / acceptance

- The new + updated skill bodies land with routing-table rows updated in
  `AGENTS.md` where a new trigger exists (workspace export).
- `bun run lint:skills` and `bun run lint:agents-md` green.
- Each touched skill body names the concrete verbs it drives (no prose-only
  guidance).
- No content-niche craft skills touched (out of scope; issue 058 owns their
  templatization).

## Notes

- Sequence LAST in the farm batch (after the verbs it documents exist);
  the `workspace-export` skill can land with #502 if convenient.
