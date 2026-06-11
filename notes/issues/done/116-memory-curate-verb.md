# `ralphy memory curate` + `retire`: keep the memory healthy

> **Status:** done — 2026-06-11
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

The active tier caps at 100 entries (#112) and the cap error demands
consolidation — but there is no tooling to DO the consolidation. Hermes'
curator (background agent: pin/archive/consolidate, never delete) is the
reference; ours is on-demand, user-driven.

## What

1. **`ralphy memory retire <slug> [--workspace [<ws>]]`** — move an ACTIVE
   entry (every version file — else an older version resurfaces as newest) to `archived/` and drop
   its index line. MOVE, never unlink (the hermes never-delete rule). The
   explicit destructive-ish verb fires only on user intent — curate suggests,
   the user runs it.
2. **`ralphy memory curate [--workspace <ws>] [--dry-run]`** — LLM-assisted
   health pass over BOTH tiers' active entries via `callLLM()`:
   - overlapping entries → a merged survivor staged into `proposed/`
     (approve = the merge lands as the survivor slug's next version) + a
     suggestion list of slugs to `retire` after approval;
   - entries with missing/placeholder `Does NOT apply to:` → flagged;
   - stale entries (named model/verb no longer in MODELS.md / CLI surface) →
     flagged for retire.
   Curate NEVER mutates active entries itself — output is staged proposals +
   a suggestions report. `--dry-run` stages nothing.

## Scope / acceptance

1. Store: `archived/` status + `retireEntry()` (move semantics, index
   rebuild); curate lib in `cli/lib/memory/curate.ts`.
2. Verbs wired in `cli/commands/memory.ts` with `--help` examples;
   `lint:help-examples` green; surface + docs regen.
3. Unit tests: retire move semantics + index drop; curate staging with
   fetch-level LLM stub (#072 rule), dry-run stages nothing.
4. English-only; errors reuse `E_MEMORY_NOT_FOUND`.

## Notes

- No cron/idle trigger (hermes runs idle-triggered; we have no daemon for
  this) — the memory-review skill (#115) tells the agent to suggest a curate
  pass when `list` shows >70 active entries or the cap error fires.
- Sequence after #112.
