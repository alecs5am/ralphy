# Model router telemetry

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Postmortems contain valuable model-routing evidence: nano-banana wins App Store packs, gpt-image-2 wins precise product text, seedance wins hyper-motion physics, kling single-frame wins photoreal expression, Kling multi-frame is broken, and ElevenLabs voice settings matter. Today this knowledge lives in notes, memory, MODELS.md, and agent judgment.

## What

Add model-router telemetry that records model outcomes by mode, task, prompt class, and failure type, then exposes those statistics to the production compiler and model picker.

## Why it matters

The model router should choose based on observed win-rate and known failure modes, not stale defaults or generic "best model" assumptions.

## Scope / acceptance

- Extend generation/eval logs with structured outcome fields: mode, task, prompt class, refs count, retry count, failure class, eval score, user/council verdict when available.
- Add a summarizer that aggregates outcomes by model and mode.
- Expose agent-facing read commands such as `ralphy models recommend --mode <mode> --task <task>`.
- Keep raw provider access behind existing connectors and `callLLM()` rules.
- Include manual override and reason logging when an agent ignores the recommendation.
- Add tests with fixture logs that produce stable recommendations.

## Notes

- Related: #026 model failure modes, #411 native eval, #421 variant tournaments, and #417 guidelines.
