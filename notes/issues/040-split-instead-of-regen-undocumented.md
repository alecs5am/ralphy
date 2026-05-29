# "Split scene instead of regen" iteration pattern not in playbook

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

When a scene fails twice on the same axis (e.g. one motion beat the model can't deliver), splitting it into N micro-shots within the same time budget is dramatically cheaper than re-prompting. The pattern is high-ROI but lives in no playbook.

## What

- `flipper-hypermotion-001`: rule #11 — scene-03 redo cost $1.28 (10% of project) and produced more lessons per dollar than the rest of phase 3 combined. Without the pattern, agents default to re-prompting the same scene.

## Why it matters

Default agent behavior is re-prompt-on-fail. That's the worst loop for "one beat the model can't do" — it converges nowhere. Splitting converts an impossible 5s shot into three possible 1.6s shots.

## Suggested fix

- Add a section to `docs/playbooks/art-director.md` (or `editor.md`):
  - **Rule:** When a scene fails twice on the same axis, split it into N micro-shots inside the same slot budget. Don't re-prompt.
  - Concrete example from flipper postmortem (scene-03 redo).
  - Pairs with multi-block i2v extend (issue 012) as the structural solution.

## Sources

- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — rule #11
