# Ralphy roadmaps

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps

## Purpose

This folder is source material for future `notes/issues/` batches. It is not a
second tracker and it does not replace the active backlog. The flat top level of
`notes/issues/` remains the only executable queue. Roadmap documents describe
programs, workstreams, sequencing, issue families, and acceptance ladders so a
maintainer can later run `/dev-issues` against one program at a time.

## Product north star

Ralphy should become the agent-native media production substrate: a toolchain
that lets a chat agent reliably produce polished media Units in any format and
any quantity. The user interface is chat or a future desktop app. The CLI is the
agent runtime: project state, model calls, references, renders, evals, repair
plans, Units, logs, budgets, and reusable knowledge.

The promise is not "humans learn a CLI." The promise is "turn Codex or Claude
Code into a content farm."

## One-year backlog allocation

The long-term target is roughly 1000 implementation issues. Do not file all of
them at once. Use this allocation as a budget and generate executable issues in
quarterly batches after each program has enough context.

| Program | Target issues | Roadmap |
|---|---:|---|
| Agent runtime and production state | 80 | `01-agent-runtime.md` |
| Content modes and open-world compiler | 140 | `02-content-modes.md` |
| Research intelligence and references | 90 | `03-intelligence-layer.md` |
| Creative strategy, prompts, and models | 90 | `04-generation-and-models.md` |
| Quality, eval, council, and repair | 120 | `05-quality-and-repair.md` |
| Library, memory, and knowledge flywheel | 80 | `06-library-and-learning.md` |
| Chat desktop and low-tech UX | 100 | `07-chat-desktop-ux.md` |
| Batch operations, scale, and cloud seam | 90 | `08-batch-scale-and-cloud.md` |
| Distribution and publishing | 70 | `09-distribution-and-publishing.md` |
| Safety, trust, and governance | 50 | `10-safety-trust-and-governance.md` |
| DevEx, fixtures, docs, and release gates | 90 | `11-devex-fixtures-and-release.md` |

Total: 1000 issues.

## Canonical production pipeline

Every roadmap program should serve the same ideal production path:

1. User asks in chat.
2. Agent loads user/workspace/project context.
3. Agent classifies the content mode or starts open-world discovery.
4. Agent builds an intelligence pack from product, brand, niche, references,
   competitors, platform constraints, and benchmark examples.
5. Agent drafts a creative strategy and production plan.
6. Preflight council, spend estimate, and user approval happen before paid
   generation.
7. Ralphy generates or imports source assets through registered providers only.
8. Ralphy assembles the output into a project render or non-video artifact.
9. Video-native and artifact-specific eval gates run.
10. Findings become a bounded repair plan.
11. Passing outputs become Units with provenance and distribution packs.
12. Lessons flow back into memory, guidelines, templates, benchmarks, models,
   or issues.

## Roadmap to issue conversion rules

When converting roadmap material into issues:

- File active work only under the flat top level of `notes/issues/`.
- One issue should be executable by one downstream agent.
- Prefer narrow acceptance criteria over large essays.
- Link back to the roadmap section and any existing program issue.
- Do not duplicate existing issues. Update or cross-link them.
- Keep roadmap docs stable unless the strategy changes.
- Use English only on disk.

## Recommended sequence

1. Stabilize the agent runtime, state machine, and project resume contract.
2. Build the intelligence pack and reference pipeline because generation quality
   depends on context quality.
3. Expand content modes and the open-world compiler once the substrate can
   persist provisional mode decisions.
4. Make eval and repair the default path before scaling batches.
5. Build Desktop around the stable substrate, not around one-off CLI output.
6. Scale operations and distribution after local single-project quality is
   repeatable.
