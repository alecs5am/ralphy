# Streamed workspace export for large trend corpora

> **Status:** done — 2026-10-29 (package v3: chunked NDJSON rows with per-chunk hashes; 234k-video corpus copy exports in 9 s / 274 MB and imports in 26 s; v2 packages still import. Known gap: import holds the id map in memory, about 1.2 GiB peak on that corpus)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** domain store / portability

## Context

#556 found that `workspace.export` fails with an explicit error at roughly 21k trend videos: the package manifest is capped at 64 MiB. The approved dataset (`docs/research/trend-dataset-spec.md`) needs about 30k videos per niche and four niches, and portable transfer through `workspace.export` / `workspace.import` is the repository's rule for moving state.

## What

A streamed package format for large tables (at least the `trend_*` tables): rows written as chunked NDJSON (or the store's existing chunk mechanism if one fits) with per-chunk hashes, so manifest size no longer grows with row count. Import streams the chunks back and verifies hashes. Small workspaces keep the current format, or the new one is used everywhere if simpler; old packages stay importable.

## Scope / acceptance

- Export and import of a 120k-video synthetic corpus succeed with bounded memory; round trip is row-identical for every exported table (baseline caches excluded as today).
- Packages from the current format still import.
- Store, portable and migration tests pass; `docs/domain-store.md` updated.

## Outcome (2026-10-29)

Package version 3 writes every table as chunked NDJSON row entries
(`rows/<n>`, at most 10,000 rows or about 8 MiB; first line `{"table","columns"}`,
then one JSON array per row) with a per-chunk row count, size, and SHA-256 in
the manifest. The manifest no longer carries rows. Export spools the `trend_*`
tables from one read snapshot into a streaming ustar writer
(`cli/lib/store/internal-portable-archive.ts`) and copies files block by block.
Import indexes the archive headers only, reads and verifies one chunk at a time,
restores streamed rows chunk by chunk into the staging store, and copies them
into the store with `INSERT ... SELECT` from the attached, verified staging
database. A user-chosen file is streamed into a private store copy instead of
being read into memory. Version 2 packages still import
(`tests/fixtures/portable/v2-workspace.tar`, produced by the previous writer).

Measurements on a `.backup` copy of the scratch corpus (234,394 videos,
235,738 metric snapshots, 425,727 labels, 7,585 creators, 7,732 niche members;
Bun 1.4.4, Apple silicon, while a `trends niche init` ran on the source):

| Step | Time | Package | Peak RSS |
|---|---|---|---|
| export | 9.0 s | 274 MB (version 2 failed at ~21k videos) | 309 MiB |
| import into an empty library | 26 s | | ~1.2 GiB at commit; 2.2 GiB process max |

Synthetic corpus test (`tests/integration/portable-streamed.test.ts`): 20k
videos by default (export 0.5 s, import 2.2 s, 24 MB); 120k videos with
`RALPHY_PORTABLE_LARGE=1` (export 3.2 s, import 14.6 s, 147 MB, 29 s total
including seeding and row-by-row comparison). Both compare every exported table
row-identically after mapping ids back through the import receipt.

Remaining memory on import grows with entity count, not row payload: the
identity map (about 130 MB live for the corpus) and the import receipt, which
keeps the complete old-to-new mapping in one Run metadata row (about 30 MB of
JSON for the corpus) so `entityMapPage` stays complete. Moving the identity map
and receipt into SQLite would make import memory flat; not done here.
