# Monorepo → multi-repo split (DESIGN DOC ONLY, do not execute)

> **Status:** done — 2026-06-15 (design doc only — docs/architecture/repo-split-plan.md re-grounded against the live repo: 4-way core/landing/docs/assets mapping, per-repo git-history strategy, install/asset-cache/CI impact, runtime-vs-build coupling, staged cutover + rollback, open questions. NO files moved, NO repos created — execution stays deferred.)
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** high (risk) / deferred execution
> **Category:** architecture / infra

## Context

The repo bundles the CLI engine, the landing site, Mintlify docs, and (links to)
assets. The user wants it split into focused repos. Execution is deferred — this
round produces only a migration **design doc**, not the split.

## What

Write a detailed migration plan for splitting into:

- **core** — the `ralphy` CLI + engine; the only thing a user installs/runs.
- **landing** — `landing/` (Next.js marketing + library + skills site).
- **docs** — `docs-mintlify/` (Mintlify).
- **assets** — heavy template/showcase assets (relationship to existing
  `ralphy-assets` companion repo).

## Scope / acceptance (design doc only)

1. New `docs/architecture/repo-split-plan.md` covering:
   - Exact path → target-repo mapping (incl. `docs/`, `guidelines/`, `templates/`,
     `notes/`, `roadmap/`, `scripts/`, `npm/`, `desktop/`, `out/`, `dist/`).
   - Git-history strategy (subtree/filter-repo vs clean cut) per repo.
   - **Install flow impact** (`install.sh`, Homebrew tap, npm `@alecs5am/ralphy`).
   - **Asset-cache impact** (`workspace/.ralph/asset-cache/`, `ralphy assets *`).
   - **Cross-repo coupling**: AGENTS.md/skills/templates the CLI reads at runtime;
     how landing + docs consume templates/skills at build time.
   - CI workflow split (`.github/workflows/ci.yml` + the 10 lint scripts).
   - Staged cutover sequence + rollback.
2. Open questions captured; no files moved, no repos created.

## Why it matters

A 4-way split touches install, CI, asset paths, and runtime reads. Doing it blind
mid-initiative would break everything. Plan first, execute in a dedicated session.

## Notes

- Independent of the other issues. Plan-only — do NOT carve repos this round.
