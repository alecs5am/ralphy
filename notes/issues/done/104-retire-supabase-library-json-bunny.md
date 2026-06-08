# Retire Supabase — the library is now one static `library.json` on Bunny CDN

> **Status:** done — 2026-06-08 (full migration: landing reads `library.json` via `index.ts`; CLI fetches it from Bunny; publish-entity edits `library.json` + uploads to Bunny; Supabase deps/MCP/scripts/`supabase/` dir removed; 915 unit tests + both typechecks green).
> **Filed:** 2026-06-08
> **Folder:** issues
> **Severity:** medium
> **Category:** library-v2 / backend / CLI / landing

## Context

The only remaining Supabase use was the content-library Postgres (`units`, `blocks`,
`unit_blocks`, `blueprints` — 42 / 73 / 6 rows). Storage had already moved to Bunny
CDN (June 2026). The committed `published.ts` mirror was a byte-faithful copy of the
live DB, and prod's no-creds OSS build already fell back to it. A dump-and-diff
(`sync-published-mirror --dry-run`) confirmed live == mirror exactly (42 units, 26
template + 16 recipe + 31 asset blocks, 6 blueprints). The data is tiny, append-only,
and has no complex queries (only select-all / filter-by-id / filter-by-kind /
filter-by-format; relations are denormalized onto the Unit). So the DB was vestigial.

User decision (2026-06-08): store the data as JSON in the repo, serve it to the CLI
from Bunny, drop the Supabase dependency and its limits.

## What changed

- **New single source of truth:** `landing/lib/library-v2/library.json`
  (`{ schemaVersion, formats, units, blocks (flat, each carries `kind`), blueprints }`),
  units stored newest-first (the feed order).
- **Landing:** `index.ts` imports `library.json` and builds the same lookup maps /
  helpers; `source.ts` is a thin static wrapper (no `@supabase/supabase-js`, no env
  switch). The 3 `/library` pages are unchanged (same import surface).
- **CLI:** `cli/lib/library/client.ts` fetches ONE `library.json` from Bunny
  (`https://ralphy.b-cdn.net/library/library.json`, override `RALPHY_LIBRARY_URL`;
  `file://` supported for tests) + 10-min disk cache; PostgREST / publishable key /
  snake→camel mappers removed. `blueprint use` now resolves from the committed
  `library.json` with a Bunny-client fallback (this closes the #079 global-binary gap).
- **Publish:** `landing/scripts/publish-entity.ts` appends/replaces by id in
  `library.json` + uploads media and the JSON to Bunny. No `pg`, no `SUPABASE_DB_URL`.
- **Removed:** `@supabase/supabase-js`, `pg`, `@types/pg`, `@aws-sdk/client-s3` (landing
  deps); the supabase MCP server (`.mcp.json`); the `supabase/` dir (migrations + seed);
  `catalog.ts` + `published.ts`; the one-shot scripts `seed-supabase`,
  `sync-published-mirror`, `rewrite-db-urls-to-bunny`, `migrate-storage-to-bunny`,
  `cleanup-supabase-storage`; the `library-mapper` test.
- **Docs:** `AGENTS.md`, `docs/developing-ralphy.md`, `docs/skills-vs-templates.md`
  updated to the `library.json` + Bunny model.

## Remaining / follow-ups

- **Upload `library.json` to Bunny once** (`library/library.json`) so the CLI default
  URL resolves — the next `publish-entity --push` does this automatically, or upload
  the committed file directly. Until then the CLI degrades gracefully (the in-repo /
  workspace tiers still work; the public tier warns).
- `RALPHY_LIBRARY_KEY` is gone (no key needed for a public CDN object).
