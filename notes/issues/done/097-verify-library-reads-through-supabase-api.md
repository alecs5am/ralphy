# Verify the whole library reads through the Supabase API (once it lands)

> **Status:** done — 2026-06-04 (#084 Supabase-as-source landed → gate satisfied. Audited: all 3 /library server pages fetch exclusively via source.ts; nothing imports catalog/published/index/supabase-js directly; every source.ts getter branches isSupabaseBacked()→live else static mirror; client islands take props. Verification note in lib/library-v2/MIGRATION.md.)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / backend

## Context

A Supabase-backed API for the library content is in progress (see #084 retire
repo `templates/` → Supabase as source, + #064 backend infra). Today the site
reads via `landing/lib/library-v2/source.ts`, which falls back to the static
catalog/published mirror when Supabase env is absent. The user wants: once the API
is finished, verify the ENTIRE library reads through it (no page silently stuck on
the static mirror or a bespoke path).

## What

When the Supabase API / data layer is complete, audit every library surface (feed,
unit page, block pages, blueprint modal, recommendation rails, tag cloud, search/
filters) and confirm each fetches via the single `source.ts` adapter against the
API — no page bypasses it, no stale static-only path. Reconcile the static mirror
(`published.ts`/`catalog.ts`) role: snapshot/offline fallback vs live source.

## Why it matters

A single data path is the contract that lets the library scale (#054/#065) and
keeps the published mirror honest; divergent fetch paths are how stale/missing data
creeps in.

## Scope / acceptance

- Every `/library` surface resolves its data through `source.ts` (→ the Supabase
  API when configured); none reads the static mirror directly except the documented
  offline fallback.
- The blueprints/blocks/units/tags all come through the same path (the recent
  Blueprint + Style→tag + asset-preview work all went via publish-entity → DB +
  mirror; confirm the READ side is unified too).
- A short verification note of what each surface fetches + from where.

## Notes

- GATED: do AFTER the Supabase API work (#084 / #064) lands — don't start until then.
- Cross-links #084 (Supabase as source), #064 (backend infra), #063 (entity model).
  Part of #086.
