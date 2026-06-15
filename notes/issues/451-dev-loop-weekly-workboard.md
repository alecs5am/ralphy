# Dev-loop weekly workboard

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

The live backlog is growing quickly, and a downstream agent can process many tasks per day. The repo needs a lightweight way to group active issues into execution lanes for a week without introducing a separate roadmap board.

## What

Add a notes-native weekly workboard that selects issues, orders them by dependency, and records owner/status handoff for `/dev-loop` runs.

## Why it matters

Without grouping, an agent may pick easy unrelated issues instead of moving a coherent product slice forward. A weekly workboard keeps momentum while preserving the notes-only tracker model.

## Scope / acceptance

- Define a `notes/workboards/` or similar notes-native folder, or document why it should live as a single active issue file instead.
- Add a template with lanes, dependencies, selected issue ids, expected gates, and completion notes.
- Create the first workboard for the content-farm pipeline tranche.
- Ensure it does not replace `notes/issues/` as the source of truth.
- Add docs for how to close or refresh a workboard.

## Notes

- Keep this lightweight. Do not resurrect the retired roadmap board model.
