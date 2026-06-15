# Low-tech prompt benchmark suite

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

The main product risk is not expert users. It is low-tech users writing vague chat prompts and expecting the agent to turn them into polished Units. #407, #412, #416, and #418 improve the pipeline, but there is no benchmark corpus that proves those pieces work on messy real prompts.

## What

Create a fixture suite of low-detail user prompts and expected routing/planning behavior. The suite should exercise content-mode classification, research depth, missing-input questions, style-lock requirements, cost estimates, and first checkpoint selection.

## Why it matters

If prompt quality only improves through ad-hoc agent taste, regressions will slip in silently. A benchmark makes "works for low-tech users" testable.

## Scope / acceptance

- Add fixture prompts covering at least 30 scenarios across commercial ads, carousels, image packs, podcast clips, UGC reviews, tutorials, and abstract requests.
- For each fixture, assert content mode, format, research depth, required refs, and first checkpoint.
- Include intentionally ambiguous prompts and prompts with too little information.
- Add a test that runs the mode compiler or plan builder against the corpus.
- Document how to add a new fixture after a failed real user run.

## Notes

- Sequence after #418 or use current production-plan output if #418 is not done yet.
