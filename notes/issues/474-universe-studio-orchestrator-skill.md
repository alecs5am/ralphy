# `/<universe>-studio` orchestrator skill (idea → tag → 4 staged gates)

> **Status:** issue
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** medium
> **Category:** skill / workflow

## Context

The user's ideal UX: come with an idea, tag a workspace, and make four approval decisions while everything else auto-assembles + auto-repairs against the universe evals. This needs an orchestrator skill that sequences the staged production with the eval gates and user checkpoints.

## What

A generic orchestrator skill that, given an idea + a tagged workspace, runs the four stages (location/cast → scenario → anchors → final montage), each through the per-stage auto-repair loop (#473) gated by the workspace criteria (#472), pausing for user approval at each stage.

## Why it matters

It ties the framework into the one-tag, four-approvals workflow the user described — the product-level payoff of the whole effort.

## Scope / acceptance

- Skill `.agents/skills/universe-studio/SKILL.md` (namespace `user`). Reads the workspace rubric (#468), drives the contract stages (#472), runs the per-stage loop (#473), checkpoints with the user at each stage.
- Generic — works for any workspace that has an evaluator config; Silent Hill is the first to exercise it end-to-end.
- Frontmatter passes `lint:skills` (kebab name, ≤1536-char description, namespace).
- Does NOT replace the per-role playbooks (scenarist / art-director / editor) — it sequences them under the eval gates.

## Dependencies and linked work

- Stage-gate map #472, per-stage loop #473.
- Sits above the production contract #406 and the per-role playbooks.

## Notes

- Naming: a generic slug (e.g. `universe-studio`) parameterized by the active workspace, not a Silent-Hill-specific skill.
