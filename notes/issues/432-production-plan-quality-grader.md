# Production plan quality grader

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Production plans now exist, but a plan can still be vague, under-costed, unsupported by research, or missing quality gates. The system needs a grader for the plan itself before it becomes the contract for expensive work.

## What

Add a production-plan grader that scores whether a plan is actionable, grounded, complete, and safe to execute. It should be deterministic where possible and optionally LLM-assisted for qualitative completeness.

## Why it matters

A weak plan produces weak assets. Catching the problem before generation is cheaper than repairing a bad render.

## Scope / acceptance

- Define a plan-grade schema with dimensions for mode fit, missing inputs, research grounding, style lock, model stack, cost/ETA, gates, and first checkpoint.
- Add a CLI or library function that grades `production-plan.json`.
- Fail or warn when a plan lacks required artifacts for its mode.
- Add fixtures for strong, weak, and blocked plans.
- Surface grader output to council preflight and the mode compiler.

## Notes

- Related: #407, #415, #418.
