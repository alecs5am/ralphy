# Companion-repo manifest still names `assets/uploaded/` destSubdirs

> **Status:** dropped (legacy — external ralphy-assets dependency; the CLI destSubdir fallback already lands installs correctly, and the #105/#106 layout migration is long done; flagged legacy by the user 2026-06-23)
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Found during the #109 sweep. `docs/assets-catalog.md` is auto-generated from
the `ralphy-assets` companion repo's manifest, whose `destSubdir` /
description strings still carry the legacy `assets/uploaded/...` form. The
CLI falls back to `artifacts` when `destSubdir` is absent, so installs work,
but the catalog doc and any explicit destSubdir keep teaching the old layout.

## What

A companion-repo pass: update `ralphy-assets` manifest `destSubdir` values to
`artifacts/<kind>` (or drop them to use the CLI default), then regenerate the
catalog here with `ralphy assets catalog --write` and commit the refreshed
`docs/assets-catalog.md`.

## Why it matters

The catalog is agent-facing routing input (AGENTS.md invariant #12); stale
paths in it are the same "stale prompt surface" defect class #109 closed for
this repo.

## Notes

- Requires a commit in `ralphy-assets` (outside this repo) — hence not folded
  into #109.
- Cross-links: #109 (done), #105/#106 (layout), AGENTS.md invariant #12.
