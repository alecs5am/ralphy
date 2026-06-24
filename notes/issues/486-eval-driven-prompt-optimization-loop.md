# Eval-driven prompt optimization loop

> **Status:** todo
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** medium
> **Category:** prompts / eval / templates

## Context

Both research reports recommend optimizing generator and judge prompts against a golden dataset, with DSPy/MIPROv2 as the strongest named pattern. Ralphy has templates, guidelines, mode playbooks, eval gates, and failure lessons, but no loop that treats prompts as optimizable artifacts with held-out evals.

## What

Design and implement an eval-driven prompt optimization path that can improve a template prompt, guideline prompt block, or judge rubric against a labeled dataset and persist the proposed change as a reviewable artifact.

## Why it matters

The content farm should get better from measured examples, not only postmortem prose. Prompt optimization turns golden failures into concrete candidate changes while preserving human review before public guidance changes.

## Scope / acceptance

- Add a design doc or CLI experimental command for optimizing a prompt/rubric against a calibration dataset.
- Inputs include prompt artifact, dataset, target metric/gate, training split, held-out split, and optimizer budget.
- Output is a versioned candidate prompt plus an evaluation report comparing baseline vs candidate on held-out examples.
- The command never overwrites templates, guidelines, or MODELS.md directly; it writes a proposal for maintainer review.
- Support optimizing judge prompts as well as generator prompts.
- Add tests around split handling, no-overwrite behavior, report shape, and baseline-vs-candidate comparison.

## Notes

- Depends on #483 for labeled datasets and metrics.
- The first implementation can be design-only or local-script backed; do not make DSPy a hard dependency of the main CLI until the value is proven.
- Public guidance updates stay review-gated per the knowledge flywheel.
