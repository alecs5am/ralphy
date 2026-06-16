# Roadmap to issue factory

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps

## Purpose

This document defines how to turn roadmap material into executable
`notes/issues/` batches without flooding the backlog or duplicating existing
program issues.

## Batch size

Use small batches:

- 5 to 12 issues for focused implementation weeks.
- 15 to 25 issues for a larger program planning pass.
- More than 25 only when the issues are mechanical, clearly independent, and
  collision-checked.

Do not file 1000 issues in one commit. The roadmap exists to preserve direction
while the active backlog stays executable.

## Issue shape

Every issue created from a roadmap section should include:

- Problem statement.
- Why it matters.
- Scope and acceptance.
- Files or commands likely involved.
- Linked roadmap file and section.
- Dependencies or sequencing notes.
- Test or verification expectation.
- Non-goals.

## Conversion workflow

1. Pick one roadmap program.
2. Read its related active issues.
3. Search all issues, including `done/` and `deprecated/`, for collisions.
4. Select one workstream and split it into executable units.
5. File only the units that can be worked in the next one to four weeks.
6. Cross-link the parent roadmap and any umbrella issue.
7. Run the English-only gate.
8. Commit the issue batch.

## Granularity rules

Good issue sizes:

- Add one schema and tests.
- Add one CLI output field and pretty coverage.
- Add one mode contract and fixtures.
- Add one eval gate and golden files.
- Add one Desktop panel wired to existing JSON.
- Add one packaging output type.

Too large:

- Build the whole Desktop app.
- Implement all content modes.
- Create the model router.
- Make quality perfect.
- Add cloud execution.

Too small:

- Rename one local variable unless it fixes a bug.
- Add a sentence to docs without a behavior or clarity goal.
- File placeholders for every future mode with no acceptance criteria.

## Program sequencing heuristic

Prefer issues that create compounding infrastructure:

1. Schemas and state contracts.
2. Fixtures and test gates.
3. CLI primitives with stable JSON.
4. Playbook and agent-routing integration.
5. Desktop or UX surfaces consuming stable primitives.
6. Batch and cloud extensions.

Avoid issues that depend on unstable upstream decisions unless the issue is
explicitly a design spike.

## Collision checklist

Before filing an issue:

- Search `notes/issues/` top level.
- Search `notes/issues/done/`.
- Search `notes/issues/deprecated/`.
- Search `notes/ideas/`.
- Search roadmap docs for the same concept.
- If an existing active issue already covers the work, update or cross-link it.
- If a done issue covered the first version, file a follow-up and explain what
  changed.

## Example conversion

Roadmap text:

> Video eval should inspect temporal behavior, not only isolated frames.

Possible issues:

- Add scene segmentation output to video eval.
- Add temporal product-presence scoring.
- Add caption/audio sync gate.
- Add eval fixture for flickering product identity.
- Add repair-plan mapping for temporal continuity failures.

Do not file one issue called "Improve video eval" unless it is an umbrella that
explicitly delegates to smaller follow-ups.
