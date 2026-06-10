# Migrate all existing projects' `assets/` + `refs/` → `artifacts/`

> **Status:** todo
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Follow-on to **#105**, which defines the new `artifacts/` layout and makes the CLI write there while still reading legacy `assets/`/`refs/`. The user explicitly chose a **full migration** (over additive back-compat): the ~80 existing projects under `workspace/projects/` should be moved to the new layout in one pass, not left straddling two schemes. This issue is the one-time migration + the back-compat read-shim removal that closes the window.

## What

A migration that, per project under `workspace/projects/<id>/`:

1. `git mv` (where tracked) / `fs.rename` each `assets/<kind>/*` → `artifacts/<kind>/*` and `refs/*` → `artifacts/refs/*`, preserving `.vN` version siblings and any `old/` archive subfolders intact.
2. Rewrite path references inside `asset-manifest.json` (every `assets/...` / `refs/...` string → `artifacts/...`).
3. Rewrite media paths in append-only logs **without** breaking append-only semantics — i.e. do NOT truncate/filter; rewrite path strings in place only (the migration is a structural move, not a log edit, so paths must follow the files). `generations.jsonl`, `user-assets.jsonl` may carry `assets/`/`refs/` paths.
4. Leave `render/`, `units/`, `prompts/`, `compositions/`, `selected/`, `logs/` directories themselves untouched (only path strings inside their JSON/manifests get rewritten if they point into `assets/`/`refs/`).
5. Remove now-empty `assets/` and `refs/` dirs after a successful move.

Ship it as a CLI verb (e.g. `ralphy workspace migrate-artifacts [--dry-run] [--project <id>]`) — never an ad-hoc script — so it's idempotent, logged, and re-runnable. `--dry-run` prints the move plan + count of manifest/log path rewrites without touching disk. Once every project is migrated, remove the legacy read fallback added in #105 so resolution is single-path again.

## Why it matters

A clean single end state: the viewer (#107), the agent, and every `ls` see exactly one media tree. Straddling two layouts indefinitely is the back-compat tax the user explicitly declined. Doing it as an idempotent, dry-runnable verb (not a one-shot script) means it's safe to run incrementally and to re-run if a project was added mid-flight.

## Scope / acceptance

- New verb under `cli/commands/workspace.ts` (or wherever workspace subcommands live): `migrate-artifacts`, JSON output by default, `--dry-run`, optional `--project <id>` to scope to one.
- Idempotent: running twice is a no-op on already-migrated projects (detect by presence of `artifacts/` + absence of `assets/`).
- Provenance preserved: `.vN` siblings, `old/` archives, and manifest version entries all survive and still resolve. Spot-check on a heavy-reroll project (e.g. one of the `choose-*` or `analog-horror-*` projects with many versions).
- After migration of the whole workspace: remove the legacy `assets/`/`refs/` read fallback from `cli/lib/path-resolution.ts` / `providers/shared.ts` (the back-compat window from #105 closes).
- `asset-manifest.json` and log path strings point at `artifacts/...`; no `assets/`/`refs/` path remains in any migrated project (`rg -l '"(assets|refs)/' workspace/projects` empty post-run).
- A render of one migrated project succeeds end-to-end (`ralphy render <id>`) — proves path rewrites are complete.
- Gates: `bun test` green; new smoke test for the verb (dry-run plan assertion + a fixture-project round-trip).

## Notes

- **Sequence strictly after #105** — depends on the new helpers + the write-to-new/read-both shim being in place.
- AGENTS.md invariant #14 (append-only) and #17 (no mutating files an in-flight job reads): run the migration only when no background `ralphy generate` is in flight; the verb should refuse / warn if it detects a running job, or at minimum document the precondition. The path-string rewrites in logs are a structural relocation, not a content edit — but call this out in the verb's docstring so it's not mistaken for a banned log rewrite.
- This is destructive-by-move on tracked workspace data → the verb must be explicit and dry-runnable; never auto-run it from another command.
- Cross-links: **#105** (prerequisite), **#107** (consumer), **#012** (old-version archive — its `old/` subfolders must migrate cleanly here).
