# Art-director playbook missing the "location master plate" rule

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** playbook

## Context

For multi-scene-same-room projects, anchor #1 must be a wide `location-master-plate` shot of the room — every subsequent scene anchor anchors against it. Without that rule, the agent generates N "same room" anchors that each invent a different couch, lamp, window. The playbook is silent on this.

## What

- `noski-people-001`: 3 different couches across 3 anchors before user caught it (workflow-fixes #2, P0 recurrence ~100%). $0.45 image regen + 45 min user-feedback loop.
- Generalized in `noski-people-001/postmortem/02-lessons.md` Rule 1.
- Related ratio heuristic: ≥3 unique anchor angles per recurring subject for ≥25-scene projects.

## Why it matters

Location drift is the most common identity defect across multi-scene projects. It's also the cheapest to fix structurally (one extra anchor at the top).

## Suggested fix

- New section in `docs/playbooks/art-director.md` (or sub-doc `art-director/location-plate.md`):
  - "Location lock — generate one wide `location-master-plate` anchor BEFORE any scene anchor."
  - Pass it as `--ref` on every subsequent scene-anchor call.
  - Anchor-to-scene ratio heuristic for ≥25-scene projects.
- Cross-link from `intake.md` so it triggers when the brief implies a single recurring location.

## Sources

- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — #2, P0
- `workspace/projects/noski-people-001/postmortem/02-lessons.md` — Rule 1
- MEMORY: `feedback_super_original_refs` (related — locking refs to prevent identity drift)
