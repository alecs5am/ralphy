# Failure lessons router

> **Status:** done — 2026-06-15
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

#113 added postmortem distillation into memory proposals, and #417 tracks guideline coverage. The remaining gap is routing each durable lesson to the right home: memory, guideline, model warning, template update, content mode rule, or CLI bug. Postmortems currently mix all of these in one narrative.

## What

Add a failure lessons router that processes eval reports, repair outcomes, and postmortems into structured proposals for the correct knowledge surface.

## Why it matters

Bad lessons in memory poison future runs, while good craft lessons hidden in postmortems never reach the pipeline. The system needs to capture the fix, route it correctly, and avoid over-generalizing one project.

## Scope / acceptance

- Input: postmortem files, eval reports, repair plans, council reports, and generation failure logs.
- Output: proposed actions with route `memory`, `guideline`, `MODELS.md`, `content-mode`, `template`, `skill`, `cli-issue`, or `drop`.
- Require negative scope for any memory/guideline proposal.
- Prefer updating existing entries over creating near-duplicates.
- Include provenance pointing to the source project and source section.
- Add a dry-run report mode and fixture tests with examples from recent postmortems.

## Notes

- Builds on #113 and #417.
- This should not auto-approve memory or guideline changes.
