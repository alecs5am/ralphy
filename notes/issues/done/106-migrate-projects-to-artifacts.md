# Migrate the whole workspace to the new layout (`.ralphy/` root + workspaces + `artifacts/`)

> **Status:** done — 2026-06-11
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Unified one-pass migration to the final layout defined by **#105** (per-project `artifacts/`) and **#108** (root rename `workspace/` → `.ralphy/`, workspaces grouping layer, `shared/`). The user explicitly chose a **full migration** (over additive back-compat): the ~80 existing projects should be moved to the final layout in one pass, not left straddling schemes. This issue is the one-time migration + removal of any back-compat read-shims that close the window. Sequence strictly after both #105 and #108.

The combined end-state target per project: `.ralphy/workspaces/default/projects/<id>/artifacts/<kind>/...` (all current projects land in the `default` workspace; the user splits into named workspaces afterward).

## What

A migration that performs both moves together:

**Root + workspace move (per #108):**
- `workspace/` → `.ralphy/`
- `.ralph/{registry.json,config.json}` → `.ralphy/{registry.json,config.json}`; `.ralph/{asset-cache,library-cache}` → `.ralphy/cache/{assets,library}`
- `.ralph/{brands,personas,refs}` (global) → `.ralphy/workspaces/default/shared/{brands,personas,refs}`
- `workspace/{templates,batches}` → `.ralphy/workspaces/default/{templates,batches}`
- `workspace/{research,references}` → `.ralphy/{research,references}` (stay global)
- each `workspace/projects/<id>/` → `.ralphy/workspaces/default/projects/<id>/`
- registry entries gain `workspace: "default"`; active-workspace pointer set to `default`

**Per-project `artifacts/` move (per #105), inside each migrated project:**

1. `git mv` (where tracked) / `fs.rename` each `assets/<kind>/*` → `artifacts/<kind>/*` and `refs/*` → `artifacts/refs/*`, preserving `.vN` version siblings and any `old/` archive subfolders intact.
2. Rewrite path references inside `asset-manifest.json` (every `assets/...` / `refs/...` string → `artifacts/...`).
3. Rewrite media paths in append-only logs **without** breaking append-only semantics — i.e. do NOT truncate/filter; rewrite path strings in place only (the migration is a structural move, not a log edit, so paths must follow the files). `generations.jsonl`, `user-assets.jsonl` may carry `assets/`/`refs/` paths.
4. Leave `render/`, `units/`, `prompts/`, `compositions/`, `selected/`, `logs/` directories themselves untouched (only path strings inside their JSON/manifests get rewritten if they point into `assets/`/`refs/`).
5. Remove now-empty `assets/` and `refs/` dirs after a successful move.

Ship it as a CLI verb (e.g. `ralphy workspace migrate-artifacts [--dry-run] [--project <id>]`) — never an ad-hoc script — so it's idempotent, logged, and re-runnable. `--dry-run` prints the move plan + count of manifest/log path rewrites without touching disk. Once every project is migrated, remove the legacy read fallback added in #105 so resolution is single-path again.

## Why it matters

A clean single end state: the viewer (#107), the agent, and every `ls` see exactly one media tree. Straddling two layouts indefinitely is the back-compat tax the user explicitly declined. Doing it as an idempotent, dry-runnable verb (not a one-shot script) means it's safe to run incrementally and to re-run if a project was added mid-flight.

## Scope / acceptance

- A single migration verb (e.g. `ralphy migrate` or `ralphy workspace migrate`), JSON output by default, `--dry-run`, optional `--project <id>` to scope to one project's inner `artifacts/` move.
- Idempotent: running twice is a no-op on an already-migrated tree (detect by presence of `.ralphy/workspaces/` + absence of `workspace/projects/`; per-project by `artifacts/` present + `assets/` absent).
- Provenance preserved: `.vN` siblings, `old/` archives, and manifest version entries all survive and still resolve. Spot-check on a heavy-reroll project (e.g. one of the `choose-*` or `analog-horror-*` projects with many versions).
- After migration: remove the legacy `assets/`/`refs/` read fallback (#105) and any legacy `workspace/` root fallback (#108) — both back-compat windows close.
- `registry.json`, `asset-manifest.json`, and log path strings point at the new layout; no legacy path remains (`rg -l '"(assets|refs)/' .ralphy/workspaces` empty post-run; no `workspace/projects/` string in registry).
- A render of one migrated project succeeds end-to-end (`ralphy render <id>`) — proves the path rewrites (root + workspace + artifacts) are all complete.
- Gates: `bun test` green; new smoke test for the verb (dry-run plan assertion + a fixture round-trip covering the root move AND a per-project artifacts move).

## Notes

- **Sequence strictly after #105 AND #108** — depends on both the `artifacts/` helpers and the workspaces/`.ralphy/` layout being in place (write-to-new/read-old shims live for the window this issue closes).
- AGENTS.md invariant #14 (append-only) and #17 (no mutating files an in-flight job reads): run the migration only when no background `ralphy generate` is in flight; the verb should refuse / warn if it detects a running job, or at minimum document the precondition. The path-string rewrites in registry/manifests/logs are a structural relocation, not a content edit — but call this out in the verb's docstring so it's not mistaken for a banned log rewrite.
- This is destructive-by-move on tracked workspace data → the verb must be explicit and dry-runnable; never auto-run it from another command.
- All current projects land in the `default` workspace; splitting into named workspaces (e.g. moving the `choose-*`/`fogtown-*` set into a `choose-universe` workspace and promoting the cast into its `shared/`) is a follow-up the user does manually via `ralphy project move` + `ralphy workspace create` (#108), not part of this automated pass.
- Cross-links: **#105** + **#108** (prerequisites), **#107** (consumer), **#012** (old-version archive — its `old/` subfolders must migrate cleanly here).
