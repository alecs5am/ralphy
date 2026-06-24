# Workspace run control plane for content farms

> **Status:** done — 2026-06-24
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** high
> **Category:** workspace / orchestration / content-farm

## Context

Deep research on local content farms and eval-driven pipelines reinforced that high-volume production needs a run-level control plane, not only per-project state. Ralphy already has projects, batches, workflows, scorecards, spend ledgers, and Units, but there is no single workspace-level object that represents "this campaign / farm run" across all member projects.

## What

Add a workspace-scoped Run or Campaign artifact that binds one strategic brief, workflow, intelligence pack, creative strategy, variation matrix, budget approvals, member projects, queue jobs, eval rollups, winners, failed items, and packaged Units. A Run is the user's mental object: one content-farm request that may produce many projects and many Units.

## Why it matters

Without a run object, Studio and agents reconstruct farm state by reading scattered projects and chat history. A fresh agent should be able to answer: what is this farm trying to produce, what has shipped, what is blocked, what has cost money, and what should happen next.

## Scope / acceptance

- Add a schema for `.ralphy/workspaces/<ws>/runs/<run-id>/run.json`.
- The schema references, but does not duplicate, existing artifacts: workflow name, project ids, batch id, strategy path, intelligence pack path, scorecard/review paths, and Unit ids.
- Add read-only helpers to list, load, and summarize workspace runs.
- Add CLI surface such as `ralphy run list`, `ralphy run show <id>`, and `ralphy run status <id>` or an equivalent `workspace run` namespace.
- Status output includes current phase, blockers, awaiting approvals, cost summary, quality summary, winners, failures, and next action.
- Preserve append-only history: run events append to a log or versioned snapshots; no project artifacts are moved or overwritten.
- Add unit tests for schema parsing, status derivation from seeded project fixtures, and missing-project degradation.

## Notes

- Builds on #410, #452, #456, #457, #460, and #478.
- Sequence before Studio run surfaces and run-wide budget caps.
- This is local-first. Cloud identities and remote workers stay in the cloud seam.
