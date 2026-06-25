# Studio safe config patches

> **Status:** done — 2026-06-25
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** medium
> **Category:** studio / workflow / configuration

## Context

The user wants some Studio controls that can change state and feed context back to Claude Code, but Claude Code should remain the orchestrator. Full graph editing is too much for v1; a bounded config patch surface gives manual control without breaking the production contract.

## What

Add safe Studio controls for a small allowlist of run/workflow settings. Studio should write reviewable patch files or append-only config events, and Claude Code or ralphy should apply them through existing validation paths.

## Why it matters

The user can make obvious operational changes visually: disable a destination, raise or lower variant count, switch a gate to approval mode, adjust a budget cap, or mark a template choice. These should not require editing JSON by hand, and they should not let Studio create invalid workflows.

## Scope / acceptance

- Define an allowlist of editable fields: batch size, variant count, budget cap, destination enabled/disabled, template choice, model preference, gate strictness, approval mode, and publish target.
- Store proposed changes as patch records, for example under `config-patches/*.json` or an append-only `config-events.jsonl`.
- Reuse existing schemas for validation before a patch can be marked applicable.
- Studio shows pending, applied, and rejected patch state.
- Claude Code can read the patch file as context, and a CLI command can validate/apply it when approved.
- No arbitrary node creation, edge wiring, or raw command execution in Studio.
- Tests cover valid patches, rejected invalid patches, and no media mutation.

## Notes

- Sequence after #489 if the patch is handed to Claude Code for approval, or parallel if a CLI validate-only path lands first.
- This is the v1 manual-configuration base; full visual workflow editing remains out of scope.
