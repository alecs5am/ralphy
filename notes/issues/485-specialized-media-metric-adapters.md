# Specialized media metric adapters for eval gates

> **Status:** todo
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** medium
> **Category:** eval / media-qc / adapters

## Context

The research highlights specialized metrics that correlate with human perception better than generic judges for specific media: UTMOS for speech naturalness, WER for TTS intelligibility, ImageReward/HPS or aesthetic predictors for images, and VBench/VideoScore-style metrics for video. Ralphy already has deterministic gates and VLM judges, but no adapter layer for optional specialized scorers.

## What

Create an optional metric-adapter registry for media-specific scorers. Adapters should degrade gracefully when the tool/model is unavailable and should enrich existing eval reports rather than create a parallel quality system.

## Why it matters

Generic LLM/VLM judges are expensive and inconsistent on low-level perceptual quality. Specialized metrics can catch obvious failures cheaply and can rank variants before a more expensive judge pass.

## Scope / acceptance

- Define a small adapter interface for metric scorers: input artifact, capability/kind, score shape, threshold, and failure reason.
- Wire initial optional adapters for at least two high-ROI checks, such as TTS WER via existing transcription and image prompt/aesthetic scoring through a pluggable local or provider-backed scorer.
- Add capability detection so missing binaries/models produce `na` with an actionable hint, not a crash.
- Enrich existing reports or scorecard dimensions rather than adding unmanaged report types.
- Add config for thresholds per mode/workspace where needed.
- Add tests for adapter availability, missing-tool degradation, threshold mapping, and scorecard enrichment.

## Notes

- Builds on #457 and #461.
- Do not add raw provider calls. Scorers must go through registered connectors or local binaries wrapped by Ralphy verbs.
- Keep VBench/VideoScore-class video metrics as a later adapter if the dependency footprint is too high for the first slice.
