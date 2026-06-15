# Chat-native content farm mode

> **Status:** done — 2026-06-15 (farm-mode workflow in producer.md composing shared style-lock/#408 + modes/#412 + variation matrix + eval triage/#411 + repair/#409 + unit + bulk caption/#403; `ralphy batch review <id>` pure aggregator — winners/failures/cost/style-drift/repeated-model-failures/recommended-repairs; routing fixtures for "make N X" → farm via the #416 multi-unit-farm trigger)
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** producer / batch / product

## Context

The desired user experience is not one project at a time through CLI commands. It is a chat-driven content farm: the user asks an agent for a batch of content, the agent plans, generates, evaluates, repairs, packages, and produces publish copy with minimal user ceremony.

Existing pieces cover parts of this: `ralphy batch`, producer playbook, units, evaluator, templater, memory, and #403 social copy. They are not yet a single farm-mode agent workflow.

## What

Design and implement a chat-native farm mode that turns one strategic brief into many high-quality deliverables with shared grounding, controlled variation, batch eval, repair triage, units, cost rollup, and social copy.

## Why it matters

This is the product promise. A "content farm" is not just parallel generation; it is consistent style, measurable quality, and repeatable packaging across many outputs.

## Scope / acceptance

- Design the farm workflow in the producer playbook: input brief, shared style lock, template/format selection, variation matrix, batch creation, per-item checkpoints, eval triage, repair loop, unit formation, and publish-copy handoff.
- Decide the CLI primitives agents need, likely extending `ralphy batch status/review` rather than adding a human wizard.
- Batch review must summarize winners, failures, cost, style drift, repeated model failures, and recommended repairs.
- Integrate #403 so finished units can get platform-shaped descriptions and hashtag blocks in bulk.
- Farm mode must preserve append-only project artifacts and per-project logs.
- Add tests for batch review JSON shape and a playbook lint/fixture that routes "make 20 videos/posts/ads" into farm mode.

## Notes

- Sequence after #406, #407, #408, and #409; farm mode composes those primitives.
- This is distinct from #067 community uploads. Farm mode is production orchestration, not marketplace contribution.
