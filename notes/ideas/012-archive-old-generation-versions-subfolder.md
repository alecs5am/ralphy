# Move archived generation versions into a subfolder instead of piling up next to the active file

> **Status:** idea
> **Filed:** 2026-06-03
> **Folder:** ideas

## Context

Auto-versioning on regen (issue #004, AGENTS.md invariant #14) preserves every prior version, but all versions land flat in the same directory as the active file: `gen.png`, `gen.v2.png`, `gen.v3.png`, … side by side. On projects with heavy re-roll history the asset folder becomes hard to browse — the current/active file is buried among its own superseded variants.

## What

When `protectExistingAsset()` archives a superseded version, move it into a dedicated subfolder next to the slot instead of leaving it as a sibling — e.g. `assets/old/` (or `assets/.versions/`, `assets/archive/`, per-slot `assets/<slot>/old/`). The active file stays at the canonical slot path; the version history lives one level down, out of the way. The naming inside the archive folder keeps the `.vN` scheme so provenance and ordering survive.

## Why it matters

Pure UX: the append-only guarantee is already correct, but the flat layout taxes every human (and agent `ls`) pass over `assets/`. A predictable archive location makes "show me the current state of the project" a one-glance operation while keeping the postmortem compare-v1-vs-v3 loop intact.

## Notes

- Candidate layouts to decide between: single `assets/old/` per project; hidden `assets/.versions/`; per-slot subfolder. "Old" is the user's first suggestion; something "smarter and more obvious" is explicitly welcome.
- Must stay consistent with `asset-manifest.json` version tracking — paths in the manifest need to follow the moved files.
- `tests/unit/auto-version-invariant.test.ts` (20-case lock-in from #004) asserts v1+v2+v3 coexist; it would need updating to the new layout, not weakening.
- Watch invariant #17 (background-job file hygiene): the archive move happens at generate time, which is fine, but any retroactive migration of existing projects must not touch files an in-flight job reads.
- `units/<slug>.v2/` dirs (#069) are a separate append-only scheme — out of scope here; this covers `assets/` slot files only.
- Explicitly not for implementation now — capture only (user request, 2026-06-03).
