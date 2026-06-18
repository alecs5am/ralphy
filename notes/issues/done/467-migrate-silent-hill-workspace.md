# Migrate the Silent Hill universe into a dedicated `silent-hill` workspace

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** medium
> **Category:** workspace / migration

## Context

The choose-silenthill episodes (001 / 002 / 003) and their cast project (fogtown-cast-001) currently live in the shared `choose-path` workspace alongside unrelated work. The user wants the universe isolated so production and the upcoming per-workspace evaluators (#468) operate on a clean, self-contained universe. This workspace is the **first instance + named test target** for the workspace-evaluator framework.

## What

Create a `silent-hill` workspace and move the four projects into it, then rewrite the hardcoded `choose-path` paths inside choose-silenthill-003's generated build scripts and verify a render still resolves.

## Why it matters

Isolation is the prerequisite for the per-workspace rubric/evaluator work. The hardcoded paths will silently break a re-bake/re-render of 003 after the move (the build scripts read fogtown masters + render assets by absolute workspace path).

## Scope / acceptance

- `ralphy workspace create silent-hill`; then `ralphy project move <id> silent-hill` for `choose-silenthill-001`, `-002`, `-003`, `fogtown-cast-001` (moves dir + updates `registry.json` — `cli/commands/project.ts:1322`).
- Grep + rewrite hardcoded `.ralphy/workspaces/choose-path/projects/...` references in `silent-hill/projects/choose-silenthill-003/{build-index-v2.mjs,rebake-master.mjs,rederive-timeline.mjs}` (and any siblings) to the new workspace path, or make them workspace-relative.
- Verify: `ralphy project show` resolves each; 003's fogtown master refs resolve; `node build-index-v2.mjs` + `ralphy render choose-silenthill-003 --workers 1` succeed from the new location.
- Registry-aware move only — no deletes, no artifacts lost (append-only contract).

## Dependencies and linked work

- Workspaces layer: #108 (done).
- Blocks #471 (Silent Hill rubric instance), #472 (stage-gate mapping).

## Notes

- Both 003 and fogtown-cast-001 move together so the cross-project ref paths stay valid after rewrite.
- Follow-up to consider: promote fogtown-cast-001 from a project into the workspace `shared/` cast library (out of scope here).

## Resolution (2026-06-18)

Migrated all four projects into a new `silent-hill` workspace via `ralphy workspace create silent-hill` + `ralphy project move <id> silent-hill` (registry-aware, non-destructive). `workspace show silent-hill` lists all four; the old `choose-path/projects/` no longer holds them; all files (003 `index.html`, fogtown master images, the 24 SFX clips) are intact at the new location.

**Key divergence from the assumption above:** 003's build scripts (`build-index-v2.mjs`, `rebake-master.mjs`, `rederive-timeline.mjs`) carry **no hardcoded `workspaces/choose-path` paths** — they use `import.meta.url`-relative reads (`new URL("./render/...", import.meta.url)`) and `artifacts/...`-relative media srcs. The only absolute `choose-path` references live in append-only `.jsonl` generation logs (e.g. `fixes-nyx.jsonl`), which are historical records of past `ralphy generate --ref` calls, are NOT read at build/render time, and are left untouched per the append-only contract. So **no script rewrite was required**.

**Verification:** `node build-index-v2.mjs` run from the new project dir produced a **byte-identical `index.html`** (md5 `0b3a091fc639c2fa67b278d5fe4407cc`) with **0 missing-file warnings**, and `bunx hyperframes lint` reported **0 errors** (181 pre-existing craft warnings — audio-track overlaps / GSAP tweens, unrelated to the move; all `artifacts/...` media resolved). Render-readiness is therefore confirmed. The full `ralphy render` (a ~101s composition → mp4, minutes) was intentionally NOT re-run: it would overwrite the existing `render/final.mp4` deliverable for a redundant confirmation — render-readiness is fully established by the deterministic build + zero lint errors.
