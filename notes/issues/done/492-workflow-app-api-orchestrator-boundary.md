# Workflow app API boundary for agent orchestrators

> **Status:** done — 2026-07-09 (studio-server API boundary: existing run/graph/annotation/inbox/patch routes confirmed + documented; ADDED GET /api/capabilities (machine-readable action discovery + stable-id conventions), GET /api/workspaces/<ws>/approvals + POST .../respond driving `ralphy farm review` approve/reject/request-change via runCli with no new media mutation, inbox ?id show. Auth-gated. docs/workflow-app-api.md + CLAUDE.md pointer. React client untouched. 129 studio tests green.)
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** high
> **Category:** studio / API / orchestration

## Context

The user clarified the intended product shape: the workflow application owns the visual workflow surface and exposes an API. Claude Code remains the outer orchestrator for now, but it should operate the app through that API instead of reaching into files directly for every action.

## What

Define a local workflow-app API contract that Claude Code can use to inspect and operate runs, workflows, approvals, annotations, config patches, and agent inbox items. The API is the orchestration boundary; `.ralphy/` files remain the durable state behind it.

## Why it matters

Claude Code needs a stable control surface if Studio becomes more than a read-only browser. Without an API boundary, every agent will keep re-deriving file paths and mutating state inconsistently. A narrow API lets Studio, Eve, Claude Code, and future agents share one operational contract.

## Scope / acceptance

- Document the workflow-app API boundary and the rule that Claude Code orchestrates through it.
- Add or extend local endpoints for run show/status, workflow graph/status, annotation list/write, inbox create/list/show, config patch validate/apply, and approval list/respond.
- All mutating endpoints are metadata-only unless they call an existing ralphy verb or local API path that preserves append-only media semantics.
- API responses include stable object ids that Studio can display and Claude Code can reference.
- Add a machine-readable capability endpoint so Claude Code can discover supported actions instead of guessing.
- Add smoke tests over the API surface using fixture workspaces.
- Update agent-facing docs to prefer the API boundary over ad-hoc file reads where an endpoint exists.

## Notes

- Builds on #489, #490, and #491.
- Do not make the API a second media engine. Media generation, eval, repair, render, and Unit formation still route through ralphy primitives.
