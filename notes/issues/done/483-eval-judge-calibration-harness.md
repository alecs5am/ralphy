# Eval judge calibration harness

> **Status:** done — 2026-06-24
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** high
> **Category:** eval / quality / benchmarks

## Context

The eval deep research is clear: LLM/VLM judges are useful but fallible. Strong judges still show bias and drift, so production gates need calibration against human labels. Ralphy has quality gates, scorecards, benchmark sets, and mode fixtures, but no harness that measures judge-human agreement for the judges themselves.

## What

Add a calibration layer for Ralphy eval judges: human-labeled examples, judge runs over those examples, agreement metrics, and threshold reports. The first target is binary pass/fail checks, not broad Likert scores.

## Why it matters

Quality gates should not become unverified taste. If a judge blocks or ships content, maintainers need to know its true-positive rate, true-negative rate, and agreement with human labels before trusting it in a content farm.

## Scope / acceptance

- Define a small labeled-example schema for eval calibration datasets, covering artifact refs, expected binary labels, mode, gate id, and human rationale.
- Add a CLI surface such as `ralphy eval calibrate --gate <id> --dataset <path>` or a test-only equivalent.
- Compute and report confusion matrix, TPR, TNR, precision, recall, and Cohen's kappa for binary gates.
- Pin judge model ids and judge prompt versions in the report so drift can be detected after model or rubric changes.
- Add starter datasets for at least two gates: first-frame hook and text/OCR or caption sync.
- Add docs explaining the threshold for promoting a judge to a hard gate versus advisory.
- Add tests for metric math and for a seeded toy calibration dataset.

## Notes

- Builds on #419, #430, #439-#443, and #457.
- Keep datasets small enough for CI smoke, with larger production calibration sets optional.
- The research recommendation is `kappa >= 0.6` as a reasonable first promotion bar; document it as a default, not a universal truth.
