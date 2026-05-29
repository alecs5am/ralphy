# Intake playbook missing target-language; aspect default conflicts with niche skills

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

`docs/playbooks/intake.md` does not require target-audience-language as a clarifying-question field, and its global 9:16 default contradicts aspect defaults set by some niche skills (e.g. `ralphy-ugc-toon-action` uses 16:9; broadcast-realism work uses 1:1 — MEMORY: `feedback_broadcast_realism_square`).

## What

- `noski-people-001`: workflow-fixes #1 — agent took a Russian-VO detour when target audience was English; 1 wasted memory file + a pivot turn.
- `arena-rocker-001`: workflow-fixes #3 — aspect contradiction (toon-action niche wants 16:9, global intake default is 9:16); cost a clarifying-question round-trip.

## Why it matters

Two avoidable intake gaps that both produce a wasted turn early in the project.

## Suggested fix

- Add **target audience language** and **audio pipeline** (kling --audio vs ElevenLabs) to required intake fields in `docs/playbooks/intake.md`.
- Reword aspect default: "9:16 default UNLESS the matched niche skill sets its own aspect default."
- Cross-link from each niche skill SKILL.md to the aspect override rule.

## Sources

- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — #1
- `workspace/projects/arena-rocker-001/postmortem/05-workflow-fixes.md` — #3
- MEMORY: `feedback_kling_no_ru_audio`, `feedback_broadcast_realism_square`
