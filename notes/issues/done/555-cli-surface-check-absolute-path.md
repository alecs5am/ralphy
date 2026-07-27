# 555 — `cli:surface:check` was red for every checkout path but one

> **Status:** done — 2026-07-27
> **Filed:** 2026-07-27
> **Folder:** issues/done
> **Severity:** low
> **Category:** tooling / CI

## Context

`docs/cli-surface.generated.md` embedded a machine-absolute path. `ralphy memory
--help` interpolated `memoryDir({ tier: "global" })`, which resolves through
`dataRoot()` → `root()` → `process.cwd()`, so the generator
(`scripts/build-cli-surface.ts`, run with `cwd: repo`) baked the generating
machine's repo path into the committed doc:

```
Current dirs: /Users/<user>/github/ralphy/ralphy/.ralphy/memory
```

Consequence: `bun run cli:surface:check` only passed from a checkout at that
exact path — it failed in a git worktree, in a second clone, and in CI
(`.github/workflows/test.yml:95`, checkout `/home/runner/work/...`). It also
blocked the pre-push hook, which runs that check. Found 2026-07-27 while landing
#554: stale in a worktree AND in the main checkout, with no CLI-surface change
involved.

## What

Dropped the `Current dirs:` line from the `ralphy memory` help text. The
`Layout:` block two lines above already documents both tiers as root-relative
paths (`.ralphy/memory/`, `.ralphy/workspaces/<ws>/memory/`), so the absolute
line carried no information the help text didn't already have — and it was the
only absolute-path leak in the generated surface. `ralphy doctor` remains the
place that reports resolved roots.

## Why it matters

A lint that is red everywhere is a lint nobody reads — and it masked a genuinely
stale surface doc when a verb really did change.

## Scope / acceptance

- [x] `bun run cli:surface:check` passes from an arbitrary checkout path
      (verified from a `git worktree`).
- [x] No absolute host path in `docs/cli-surface.generated.md`
      (`rg '/Users/|/home/' docs/cli-surface.generated.md` empty).
- [x] Regenerated doc committed in the same change; `tsc` clean (the now-unused
      `memoryDir` import removed).
