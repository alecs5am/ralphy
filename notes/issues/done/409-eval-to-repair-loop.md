# Build an eval-to-repair loop for rendered projects

> **Status:** done — 2026-06-14 (fixer skill + deterministic buildRepairPlan/classifyFindingOwner in cli/lib/repair.ts + `ralphy project repair-plan`; owner map style/ai-artifacts→art-director, structure/hook→scenarist, audio/captions→editor; deep-vision what_to_redo preferred; no paid call before user approval)
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** evaluator / editor / art-director

## Context

`ralphy eval video` produces `eval.json`, `eval-report.md`, and, with deep vision, `eval-deep-vision.json` including `what_to_redo`. The evaluator skill explicitly stops at the report. That is correct separation of concerns, but there is no standard fixer loop that converts findings into targeted project edits and re-runs eval.

## What

Add a repair workflow for agents: read eval output, classify findings by owner, propose an ordered repair plan, ask for approval before paid regeneration, apply targeted fixes through existing `ralphy` verbs, render, and re-evaluate.

## Why it matters

The quality flywheel should not end with "here are problems." Low-tech chat users need the agent to turn critique into an executable fix pass without handholding, while still preserving checkpoints and cost control.

## Scope / acceptance

- Add a user-facing fixer skill, e.g. `.agents/skills/fixer/SKILL.md`, triggered by "fix the eval", "repair this render", "make it shippable", or a failed eval handoff.
- Define `repair-plan.json` / `REPAIR_PLAN.md` with finding ids, owner role, target slot/file, proposed command or edit, cost estimate, risk, and approval state.
- Map categories deterministically: style/register/ai-artifacts to art-director, structure/hook/duration to scenarist/editor, audio/captions/format to editor.
- The fixer must not make paid model calls until the user approves the repair plan or previously opted into batch repair.
- After fixes, run `ralphy render`, `ralphy eval video`, and compare old/new verdicts.
- Add tests with fixture `eval.json` files that assert the generated repair plan owner mapping and priority order.

## Notes

- Reuse `eval-deep-vision.json.what_to_redo` when present; fall back to `findings[]` otherwise.
- This is a skill/workflow first. Add CLI helpers only where deterministic parsing or state persistence needs them.
