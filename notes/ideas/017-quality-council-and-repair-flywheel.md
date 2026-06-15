# Quality council and repair flywheel

> **Status:** idea
> **Filed:** 2026-06-15
> **Folder:** ideas

## Context

The accepted ideal-state subsystems include native video QA, council review, repair loop, and release readiness. These should be treated as one flywheel, not separate reports.

## What

Ralphy should have a quality flywheel: preflight council reviews the plan, gates validate refs and claims, native eval reviews the rendered media, specialized gates check OCR/captions/hooks/platform specs, repair planning turns findings into targeted actions, and final readiness decides ship/repair/block. Every failure should become a routed lesson.

## Why it matters

Quality cannot depend on the agent's taste. A systematic flywheel lets low-tech users get polished results and lets agents improve future runs from failures.

## Notes

- Related issues: #411, #415, #425, #427, #439, #440, #441, #442, #443, #450.
- The flywheel should be bounded: no endless critique loops, explicit retry budgets, and clear user approval before spend.
- Final output should say why a Unit is ready, not merely that it rendered.
