# Remix intake missing "frame-study the source register up front" step

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

For any remix (the "make this exact video but swap X" path), the cheapest first move is to slice the source at 0.1-0.2s intervals through key beats and READ the frames to lock register, motion design, and pacing — BEFORE drafting prompts. Current art-director flow lets the agent improvise the prompt and discover register mismatches only after expensive regen clusters.

## What

- `ralphy-vs-higgsfield-001`: workflow-fixes #4 + lessons rules 1-2 — two biggest regen clusters (monster face, den realism) came from not matching source register on first prompt. Frame-study at turn 19 would have saved ~18 regens if done at turn 1.

## Why it matters

Frame-study costs ~$0 and ~2 minutes. Register mismatch costs $0.50-$3 per regen wave. The asymmetry is enormous.

## Suggested fix

- Add to intake / remix playbook (`docs/playbooks/intake.md`, `docs/skills-vs-templates.md`):
  - **Before generating any anchor**, slice source at 0.1-0.2s through key beats and extract:
    - (a) realism register (still-photo / TV-commercial / illustration / etc.)
    - (b) character eye/mouth/motion design specifics
    - (c) motion pacing (cut frequency, hold duration)
  - Lock as a `guideline:` in the project, then generate.
- Wire into `ralphy ref pull` + `ralphy ref frames` so the slicing is one verb away.
- Cross-link from issue 017 (register axis) and issue 047 (HF rules).

## Sources

- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/05-workflow-fixes.md` — #4
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — rules 1-2
- MEMORY: `feedback_ralphy_ref_analyze_video`
