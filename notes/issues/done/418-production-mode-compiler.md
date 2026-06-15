# Production mode compiler

> **Status:** done — 2026-06-15
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Follow-up from the 2026-06-14 content-farm planning pass. #412 added the content mode taxonomy, #407 added production plans, and #414 tracks the full Unit lifecycle. The missing layer is a compiler that turns those pieces into one deterministic execution contract instead of leaving the agent to assemble the route freehand.

## What

Add a mode compiler that maps a user brief into a complete production contract: content mode, required inputs, research depth, style lock, template lookup, generation plan, validation rubric, repair budget, Unit output shape, and distribution handoff.

## Why it matters

Low-tech users should be able to write one vague chat message and still get a strong pipeline. The agent should not improvise the route on every run; it should compile a stable contract and then execute it.

## Scope / acceptance

- Add a compiler entry point, likely a pure function behind `ralphy project plan` or a new `cli/lib/production/compiler.ts`.
- Input: brief, optional URLs/assets, selected workspace, known content modes, research facts, and available templates.
- Output: a machine-readable production contract referenced by `PRODUCTION_PLAN.md`.
- Contract includes mode, format, role chain, required artifacts, first checkpoint, model stack, cost/ETA estimate, eval gates, council gates, and Unit shape.
- Add deterministic fixtures for at least five modes: product-shot, ad-creative-pack, social-carousel, ugc-review, and podcast-video.
- The compiler must refuse unsupported mode promises instead of emitting a generic fallback disguised as support.

## Notes

- Sequence after #412 and #407; feeds #414.
- This is agent-facing. The human user still chats; the compiler is the route stabilizer for the agent.
