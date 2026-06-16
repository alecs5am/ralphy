# First-frame hook gate

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Short-form videos win or lose in the opening frame and first second. Existing native-video eval can judge the whole video, but the pipeline needs an explicit first-frame/hook gate before a Unit is called polished.

## What

Add a gate that evaluates the first frame and first 1-2 seconds for subject clarity, contrast, motion promise, product visibility, text hook, and scroll-stop potential.

## Why it matters

A technically good video with a weak opening will underperform. This gate makes performance-oriented critique concrete and repeatable.

## Scope / acceptance

- Extract first frame and first-second preview through existing Ralphy primitives.
- Score hook clarity, visual contrast, subject/product visibility, text legibility, and curiosity gap.
- Allow mode-specific thresholds.
- Feed findings into repair plans and variant tournaments.
- Add fixtures for strong, weak, and misleading hooks.

## Notes

- Related: #421 variant tournament, #427 readiness scorecard.
