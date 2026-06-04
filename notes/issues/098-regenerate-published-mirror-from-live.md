# Regenerate `landing/lib/library-v2/published.ts` from the live DB (9 → 42 units)

> **Status:** issue (low-urgency hygiene; offline OSS fallback is stale)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** low (prod is unaffected — the live site reads live Supabase; only the no-creds OSS build falls back to this mirror)
> **Category:** landing / library-v2 / data

## What

The committed open-source mirror `landing/lib/library-v2/published.ts` is stale vs the live Supabase DB:
- mirror: ~9 units, ~13 template blocks, no style (folded by #6b7614f)
- live: 42 units, 26 template blocks, 16 recipes, 31 assets, 6 blueprints

`source.ts` reads the live DB when `NEXT_PUBLIC_SUPABASE_*` are set (prod) and only falls back to `published.ts` when they are not (OSS clone with no creds, some CI). So an OSS build of the landing currently shows a 9-unit library instead of 42.

## Fix

Regenerate the mirror from the live DB into the `// ralphy:published-*:start/end` sentinels (the format `landing/scripts/publish-entity.ts` already writes). Either extend that script with a "full dump" mode or add a small `scripts/sync-published-mirror.ts` that selects all `units` / `blocks` / `blueprints` and rewrites the three exported arrays. Use the read path (publishable key / `SUPABASE_DB_URL`), strip any local filesystem paths (a path-leak guard already exists from #6b7614f).

## Related

- #084 (retired the repo templates/ folder — this is its one residual). #086-#097 (library refactor; `#097` "verify library reads through the Supabase API" is the natural home for this).
