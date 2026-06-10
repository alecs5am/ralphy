# Consolidate `assets/` + `refs/` into a single `artifacts/` folder per project

> **Status:** done — 2026-06-10
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Surfaced 2026-06-10 while scoping the local artifact-browser web app (#107). Today a project's media is split across two sibling trees: `assets/{images,videos,music,voiceover,captions,sfx,fonts}` (the raw generation dump) and `refs/` (input references). For a human and for an agent doing `ls`, "everything this project consumes or produces" lives in two places with no obvious relationship. The user wants one top-level `artifacts/` folder, with the inner layout optimized for **agent navigation** (the stated priority: the agent should be able to orient itself easily). Inner sub-organization is deliberately left open to refine later.

This is the foundational, code-side half. The one-pass data migration of the ~80 existing projects is split out into **#106** (user chose full migration over additive back-compat). The viewer (#107) reads this layout. Note: the project dir itself moves under the new workspaces layout in **#108** (`.ralphy/workspaces/<ws>/projects/<id>/`) — `artifacts/` is the inner per-project subtree and is orthogonal to where the project dir lives, so these two layout changes compose cleanly.

## What

Define and implement an `artifacts/` project subtree that subsumes both `assets/` and `refs/`. Proposed default layout (peer kinds, by media type, refs as an input kind):

```
workspace/projects/<id>/
  artifacts/
    refs/         ← input references (was refs/)
    images/       ← generated stills
    videos/       ← generated clips
    voiceover/    ← VO
    music/
    sfx/
    captions/
    fonts/
  render/         ← unchanged (deliverable mp4s)
  units/          ← unchanged (curated deliverables, #069)
  prompts/ compositions/ selected/ logs/   ← unchanged
```

`render/`, `units/`, `prompts/`, `compositions/`, `selected/`, `logs/` stay as siblings — `artifacts/` is specifically the raw working dump + inputs, not deliverables or memory. The `<kind>/` split mirrors today's `assets/<kind>/`, so the change is mostly a one-level path prefix (`assets/<kind>/` → `artifacts/<kind>/`) plus folding `refs/` → `artifacts/refs/`.

Centralize the layout in `cli/lib/paths.ts` (add `artifactsDir(projectId)`, `artifactKindDir(projectId, kind)`, `projectRefsDir(projectId)`) so no other module hard-codes `"assets"` / `"refs"` string literals. During the migration window, path resolution must **read** both old (`assets/`+`refs/`) and new (`artifacts/`) locations so #106 can run without a flag day; **writes** go only to the new layout.

## Why it matters

One-glance orientation for both the agent and the viewer (#107): a single `artifacts/` tree is "all media this project touches," by kind. It also gives #012 (archive old `.vN` versions into a subfolder) a clean home (`artifacts/<kind>/old/`). Touching the path layer once, centrally, is far cheaper than the current scatter of literal `"assets"` strings across `providers/shared.ts`, `composer.ts`, `path-resolution.ts`.

## Scope / acceptance

- `cli/lib/paths.ts`: add `artifactsDir` / `artifactKindDir` / project-scoped refs helper; export the kind enum (`images|videos|voiceover|music|sfx|captions|fonts|refs`).
- Rewrite all write-side call sites to the new helpers:
  - `cli/lib/providers/shared.ts:77` (`assets/<kind>/<file>` → `artifacts/<kind>/<file>`).
  - `cli/lib/composer.ts:162-165` (videos/voiceover/music/captions dirs).
  - `cli/lib/path-resolution.ts:109` (refs path → `artifacts/refs/`).
  - project scaffold (wherever new-project dirs are created) creates `artifacts/<kind>/` instead of `assets/<kind>/` + `refs/`.
- Read-side resolution falls back to legacy `assets/`/`refs/` when the new path is absent (back-compat window for #106).
- `grep -rn '"assets"\|'\''assets'\''\|"refs"\|'\''refs'\''' cli/` returns no project-path literals outside `paths.ts` (registry's global `refsDir()` for brand/persona refs is a separate concern — confirm it is NOT the per-project refs and leave it).
- Update `tests/unit/auto-version-invariant.test.ts` to the new layout (covers `image|video|voiceover|music|sfx|captions`) — adjust paths, do not weaken the v1+v2+v3 coexistence assertion.
- Update docs that describe the layout: `CLAUDE.md` "Project layout" section (the `assets/` "raw working dump" bullet), AGENTS.md invariant #14 (enumerated paths), `docs/agent-guide.md` / `docs/cli-spec.md` if they name `assets/`/`refs/`.
- Gates: `bun test` green; `bun run lint` (or repo lint suite) green.
- Cyrillic gate: `rg '\p{Cyrillic}' --pcre2` clean on all touched files.

## Notes

- Inner layout is a soft decision — the by-kind default above is the recommendation; an alternative (e.g. `artifacts/inputs/` vs `artifacts/generated/` top split) is welcome if it reads better for the agent. Decide before #106 runs, since the migration target depends on it.
- Cross-links: **#108** (workspaces layer + `.ralphy/` root — composes with this; the project dir moves, the inner `artifacts/` subtree is defined here), **#106** (unified data migration, sequence after both #105 and #108), **#107** (viewer reads this), **#012** (old-version archive subfolder — gains a home at `artifacts/<kind>/old/`; fold its layout choice into this decision), **#069** (`units/` unaffected).
- Watch AGENTS.md invariant #17 (background-job file hygiene): read-side back-compat must stay live until #106 completes so an in-flight job launched against `assets/` still resolves.
- `asset-manifest.json` path entries are rewritten by #106, not here — but the manifest writer must emit `artifacts/...` paths from this issue onward.
