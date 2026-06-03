# Publish Blueprints to the library (Storage + DB + published.ts)

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

`landing/scripts/publish-entity.ts` publishes Units (`--unit`) and Blocks (`--block-file`),
metadata + showcase media only. Blueprints (#074/#076) carry a heavier payload (prompts,
composition, hard-asset files) that must reach the library so the website/agent can read it.

## What

Add `publish-entity.ts --blueprint <dir>`: upload the blueprint payload — prompt files,
composition skeleton, **hard-asset files** (char masters, music, refs) — to Supabase Storage
under `blueprints/<unit-id>/...`, upsert a `blueprints` row (1:1 with its unit), and
append/replace in the committed open-source mirror (`published.ts` or a sibling
`published-blueprints.ts`). Idempotent by unit id, append-only (AGENTS #14).

## Why it matters

Closes the loop: the published Unit gains a downloadable, machine-readable reproduction
recipe. This is what makes `/library/u/<id>` self-sufficient.

## Scope / acceptance

- `--blueprint <dir>` dry-run + `--push`; uploads payload, writes the DB row, updates the mirror.
- **Object-size strategy** for big payloads vs the Supabase bucket cap (a real failure already
  hit on 56-80MB showcase mp4s, #073): chunk/zip or derive size-capped copies; never silently
  drop a file.
- Provenance/asset refs resolve (no warn-skip) for a published `choose-silenthill` blueprint.

## Notes

- Depends on #074, #076. Builds on #056 (publish primitive), #064 (backend infra), #073 (size cap).
